/** Delivery to Apple and Google, behind one interface so the API can be tested with a fake. */
import type { PushKind } from '@hemmia/relay-protocol';

export interface PushMessage {
  kind: PushKind;
  ref: string;
  /** The hub's hostname, so the app knows which hub to open. */
  hubHost: string;
  hubId: string;
}

export type SendResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  send(
    platform: 'ios' | 'android',
    env: 'production' | 'sandbox',
    token: string,
    message: PushMessage,
  ): Promise<SendResult>;
}

/** Records sends (tests) and answers with what `answer` says. */
export function createFakeSender(answer: (token: string) => SendResult = () => 'ok') {
  const sent: { platform: string; env: string; token: string; message: PushMessage }[] = [];
  const sender: PushSender = {
    send(platform, env, token, message) {
      sent.push({ platform, env, token, message });
      return Promise.resolve(answer(token));
    },
  };
  return { sender, sent };
}
