import { describe, expect, it } from 'vitest';
import { FetchRefusedError, type fetchPage } from '../security/webfetch.ts';
import { readLinkedPage } from './readpage.ts';

const signal = new AbortController().signal;
const body = 'Wir liefern innerhalb von drei Werktagen. '.repeat(5);

const serve =
  (result: Awaited<ReturnType<typeof fetchPage>> | Error): typeof fetchPage =>
  () =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result);

describe('readLinkedPage', () => {
  it('returns title, text and the link list', async () => {
    const page = await readLinkedPage('https://shop.example.org/versand', {
      signal,
      fetch: serve({
        url: 'https://shop.example.org/versand',
        contentType: 'html',
        body: `<title>Versand &amp; Lieferung</title><main><h1>Versand</h1><p>${body}</p></main>
          <footer><a href="/impressum">Impressum</a></footer>`,
      }),
    });
    expect(page).toMatchObject({ status: 'read', reason: null, title: 'Versand & Lieferung' });
    expect(page.text).toContain('drei Werktagen');
    expect(page.text).toContain(
      'Links on the page:\n- Impressum: https://shop.example.org/impressum',
    );
    expect(page.text).not.toContain('Opened as');
  });

  it('lists legal and contact links first', async () => {
    const nav = Array.from(
      { length: 60 },
      (_, i) => `<a href="/p${String(i)}">Produkt ${String(i)}</a>`,
    );
    const page = await readLinkedPage('https://shop.example.org/', {
      signal,
      fetch: serve({
        url: 'https://shop.example.org/',
        contentType: 'html',
        body: `<main><p>${body}</p>${nav.join('')}</main><footer><a href="/impressum">Impressum</a><a href="/privacy">Datenschutz</a></footer>`,
      }),
    });
    const links = page.text?.split('Links on the page:\n')[1]?.split('\n') ?? [];
    expect(links).toHaveLength(40);
    expect(links.slice(0, 3)).toEqual([
      '- Impressum: https://shop.example.org/impressum',
      '- Datenschutz: https://shop.example.org/privacy',
      '- Produkt 0: https://shop.example.org/p0',
    ]);
  });

  it('notes a redirect and reads plain text', async () => {
    const page = await readLinkedPage('https://example.org/a', {
      signal,
      fetch: serve({ url: 'https://example.org/b', contentType: 'text', body }),
    });
    expect(page.status).toBe('read');
    expect(page.text?.startsWith('(Opened as https://example.org/b)')).toBe(true);
  });

  it('marks a page without readable text', async () => {
    const page = await readLinkedPage('https://app.example.org/', {
      signal,
      fetch: serve({
        url: 'https://app.example.org/',
        contentType: 'html',
        body: '<title>App</title><div id="root"></div><script src="/app.js"></script>',
      }),
    });
    expect(page).toEqual({
      url: 'https://app.example.org/',
      title: '',
      status: 'unreadable',
      reason: 'empty',
      text: null,
    });
  });

  it('explains failures', async () => {
    const cases: [Error, string][] = [
      [new FetchRefusedError('address'), 'blocked'],
      [new FetchRefusedError('port'), 'blocked'],
      [new FetchRefusedError('status', { status: 404 }), 'not_found'],
      [new FetchRefusedError('status', { status: 403 }), 'forbidden'],
      [new FetchRefusedError('status', { status: 500 }), 'error'],
      [new FetchRefusedError('content_type', { contentType: 'application/pdf' }), 'pdf'],
      [new FetchRefusedError('content_type', { contentType: 'video/mp4' }), 'not_html'],
      [new FetchRefusedError('too_large'), 'too_large'],
      [new FetchRefusedError('redirects'), 'error'],
      [Object.assign(new Error('timed out'), { name: 'TimeoutError' }), 'timeout'],
      [Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), 'unreachable'],
    ];
    for (const [err, reason] of cases) {
      const page = await readLinkedPage('https://example.org/', { signal, fetch: serve(err) });
      expect({ status: page.status, reason: page.reason }).toEqual({
        status: 'unreadable',
        reason,
      });
    }
  });

  it('rethrows when the reply is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLinkedPage('https://example.org/', {
        signal: controller.signal,
        fetch: serve(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      }),
    ).rejects.toThrow('aborted');
  });
});
