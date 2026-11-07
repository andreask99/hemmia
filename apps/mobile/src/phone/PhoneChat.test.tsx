import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CloudClient } from '@hemmia/providers';
import type { ChatDeps } from './chat.ts';
import { createKeys } from './keys.ts';
import { modelsFor, PHONE_MODELS } from './models.ts';
import { PhoneChat } from './PhoneChat.tsx';
import type { PhoneStore, StoredChat } from './store.ts';

afterEach(cleanup);

describe('phone models', () => {
  it('bundles only Anthropic and OpenAI models and filters by the keys present', () => {
    expect(PHONE_MODELS.length > 0).toBe(true);
    expect(new Set(PHONE_MODELS.map((m) => m.provider))).toEqual(new Set(['anthropic', 'openai']));
    expect(modelsFor(new Set(['openai'])).every((m) => m.provider === 'openai')).toBe(true);
    expect(modelsFor(new Set())).toEqual([]);
  });
});

const chat: StoredChat = {
  id: 'chat0001',
  title: 'Trip',
  createdAt: 1,
  model: 'claude-sonnet',
  messages: [
    { id: 'msg00001', role: 'user', content: 'Where to?', createdAt: 2 },
    { id: 'msg00002', role: 'assistant', content: '**Sweden**', createdAt: 3, stopped: true },
  ],
};

function deps(): ChatDeps {
  const store = {
    savePhoto: () => Promise.resolve(),
    saveChat: () => Promise.resolve(),
    getPhoto: () => Promise.resolve(null),
  } as unknown as PhoneStore;
  const keys = createKeys({
    get: () => Promise.resolve({ value: null }),
    set: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  });
  const never = {} as CloudClient;
  return {
    store,
    keys,
    clients: { anthropic: never, openai: never },
    now: () => 5,
    newId: () => 'newid001',
  };
}

function renderChat() {
  render(
    <PhoneChat
      deps={deps()}
      chat={chat}
      models={PHONE_MODELS.filter((m) => m.provider === 'anthropic')}
      aboutMe=""
      onBack={() => undefined}
      onSaved={() => undefined}
      subscribeBackground={() => () => undefined}
      language="en"
    />,
  );
}

describe('PhoneChat', () => {
  it('shows the messages, the stopped marker, and Send only with text', () => {
    renderChat();
    expect(screen.getByText('Where to?')).toBeDefined();
    expect(screen.getByText('Sweden').tagName).toBe('STRONG');
    expect(screen.getByText('Stopped')).toBeDefined();
    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send' });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'And then?' } });
    expect(send.disabled).toBe(false);
  });

  it('explains a missing key in plain words', async () => {
    renderChat();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Add a key for this provider in Settings first.',
    );
  });
});
