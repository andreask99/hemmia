/**
 * Reads Ollama's public library pages (P11.3) for the weekly catalogue job: the model list
 * (https://ollama.com/library) and one model's tags page (/library/<name>/tags). Plain string
 * parsing of server-rendered HTML; the job's guards stop publishing when a page change breaks
 * this (too few models found).
 */

export interface LibraryModel {
  name: string;
  description: string;
  /** "tools", "vision", "thinking", "embedding", "audio", "decision", … */
  capabilities: string[];
  /** Size chips: "4b", "30b", "e4b". */
  sizes: string[];
  /** Offers cloud-run tags (on Ollama's servers). */
  cloud: boolean;
  pulls: number;
  /** YYYY-MM-DD of the last update, or "" if the page didn't say. */
  updatedAt: string;
}

export interface LibraryTag {
  /** "qwen3:30b". */
  model: string;
  /** First 12 hex digits of the manifest digest. */
  digest12: string;
  /** Largest size stated (a range like "16GB - 19GB" gives the upper end), in bytes. */
  sizeBytes: number;
  contextTokens: number;
  vision: boolean;
  /** Runs on Ollama's servers ("Low Usage" instead of a size). */
  cloud: boolean;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, (e) => ENTITIES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "44.2M" → 44200000, "40K" → 40000, "812" → 812. */
export function parseCount(s: string): number {
  const m = /^([\d.]+)\s*([KMB]?)$/i.exec(s.trim());
  if (!m) return 0;
  const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase()] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

/** "19GB" → bytes (decimal units, as Ollama shows them). */
export function parseSize(s: string): number {
  const m = /^([\d.]+)\s*(KB|MB|GB|TB)$/i.exec(s.trim());
  if (!m) return 0;
  const mult = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[(m[2] ?? '').toUpperCase()] ?? 0;
  return Math.round(Number(m[1]) * mult);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 10, 2025 8:18 PM UTC" → "2025-10-10", or "". */
export function parseDay(s: string): string {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(s.trim());
  if (!m) return '';
  const month = MONTHS.indexOf(m[1] ?? '');
  if (month < 0) return '';
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

export function parseLibrary(html: string): LibraryModel[] {
  const out: LibraryModel[] = [];
  const items = html.split(/<li\s+class="flex items-baseline/).slice(1);
  for (const raw of items) {
    const li = raw.slice(0, raw.indexOf('</li>') >= 0 ? raw.indexOf('</li>') : undefined);
    const name = /href="\/library\/([a-z0-9][a-z0-9._-]*)"/.exec(li)?.[1];
    if (!name) continue;
    const description = text(/<p class="max-w-lg[^"]*">([\s\S]*?)<\/p>/.exec(li)?.[1] ?? '');
    const chips = (cls: RegExp) =>
      [
        ...li.matchAll(
          /<span\s+class="inline-flex\s+items-center\s+rounded-md\s+([^\s"]+)[^"]*"\s*>([^<]*)<\/span>/g,
        ),
      ]
        .filter((m) => cls.test(m[1] ?? ''))
        .map((m) => text(m[2] ?? ''));
    const capabilities = chips(/^bg-indigo-50$/);
    const sizes = chips(/^bg-\[#ddf4ff\]$/);
    const cloud = chips(/^bg-cyan-50$/).includes('cloud');
    const pulls = parseCount(
      /<span\s*>([\d.]+[KMB]?)<\/span>\s*<span class="hidden sm:flex">(?:&nbsp;|\s)*Pulls/.exec(
        li,
      )?.[1] ?? '',
    );
    const updatedAt = parseDay(
      /<span class="flex items-center" title="([^"]+)">/.exec(li)?.[1] ?? '',
    );
    out.push({ name, description, capabilities, sizes, cloud, pulls, updatedAt });
  }
  return out;
}

export function parseTags(html: string, name: string): LibraryTag[] {
  const out: LibraryTag[] = [];
  const seen = new Set<string>();
  const re = new RegExp(
    `href="/library/(${name.replace(/[.]/g, '\\.')}:[a-z0-9._-]+)" class="md:hidden`,
    'g',
  );
  for (const m of html.matchAll(re)) {
    const model = m[1] ?? '';
    if (seen.has(model)) continue;
    seen.add(model);
    const end = html.indexOf('</a>', m.index);
    const line = text(html.slice(m.index, end < 0 ? undefined : end));
    // "qwen3:30b ad815644918f • 19GB • 256K context window • Text input • 1 year ago …"
    const parts = line.split('•').map((p) => p.trim());
    const digest12 = /\b([0-9a-f]{12})$/.exec(parts[0] ?? '')?.[1] ?? '';
    const sizeText = parts[1] ?? '';
    const cloud = /usage/i.test(sizeText);
    const sizes = [...sizeText.matchAll(/[\d.]+\s*(?:KB|MB|GB|TB)/gi)].map((s) => parseSize(s[0]));
    const ctx = /^([\d.]+)\s*([KM])\s+context window$/i.exec(parts[2] ?? '');
    const contextTokens = ctx
      ? Math.round(Number(ctx[1]) * ((ctx[2] ?? '').toUpperCase() === 'M' ? 1024 * 1024 : 1024))
      : 0;
    const vision = /\bImage\b/.test(parts[3] ?? '');
    if (!digest12) continue;
    out.push({ model, digest12, sizeBytes: Math.max(0, ...sizes), contextTokens, vision, cloud });
  }
  return out;
}
