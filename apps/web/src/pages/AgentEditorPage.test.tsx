import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const MODELS = {
  chatModels: [
    {
      id: 'quick',
      label: { en: 'Quick', de: 'Schnell' },
      description: null,
      engineModel: 'm:1b',
      details: null,
      vision: true,
      thinking: true,
      maxMessageChars: 65000,
    },
  ],
  imageModels: [],
  defaultChatModel: 'quick',
  defaultImageModel: null,
};
const TEMPLATE = {
  key: 'cook',
  name: 'Cook',
  emoji: '🧑‍🍳',
  description: 'Recipes',
  instructions: 'You cook.',
  examples: ['What can I cook?'],
  modelId: null,
  think: false,
  webSearch: true,
  images: false,
};
const FAMILY_AGENT = {
  ...TEMPLATE,
  id: 'a1',
  scope: 'family',
  editable: false,
  pinned: false,
  pinOrder: null,
  lastUsedAt: null,
  updatedAt: 1,
};

function setup(agents: object[] = []) {
  return stubFetch((url, init) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/models') return json(MODELS);
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/agents' && init?.method === 'POST')
      return json({ ...FAMILY_AGENT, id: 'new1', scope: 'personal', editable: true }, 201);
    if (url === '/api/agents') return json({ agents, templates: [TEMPLATE] });
    if (url === '/api/agents/draft')
      return json({
        name: 'Gärtner',
        emoji: '🌱',
        description: 'Garten',
        instructions: 'Du bist Gärtner.',
        examples: ['Wann Tomaten?'],
      });
    return undefined;
  });
}

const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AgentEditorPage', () => {
  it('drafts an agent from a sentence and saves it', async () => {
    const calls = setup();
    renderRoute('/agents/new');
    fireEvent.change(await screen.findByLabelText('Describe the agent in a sentence'), {
      target: { value: 'Hilft im Garten' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await vi.waitFor(() => {
      expect(value('agent-name')).toBe('Gärtner');
    });
    expect(value('agent-instructions')).toBe('Du bist Gärtner.');
    // The sentence stays in its own box; it is not the agent's description.
    expect(value('agent-describe')).toBe('Hilft im Garten');
    expect(value('agent-description')).toBe('Garten');
    const draft = calls.find((c) => c.url === '/api/agents/draft');
    expect(JSON.parse(draft?.init?.body as string)).toEqual({ description: 'Hilft im Garten' });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/agents' && c.init?.method === 'POST')).toBe(true);
    });
    const post = calls.find((c) => c.url === '/api/agents' && c.init?.method === 'POST');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      name: 'Gärtner',
      emoji: '🌱',
      description: 'Garten',
      instructions: 'Du bist Gärtner.',
      examples: ['Wann Tomaten?'],
      modelId: null,
      think: null,
      webSearch: true,
      images: true,
      family: false,
    });
  });

  it('revises a draft with a requested change', async () => {
    const calls = setup();
    renderRoute('/agents/new?template=cook');
    fireEvent.change(await screen.findByLabelText('Change something'), {
      target: { value: 'kürzer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    await vi.waitFor(() => {
      expect(value('agent-name')).toBe('Gärtner');
    });
    const draft = calls.find((c) => c.url === '/api/agents/draft');
    expect(JSON.parse(draft?.init?.body as string)).toMatchObject({
      description: 'Cook',
      change: 'kürzer',
      current: { name: 'Cook', instructions: 'You cook.' },
    });
  });

  it('starts from a template, including its settings', async () => {
    setup();
    renderRoute('/agents/new?template=cook');
    await vi.waitFor(() => {
      expect(value('agent-name')).toBe('Cook');
    });
    expect(value('agent-think')).toBe('off');
    expect((document.querySelector('input[name=images]') as HTMLInputElement).checked).toBe(false);
  });

  it('shows family agents read-only to members', async () => {
    setup([FAMILY_AGENT]);
    renderRoute('/agents/a1');
    await vi.waitFor(() => {
      expect(value('agent-name')).toBe('Cook');
    });
    expect((document.getElementById('agent-name') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText('A family agent: only admins can change it.')).toBeDefined();
  });

  it('says so when the agent does not exist', async () => {
    setup([]);
    renderRoute('/agents/nope');
    expect(await screen.findByText('This agent doesn’t exist anymore.')).toBeDefined();
  });
});
