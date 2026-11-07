import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const take = vi.fn<(token: string) => Promise<string | null>>();
vi.mock('../native/bridge.ts', () => ({
  native: {
    platform: 'ios',
    takePhoneExport: (t: string) => take(t),
    onPushTap: () => () => undefined,
    setSensitive: () => undefined,
  },
}));

const TOKEN = 'T'.repeat(43);
const EXPORT = JSON.stringify({
  format: 'Hemmia-phone-export',
  version: 1,
  exportedAt: 1,
  aboutMe: '',
  chats: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
  take.mockReset();
  window.history.replaceState(null, '', '/');
});

function open(answer: Response) {
  window.history.replaceState(null, '', `/import#phone~${TOKEN}`);
  const calls = stubFetch((url) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/import/phone') return answer;
    return json({ chats: [] });
  });
  renderRoute('/import');
  return calls;
}

describe('ImportPage', () => {
  it('takes the staged export once and imports it', async () => {
    take.mockResolvedValue(EXPORT);
    const calls = open(json({ chats: 3, messages: 9, photos: 2, photosSkipped: 1 }));
    expect((await screen.findByText('3 chats are now here.')).textContent).toBe(
      '3 chats are now here.',
    );
    expect(screen.getByText('1 photos could not be taken over.')).toBeDefined();
    expect(take).toHaveBeenCalledWith(TOKEN);
    const post = calls.filter((c) => c.url === '/api/import/phone');
    expect(post.length).toBe(1);
    expect(JSON.parse(post[0]?.init?.body as string)).toEqual(JSON.parse(EXPORT));
    expect(window.location.hash).toBe('');
  });

  it('explains when there is nothing to take', async () => {
    take.mockResolvedValue(null);
    const calls = open(json({}));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Nothing to import. Start again in the app: Settings → Move to Hemmia at home.',
    );
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/import/phone')).toBe(false);
    });
  });

  it('says when the hub refuses for now', async () => {
    take.mockResolvedValue(EXPORT);
    open(json({ error: { code: 'rate_limited' } }, 429));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many imports in a short time. Try again in an hour.',
    );
  });
});
