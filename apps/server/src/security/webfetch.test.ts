import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FetchRefusedError,
  fetchImage,
  fetchPage,
  htmlToText,
  isPublicAddress,
  pageLinks,
} from './webfetch.ts';

describe('isPublicAddress', () => {
  it('refuses loopback, private, Tailscale (CGNAT), link-local and reserved ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.5.4',
      '192.168.1.36',
      '100.100.100.100',
      '169.254.169.254',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fd7a:115c:a1e0::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:192.168.1.1',
      '64:ff9b::7f00:1',
      '::7f00:1',
      '::127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it('allows public addresses', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:93.184.216.34']) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
});

describe('fetchPage refuses', () => {
  const refused = async (url: string, reason: string) => {
    await expect(fetchPage(url)).rejects.toMatchObject({ name: 'FetchRefusedError', reason });
  };

  it('non-web schemes, credentials and unusual ports', async () => {
    await refused('file:///etc/passwd', 'scheme');
    await refused('ftp://example.com/', 'scheme');
    await refused('https://user:pw@example.com/', 'credentials');
    await refused('http://example.com:8787/', 'port');
    await refused('not a url', 'bad_url');
  });

  it('the Mac itself and the home network, by address or by name', async () => {
    await refused('http://127.0.0.1/', 'address');
    await refused('http://[::1]/', 'address');
    await refused('http://192.168.1.1/', 'address');
    await refused('http://100.64.0.1/', 'address');
    await refused('http://localhost/', 'address');
  });
});

describe('fetchPage with a test server', () => {
  let server: Server;
  let base: string;
  const local = (a: string) => a === '127.0.0.1' || a === '::1';

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-encoding': 'gzip',
        });
        res.end(
          gzipSync(
            '<html><head><title>Öffnungszeiten</title></head><body><main><p>Mo–Fr 9–18 Uhr</p></main></body></html>',
          ),
        );
      } else if (req.url === '/to-page') {
        res.writeHead(302, { location: '/page' });
        res.end();
      } else if (req.url === '/to-private') {
        res.writeHead(302, { location: 'http://192.168.1.1/admin' });
        res.end();
      } else if (req.url === '/big') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('x'.repeat(300_000));
      } else if (req.url === '/bomb') {
        res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
        res.end(gzipSync(Buffer.alloc(5_000_000, 32)));
      } else if (req.url === '/pdf') {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end('%PDF');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  const opts = { addressAllowed: local, portAllowed: () => true };

  it('refuses the test server by default (it is on this Mac, and not on port 80/443)', async () => {
    await expect(fetchPage(`${base}/page`)).rejects.toBeInstanceOf(FetchRefusedError);
    await expect(fetchPage(`${base}/page`, { portAllowed: () => true })).rejects.toMatchObject({
      reason: 'address',
    });
  });

  it('reads compressed HTML and follows redirects', async () => {
    const page = await fetchPage(`${base}/to-page`, opts);
    expect(page.url).toBe(`${base}/page`);
    expect(page.contentType).toBe('html');
    expect(htmlToText(page.body)).toEqual({ title: 'Öffnungszeiten', text: 'Mo–Fr 9–18 Uhr' });
  });

  it('connects by host name through the checked lookup (Node asks it for all addresses)', async () => {
    const page = await fetchPage(`${base.replace('127.0.0.1', 'localhost')}/page`, opts);
    expect(page.contentType).toBe('html');
  });

  it('checks redirect targets again (no detour into the home network)', async () => {
    await expect(
      fetchPage(`${base}/to-private`, { ...opts, addressAllowed: (a) => local(a) }),
    ).rejects.toMatchObject({ reason: 'address' });
  });

  it('limits size before and after decompression, and content types', async () => {
    await expect(fetchPage(`${base}/big`, { ...opts, maxBytes: 100_000 })).rejects.toMatchObject({
      reason: 'too_large',
    });
    await expect(fetchPage(`${base}/bomb`, opts)).rejects.toMatchObject({ reason: 'too_large' });
    await expect(fetchPage(`${base}/pdf`, opts)).rejects.toMatchObject({
      reason: 'content_type',
      detail: { contentType: 'application/pdf' },
    });
    await expect(fetchPage(`${base}/missing`, opts)).rejects.toMatchObject({
      reason: 'status',
      detail: { status: 404 },
    });
  });
});

describe('fetchImage', () => {
  let server: Server;
  let base: string;
  const local = (a: string) => a === '127.0.0.1' || a === '::1';
  const opts = { addressAllowed: local, portAllowed: () => true };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/photo') {
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
      } else if (req.url === '/to-photo') {
        res.writeHead(301, { location: '/photo' });
        res.end();
      } else if (req.url === '/to-private') {
        res.writeHead(302, { location: 'http://10.0.0.1/cam.jpg' });
        res.end();
      } else if (req.url === '/vector') {
        res.writeHead(200, { 'content-type': 'image/svg+xml' });
        res.end('<svg/>');
      } else if (req.url === '/page') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<p>hi</p>');
      } else if (req.url === '/huge') {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(Buffer.alloc(200_000));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  it('applies the same address and scheme rules as pages', async () => {
    await expect(fetchImage(`${base}/photo`)).rejects.toBeInstanceOf(FetchRefusedError);
    await expect(fetchImage('http://169.254.169.254/latest')).rejects.toMatchObject({
      reason: 'address',
    });
    await expect(fetchImage('data:image/png;base64,AAAA')).rejects.toMatchObject({
      reason: 'scheme',
    });
    await expect(fetchImage(`${base}/to-private`, opts)).rejects.toMatchObject({
      reason: 'address',
    });
  });

  it('returns the bytes of JPEG, PNG or WebP images, following redirects', async () => {
    expect([...(await fetchImage(`${base}/to-photo`, opts))]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  it('refuses other content types and oversized images', async () => {
    await expect(fetchImage(`${base}/vector`, opts)).rejects.toMatchObject({
      reason: 'content_type',
    });
    await expect(fetchImage(`${base}/page`, opts)).rejects.toMatchObject({
      reason: 'content_type',
    });
    await expect(fetchImage(`${base}/huge`, { ...opts, maxBytes: 100_000 })).rejects.toMatchObject({
      reason: 'too_large',
    });
  });
});

describe('htmlToText', () => {
  it('keeps the main content, drops scripts, styles, navigation and comments', () => {
    const html = `<html><head><title>Rezept &amp; Tipps</title><style>body{}</style></head><body>
      <nav>Menü Home Kontakt</nav><main><h1>Apfelkuchen</h1><!-- tracking -->
      <p>200&nbsp;g Mehl &ndash; 3 Äpfel</p><script>alert("x")</script>
      <table><tr><td>Zeit</td><td>45 min</td></tr></table></main><footer>Impressum</footer></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('Rezept & Tipps');
    expect(text).toContain('Apfelkuchen');
    expect(text).toContain('200 g Mehl – 3 Äpfel');
    expect(text).toContain('Zeit | 45 min');
    expect(text).not.toMatch(/alert|Menü|Impressum|tracking|body\{/);
  });

  it('copes with broken markup and stays fast on hostile input', () => {
    expect(htmlToText('<p>offen <b>ohne Ende').text).toBe('offen ohne Ende');
    const hostile = '<script'.repeat(100_000) + '<div' + ' '.repeat(100_000);
    const start = performance.now();
    htmlToText(hostile);
    expect(performance.now() - start).toBeLessThan(500);
    expect(htmlToText('&#0; &#xD800; &#128512;').text).toBe('😀');
  });

  it('limits the length', () => {
    expect(htmlToText(`<p>${'a'.repeat(10_000)}</p>`, 100).text).toHaveLength(101);
  });
});

describe('pageLinks', () => {
  it('lists links with text, absolute and deduplicated, including the footer', () => {
    const html = `<nav><a href="/">Start</a></nav><main><p>Text <a class="x" href='produkte?id=1#top'>Unsere <b>Produkte</b></a></p></main>
      <footer><a href="/impressum">Impressum</a> <a href=/datenschutz>Daten&shy;schutz</a>
      <a href="mailto:info@example.org">Mail</a> <a href="#oben">Nach oben</a>
      <a href="javascript:alert(1)">x</a> <a href="/impressum">Impressum</a></footer>`;
    expect(pageLinks(html, 'https://shop.example.org/de/')).toEqual([
      { text: 'Start', url: 'https://shop.example.org/' },
      { text: 'Unsere Produkte', url: 'https://shop.example.org/de/produkte?id=1' },
      { text: 'Impressum', url: 'https://shop.example.org/impressum' },
      { text: 'Datenschutz', url: 'https://shop.example.org/datenschutz' },
    ]);
  });

  it('stops at the maximum and stays fast on hostile input', () => {
    const many = Array.from({ length: 100 }, (_, i) => `<a href="/p${String(i)}">${String(i)}</a>`);
    expect(pageLinks(many.join(''), 'https://example.org/', 5)).toHaveLength(5);
    const hostile = '<a href="'.repeat(50_000) + '<a ' + 'x'.repeat(100_000);
    const start = performance.now();
    pageLinks(hostile, 'https://example.org/');
    expect(performance.now() - start).toBeLessThan(500);
  });
});
