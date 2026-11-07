/**
 * Generating an image in a chat. Same shape as reply.ts: reserve the user's scheduler
 * slot, save the prompt as the user's message, stream progress, then save the reply with
 * the generated image encrypted as an attachment. Owned by Claude.
 */
import { randomInt } from 'node:crypto';
import type { Message, StreamEvent } from '@hemmia/shared';
import type { ImageModelConfig } from '../config/schema.ts';
import type { ChatRepo, UserKey } from '../db/chats.ts';
import type { ImageEngine } from '../imagegen/types.ts';
import type { Scheduler } from '../jobs/scheduler.ts';
import type { AttachmentStore } from '../security/attachments.ts';
import { wipe } from '../security/crypto.ts';

export const IMAGE_TIMEOUT_MS = 3 * 60_000;

export interface ImageDeps {
  repo: ChatRepo;
  scheduler: Scheduler;
  engine: ImageEngine;
  attachments: AttachmentStore;
}

export interface ImageInput {
  user: UserKey;
  chatId: string;
  model: ImageModelConfig;
  prompt: string;
}

export interface StartedImage {
  jobId: string;
  userMessage: Message;
  start: (sink: (event: StreamEvent) => void) => void;
  cancel: () => void;
  finished: Promise<void>;
}

export function startImage(deps: ImageDeps, input: ImageInput): StartedImage {
  const { repo, scheduler, engine, attachments } = deps;
  const { model } = input;
  const key: UserKey = { userId: input.user.userId, dek: Buffer.from(input.user.dek) };

  const pending: StreamEvent[] = [];
  let sink: ((event: StreamEvent) => void) | null = null;
  const send = (event: StreamEvent): void => {
    if (sink) sink(event);
    else pending.push(event);
  };
  let letRun: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    letRun = resolve;
  });

  let handle: ReturnType<Scheduler['submit']>;
  try {
    handle = scheduler.submit({
      userId: key.userId,
      chatId: input.chatId,
      kind: 'image',
      need: { engine: 'imagegen', model: model.mfluxModel, memoryGiB: model.memoryGiB },
      timeoutMs: IMAGE_TIMEOUT_MS,
      onQueued: (position) => {
        send({ type: 'queued', position });
      },
      onUnavailable: (code) => {
        send({ type: 'error', code });
      },
      run: async ({ signal }) => {
        await ready;
        await runImage(signal);
      },
    });
  } catch (err) {
    wipe(key.dek);
    throw err;
  }

  let userMessage: Message;
  try {
    userMessage = repo.addMessage(key, input.chatId, {
      role: 'user',
      content: input.prompt,
      modelId: null,
      status: 'done',
    });
  } catch (err) {
    scheduler.cancel(handle.id, key.userId);
    letRun();
    wipe(key.dek);
    throw err;
  }

  async function runImage(signal: AbortSignal): Promise<void> {
    let png: Buffer;
    try {
      png = await engine.generate({
        model: model.mfluxModel,
        ...(model.quantize !== undefined ? { quantize: model.quantize } : {}),
        prompt: input.prompt,
        width: model.width,
        height: model.height,
        steps: model.steps,
        seed: randomInt(0, 2 ** 31),
        signal,
        onLoading: () => {
          send({ type: 'loading', modelId: model.id });
        },
        onProgress: (step, steps) => {
          send({ type: 'progress', step, steps });
        },
      });
    } catch (err) {
      if (signal.aborted) {
        send({
          type: 'done',
          message: repo.addMessage(key, input.chatId, {
            role: 'assistant',
            content: '',
            modelId: model.id,
            status: 'cancelled',
          }),
        });
        return;
      }
      repo.addMessage(key, input.chatId, {
        role: 'assistant',
        content: '',
        modelId: model.id,
        status: 'error',
      });
      send({ type: 'error', code: 'model_error' });
      throw err;
    }
    // Save the reply, then attach the encrypted image to it.
    const reply = repo.addMessage(key, input.chatId, {
      role: 'assistant',
      content: '',
      modelId: model.id,
      status: 'done',
    });
    const attachment = await attachments.saveGenerated(key, png, reply.id);
    send({ type: 'image', attachment });
    send({ type: 'done', message: { ...reply, attachments: [attachment] } });
  }

  const finished = handle.finished.then(
    () => {
      wipe(key.dek);
    },
    () => {
      wipe(key.dek);
    },
  );

  return {
    jobId: handle.id,
    userMessage,
    start: (s) => {
      sink = s;
      for (const event of pending.splice(0)) s(event);
      letRun();
    },
    cancel: () => {
      scheduler.cancel(handle.id, key.userId);
      letRun();
    },
    finished,
  };
}
