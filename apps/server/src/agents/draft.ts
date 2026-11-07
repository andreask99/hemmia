/**
 * The model drafts or revises an agent from a one-sentence description. Runs as a normal
 * job on the GPU lane (queued like a chat reply) and answers in a fixed JSON shape.
 */
import { type AgentDraft, type AgentDraftRequest, AGENT_INSTRUCTIONS_MAX } from '@hemmia/shared';
import type { Scheduler } from '../jobs/scheduler.ts';
import type { MemoryUnavailableError } from '../jobs/memory.ts';
import { LlmError, type LlmClient } from '../llm/types.ts';
import { isCloud, type ResolvedChatModel } from '../models/types.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    emoji: { type: 'string' },
    description: { type: 'string' },
    instructions: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'emoji', 'description', 'instructions', 'examples'],
};

export function draftPrompt(req: AgentDraftRequest, language: 'en' | 'de'): string {
  const lang = language === 'de' ? 'German' : 'English';
  return [
    'You write agent definitions for a private family chat app. An agent is a role the assistant takes on.',
    'Return JSON with:',
    '- name: at most 3 words',
    '- emoji: one emoji that fits',
    '- description: at most 10 words, what the agent is for',
    `- instructions: the role, addressed to the assistant ("You are …"), 3 to 6 short lines, at most 600 characters: who it is, what it helps with, how it answers (style, length, format), and any limits that matter for this role. Be specific to the role. No generic advice such as "be helpful", "be accurate" or "be friendly", no safety boilerplate, no markdown headings.`,
    '- examples: 3 short things a user would ask this agent',
    `Write everything in ${lang}.`,
    '',
    `The user describes the agent as: ${req.description}`,
    ...(req.current
      ? [
          '',
          `Current draft (JSON): ${JSON.stringify(req.current)}`,
          `Revise it with this change: ${req.change ?? 'improve it'}. Keep what the change doesn't touch.`,
        ]
      : []),
  ].join('\n');
}

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/** Normalises the model's JSON into a valid draft (lengths clipped, at most 3 examples). */
export function toDraft(raw: unknown): AgentDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const draft: AgentDraft = {
    name: clip(r.name, 40),
    // At most two emoji, counted as people see them (ZWJ sequences like 🧑‍🍳 are one).
    emoji:
      Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clip(r.emoji, 16)),
      )
        .slice(0, 2)
        .map((g) => g.segment)
        .join('') || '✨',
    description: clip(r.description, 120),
    instructions: clip(r.instructions, AGENT_INSTRUCTIONS_MAX),
    examples: (Array.isArray(r.examples) ? r.examples : [])
      .map((e) => clip(e, 140))
      .filter(Boolean)
      .slice(0, 3),
  };
  return draft.name && draft.instructions ? draft : null;
}

export class DraftUnavailableError extends Error {
  override name = 'DraftUnavailableError';
  readonly code: MemoryUnavailableError['code'] | 'failed';
  constructor(code: MemoryUnavailableError['code'] | 'failed') {
    super(code);
    this.code = code;
  }
}

/** Runs the draft job. Throws BusyError (scheduler) or DraftUnavailableError. */
export async function draftAgent(
  deps: { llm: LlmClient; scheduler: Scheduler },
  user: { userId: string; language: 'en' | 'de' },
  model: ResolvedChatModel,
  req: AgentDraftRequest,
): Promise<AgentDraft> {
  // Drafting runs in Ollama only (the route never picks a cloud model; this makes sure).
  if (isCloud(model) || model.engine !== 'ollama') throw new DraftUnavailableError('failed');
  let text = '';
  let unavailable: MemoryUnavailableError['code'] | null = null;
  const handle = deps.scheduler.submit({
    userId: user.userId,
    kind: 'chat',
    need: { engine: 'ollama', model: model.ollamaModel, memoryGiB: model.memoryGiB },
    releaseAfter: model.unloadAfterUse,
    timeoutMs: 3 * 60_000,
    onUnavailable: (code) => {
      unavailable = code;
    },
    run: async ({ signal }) => {
      const ask = async (format: typeof SCHEMA | undefined) => {
        for await (const chunk of deps.llm.chat({
          model: model.ollamaModel,
          messages: [{ role: 'user', content: draftPrompt(req, user.language) }],
          think: false,
          contextTokens: 8192,
          maxOutputTokens: 1200,
          keepAliveSeconds: model.unloadAfterUse ? 0 : 300,
          ...(format ? { format } : {}),
          signal,
        })) {
          if (chunk.type === 'content') text += chunk.text;
        }
      };
      try {
        await ask(SCHEMA);
      } catch (err) {
        // Ollama's MLX models (qwen3.8) reject structured output: rely on the prompt instead.
        if (!(err instanceof LlmError && err.code === 'unsupported')) throw err;
        text = '';
        await ask(undefined);
      }
    },
  });
  const outcome = await handle.finished;
  // Set in a callback: read through a function so the check isn't narrowed away.
  const why = (): MemoryUnavailableError['code'] | null => unavailable;
  const code = why();
  if (code) throw new DraftUnavailableError(code);
  if (outcome !== 'done') throw new DraftUnavailableError('failed');
  let parsed: unknown;
  try {
    // Without a schema the model may wrap the JSON in a code fence or a sentence.
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new DraftUnavailableError('failed');
  }
  const draft = toDraft(parsed);
  if (!draft) throw new DraftUnavailableError('failed');
  return draft;
}
