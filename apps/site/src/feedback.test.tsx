// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Feedback, showsFeedback } from './Feedback.tsx';
import { enhanceFeedback } from './enhance.ts';

describe('feedback form', () => {
  it('is shown on the install pages only', () => {
    expect(showsFeedback('guides/mac')).toBe(true);
    expect(showsFeedback('download')).toBe(true);
    expect(showsFeedback('')).toBe(false);
    expect(showsFeedback('legal/privacy')).toBe(false);
  });

  it('posts the message to the relay as text/plain and thanks', async () => {
    document.body.innerHTML = renderToStaticMarkup(<Feedback lang="en" slug="guides/mac" />);
    const send = vi.fn(async (_url: string, _init: { headers: unknown; body: string }) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    enhanceFeedback(document, send as unknown as typeof fetch);
    const form = document.querySelector('form');
    expect(form?.hidden).toBe(false);
    (document.getElementById('feedback-message') as HTMLTextAreaElement).value = ' Help ';
    form?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.feedback-status')?.textContent).toContain('Thank you');
    });
    const [url, init] = send.mock.calls[0] ?? ['', { headers: null, body: 'null' }];
    expect(url).toBe('https://api.hemmia.app/v1/feedback');
    expect(init.headers).toEqual({ 'content-type': 'text/plain' });
    expect(JSON.parse(init.body)).toEqual({
      message: 'Help',
      source: 'site',
      lang: 'en',
      page: '/guides/mac',
    });
  });
});
