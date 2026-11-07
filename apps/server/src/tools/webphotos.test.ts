import { describe, expect, it } from 'vitest';
import type { AttachmentRef, WebSource } from '@hemmia/shared';
import { findPhotos, photoCandidates, ShowPhotosArgs } from './webphotos.ts';

const result = (n: number, extra: Record<string, unknown> = {}) => ({
  url: `https://page${String(n)}.example/a`,
  img_src: `https://img${String(n)}.example/a.jpg`,
  title: `Photo ${String(n)}`,
  ...extra,
});

describe('photoCandidates', () => {
  it('keeps web images with a web page, best first, without repeats', () => {
    const got = photoCandidates({
      results: [
        result(1, { thumbnail_src: 'https://t.example/1.jpg', resolution: '1056×1600' }),
        result(2, { img_src: 'javascript:alert(1)' }),
        result(3, { url: 'file:///etc/passwd' }),
        result(4, { img_format: 'SVG' }),
        result(5, { img_src: 'https://img5.example/anim.gif' }),
        result(6, { resolution: '120 x 90' }),
        result(7, { img_src: 'https://img1.example/a.jpg' }),
        result(8, { url: 'https://page1.example/a' }),
        result(9, { title: null, thumbnail_src: 'data:image/png;base64,AA', resolution: '?' }),
        { title: 'missing fields' },
      ],
    });
    expect(got).toEqual([
      {
        imageUrl: 'https://img1.example/a.jpg',
        thumbnailUrl: 'https://t.example/1.jpg',
        source: { title: 'Photo 1', url: 'https://page1.example/a' },
      },
      {
        imageUrl: 'https://img9.example/a.jpg',
        thumbnailUrl: null,
        source: { title: '', url: 'https://page9.example/a' },
      },
    ]);
  });

  it('returns nothing for unexpected JSON', () => {
    expect(photoCandidates({ nope: true })).toEqual([]);
    expect(photoCandidates(null)).toEqual([]);
  });
});

describe('ShowPhotosArgs', () => {
  it('defaults and clamps the count', () => {
    expect(ShowPhotosArgs.parse({ query: ' Elch ' })).toEqual({ query: 'Elch', count: 3 });
    expect(ShowPhotosArgs.parse({ query: 'x', count: '1' }).count).toBe(1);
    expect(ShowPhotosArgs.parse({ query: 'x', count: 9 }).count).toBe(3);
    expect(ShowPhotosArgs.safeParse({ query: '' }).success).toBe(false);
  });
});

describe('findPhotos', () => {
  const ref = (n: number, source: WebSource): AttachmentRef => ({
    id: `00000000-0000-4000-8000-00000000000${String(n)}`,
    kind: 'web',
    mime: 'image/jpeg',
    width: 10,
    height: 10,
    name: null,
    pages: null,
    scanPages: 0,
    source,
  });

  it('asks SearXNG for images with the safe search level and stops at the count', async () => {
    const urls: string[] = [];
    const saved: string[] = [];
    const found = await findPhotos('Elch im Schnee', 2, {
      searxngUrl: 'http://127.0.0.1:8888',
      safeSearch: 2,
      language: 'de',
      signal: new AbortController().signal,
      fetchJson: (input) => {
        urls.push(input instanceof Request ? input.url : input.toString());
        return Promise.resolve(Response.json({ results: [1, 2, 3].map((n) => result(n)) }));
      },
      fetchBytes: (url) => Promise.resolve(Buffer.from(url)),
      save: (bytes, source) => {
        saved.push(bytes.toString());
        return Promise.resolve(ref(saved.length, source));
      },
    });
    const query = new URL(urls[0] ?? '').searchParams;
    expect(query.get('categories')).toBe('images');
    expect(query.get('safesearch')).toBe('2');
    expect(query.get('language')).toBe('de');
    expect(query.get('q')).toBe('Elch im Schnee');
    expect(saved).toEqual(['https://img1.example/a.jpg', 'https://img2.example/a.jpg']);
    expect(found.photos).toHaveLength(2);
    expect(found.search).toEqual({
      query: 'Elch im Schnee',
      sources: [
        { title: 'Photo 1', url: 'https://page1.example/a' },
        { title: 'Photo 2', url: 'https://page2.example/a' },
      ],
    });
    expect(found.toolResult).toContain('Shown 2 photos');
    expect(found.toolResult).toContain('page1.example, page2.example');
  });

  it('fails when the search service is down', async () => {
    await expect(
      findPhotos('x', 3, {
        searxngUrl: 'http://127.0.0.1:8888',
        safeSearch: 1,
        language: 'en',
        signal: new AbortController().signal,
        fetchJson: () => Promise.resolve(new Response('', { status: 502 })),
        save: () => Promise.reject(new Error('unused')),
      }),
    ).rejects.toThrow('search failed');
  });
});
