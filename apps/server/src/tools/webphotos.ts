/**
 * The show_photos tool: an image search through SearXNG on this Mac. The server downloads
 * the best few images itself (public addresses only, see security/webfetch.ts) and stores
 * them re-encoded and encrypted like other attachments, so the phone never contacts the
 * image hosts and the CSP stays 'self'. Queries, URLs and images are never logged.
 */
import { z } from 'zod';
import type { AttachmentRef, WebSearch, WebSource } from '@hemmia/shared';
import type { ToolSpec } from '../llm/types.ts';
import { fetchImage } from '../security/webfetch.ts';

export const SHOW_PHOTOS_TOOL: ToolSpec = {
  name: 'show_photos',
  description:
    'Show the user 1-3 real photos from a web image search; they appear below your answer. Use it when seeing the ' +
    'real thing helps: what an animal, plant, place, landmark, building, dish, object, vehicle or artwork looks like, ' +
    'or when the user asks for photos or pictures of something that exists. Prefer it to create_image for real ' +
    'things. Not for private people, and not when a picture adds nothing.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'What the photos should show, as a short image search (a few words, e.g. "red panda", ' +
          '"Neuschwanstein castle winter"). Do not include private details about the user.',
      },
      count: {
        type: 'integer',
        description: 'How many photos to show, 1 to 3 (default 3; 1 when one picture says it all).',
      },
    },
    required: ['query'],
  },
};

export const ShowPhotosArgs = z.object({
  query: z.string().trim().min(1).max(200),
  count: z.coerce.number().int().min(1).max(3).catch(3),
});

export const MAX_PHOTOS = 3;
/** Candidates downloaded in parallel; spares cover hosts that refuse or send junk. */
const CANDIDATES = 8;
const IMAGE_TIMEOUT_MS = 6000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Smaller images look poor in the chat (when the engine reports a size). */
const MIN_SIDE = 300;

const SearxImages = z.object({
  results: z.array(
    z.object({
      url: z.string().catch(''),
      img_src: z.string().catch(''),
      thumbnail_src: z.string().nullish().catch(null),
      title: z.string().nullish().catch(null),
      resolution: z.string().nullish().catch(null),
      img_format: z.string().nullish().catch(null),
    }),
  ),
});

export interface PhotoCandidate {
  imageUrl: string;
  /** The engine's small copy, tried when the original can't be fetched. */
  thumbnailUrl: string | null;
  source: WebSource;
}

const webUrl = (u: string | null | undefined): string | null => {
  if (!u || u.length > 2000) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/** Usable photos from SearXNG's image results, best first, without repeats. */
export function photoCandidates(json: unknown): PhotoCandidate[] {
  const parsed = SearxImages.safeParse(json);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: PhotoCandidate[] = [];
  for (const r of parsed.data.results) {
    const imageUrl = webUrl(r.img_src);
    const page = webUrl(r.url);
    if (!imageUrl || !page) continue;
    const format = `${r.img_format ?? ''} ${new URL(imageUrl).pathname}`.toLowerCase();
    if (/svg|gif/.test(format)) continue;
    const size = /(\d+)\s*[x×]\s*(\d+)/.exec(r.resolution ?? '');
    if (size && Math.min(Number(size[1]), Number(size[2])) < MIN_SIDE) continue;
    if (seen.has(imageUrl) || seen.has(page)) continue;
    seen.add(imageUrl);
    seen.add(page);
    out.push({
      imageUrl,
      thumbnailUrl: webUrl(r.thumbnail_src),
      source: { title: clean(r.title ?? '', 300), url: page },
    });
  }
  return out;
}

export interface PhotoSearchOptions {
  searxngUrl: string;
  /** 0 off, 1 moderate, 2 strict (teen accounts). */
  safeSearch: 0 | 1 | 2;
  language: 'en' | 'de';
  signal: AbortSignal;
  /** Validates, re-encodes and stores one downloaded image; throws if it isn't a usable image. */
  save: (bytes: Buffer, source: WebSource) => Promise<AttachmentRef>;
  /** Tests: replace the network. */
  fetchJson?: typeof fetch;
  fetchBytes?: (url: string, signal: AbortSignal) => Promise<Buffer>;
}

export interface PhotoSearchResult {
  photos: AttachmentRef[];
  /** Shown in the reply like a web search (every query that left the house is visible). */
  search: WebSearch;
  toolResult: string;
}

const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, '');

/** Runs one image search and stores up to `count` photos for the reply. */
export async function findPhotos(
  query: string,
  count: number,
  options: PhotoSearchOptions,
): Promise<PhotoSearchResult> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'images',
    language: options.language,
    safesearch: String(options.safeSearch),
  });
  const res = await (options.fetchJson ?? fetch)(
    `${options.searxngUrl}/search?${params.toString()}`,
    {
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]),
      headers: { accept: 'application/json', 'x-real-ip': '127.0.0.1' },
    },
  );
  if (!res.ok) throw new Error('search failed');
  const candidates = photoCandidates(await res.json()).slice(0, CANDIDATES);

  // Download all candidates at once; keep the first good ones in result order.
  const spare = new AbortController();
  const signal = AbortSignal.any([options.signal, spare.signal]);
  const get =
    options.fetchBytes ??
    ((url: string, s: AbortSignal) =>
      fetchImage(url, { signal: s, timeoutMs: IMAGE_TIMEOUT_MS, maxBytes: IMAGE_MAX_BYTES }));
  const download = async (c: PhotoCandidate): Promise<Buffer | null> => {
    for (const url of [c.imageUrl, c.thumbnailUrl]) {
      if (!url || signal.aborted) continue;
      try {
        return await get(url, signal);
      } catch {
        // refused, unreachable, too slow or too big: try the thumbnail, then the next one
      }
    }
    return null;
  };
  const downloads = candidates.map((c) => download(c));
  const wanted = Math.min(Math.max(1, count), MAX_PHOTOS);
  const photos: AttachmentRef[] = [];
  try {
    for (const [i, pending] of downloads.entries()) {
      if (photos.length >= wanted) break;
      const bytes = await pending;
      const candidate = candidates[i];
      if (!bytes || !candidate) continue;
      if (options.signal.aborted) throw new Error('aborted');
      try {
        photos.push(await options.save(bytes, candidate.source));
      } catch {
        // not a usable image (broken, unsupported format, decompression bomb)
      }
    }
  } finally {
    spare.abort();
    await Promise.allSettled(downloads);
  }

  const sources = photos.flatMap((p) => (p.source ? [p.source] : []));
  const hosts = [...new Set(sources.map((s) => hostOf(s.url)))];
  const toolResult =
    photos.length === 0
      ? `No photos found for "${query}". Do not mention photos; answer without them.`
      : `Shown ${String(photos.length)} photo${photos.length === 1 ? '' : 's'} of "${query.replace(/"/g, "'")}" ` +
        `below your answer (from ${hosts.join(', ')}). You cannot see them: do not describe them, do not add ` +
        'image links or Markdown images, and do not call show_photos again. Now write your answer.';
  return { photos, search: { query, sources }, toolResult };
}
