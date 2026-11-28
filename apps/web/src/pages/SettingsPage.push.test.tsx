import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const push = vi.hoisted(() => ({
  pushState: vi.fn(() => Promise.resolve('off')),
  enablePush: vi.fn(() => Promise.resolve('off')),
  disablePush: vi.fn(() => Promise.resolve('off')),
}));
vi.mock('../push/push.ts', () => ({ ...push, resyncPush: () => Promise.resolve() }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Notifications setting', () => {
  it('says so when turning on fails instead of quietly staying off', async () => {
    stubFetch((url) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') {
        return json({
          chatModels: [],
          imageModels: [],
          defaultChatModel: 'quick',
          defaultImageModel: null,
        });
      }
      if (url === '/api/chats') return json({ chats: [] });
      if (url === '/api/me/sessions') return json({ sessions: [] });
      return undefined;
    });
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t be turned on');
    expect(push.enablePush).toHaveBeenCalledOnce();

    push.enablePush.mockResolvedValueOnce('on');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('On for this device.')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
