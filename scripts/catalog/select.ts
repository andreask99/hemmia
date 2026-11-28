/**
 * Which models and tags go into Hemmia's catalogue (P11.3), as pure functions so they can be
 * tested without the network. The job (build.ts) feeds them ollama.com's pages and registry
 * facts, then runs the checks.
 */
import {
  type CatalogModel,
  LibraryModelName,
  compareModelVersions,
  parseModelName,
  prettyModelName,
} from '@hemmia/relay-protocol';
import type { LibraryModel, LibraryTag } from './library.ts';

export const SELECT = {
  /** Most-pulled models taken after filtering. */
  popular: 30,
  /** Newest models taken (from the "newest" list) after filtering. */
  newest: 15,
  /** A newest model needs at least this many pulls (skips experiments nobody uses). */
  newestMinPulls: 20_000,
  /** Models not updated for this long are left out. */
  maxAgeDays: 548,
  /** Memory classes (total memory of a computer, GB) the catalogue offers a tag for. */
  classes: [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512],
  /** Share of total memory a model may use (macOS gives the GPU about 70-75%). */
  usable: 0.7,
};

const DAY_MS = 86_400_000;

function ageDays(day: string, today: string): number {
  return (Date.parse(today) - Date.parse(day)) / DAY_MS;
}

/** Specialist models a family assistant has no use for: safety filters, OCR, audio, … */
const SPECIALIST =
  /(^|-)(guard|guardian|ocr|embed|embedding|rerank|reranker|audio|omni|tts|asr)($|-)|^(translate|med)[a-z]/;

/** A chat model Hemmia can offer: not embedding/decision-only, has local sizes, recent. */
export function eligible(m: LibraryModel, today: string): boolean {
  if (m.capabilities.includes('embedding') || m.capabilities.includes('decision')) return false;
  if (SPECIALIST.test(m.name.replace(/[\d.]+/g, '-'))) return false;
  if (m.sizes.length === 0) return false;
  if (!m.updatedAt || ageDays(m.updatedAt, today) > SELECT.maxAgeDays) return false;
  return LibraryModelName.safeParse(`${m.name}:${m.sizes[0] ?? 'x'}`).success;
}

export interface Chosen {
  model: LibraryModel;
  popularRank: number | null;
  newRank: number | null;
}

/** The most pulled and the newest eligible models (`newest` in the library's own order). */
export function chooseModels(
  popular: LibraryModel[],
  newest: LibraryModel[],
  today: string,
): Chosen[] {
  const out = new Map<string, Chosen>();
  const pop = popular.filter((m) => eligible(m, today)).sort((a, b) => b.pulls - a.pulls);
  pop.slice(0, SELECT.popular).forEach((model, i) => {
    out.set(model.name, { model, popularRank: i + 1, newRank: null });
  });
  const fresh = newest.filter(
    (m) =>
      eligible(m, today) &&
      m.pulls >= SELECT.newestMinPulls &&
      ['tools', 'vision', 'thinking'].some((c) => m.capabilities.includes(c)),
  );
  fresh.slice(0, SELECT.newest).forEach((model, i) => {
    const had = out.get(model.name);
    out.set(model.name, { model, popularRank: had?.popularRank ?? null, newRank: i + 1 });
  });
  return [...out.values()];
}

/** The size tags of a model ("qwen3:30b") that run locally, as listed on its tags page. */
export function sizeTags(model: LibraryModel, tags: LibraryTag[]): LibraryTag[] {
  const byName = new Map(tags.map((t) => [t.model, t]));
  return model.sizes
    .map((s) => byName.get(`${model.name}:${s}`))
    .filter((t): t is LibraryTag => t !== undefined && !t.cloud && t.sizeBytes > 0)
    .filter((t) => LibraryModelName.safeParse(t.model).success);
}

/** Memory a model needs while answering (GiB): weights plus room for a 32k context. */
export function memoryFor(downloadBytes: number): number {
  const gib = downloadBytes / 1024 ** 3;
  return Math.round((gib * 1.15 + 2) * 10) / 10;
}

/** The smallest computer (total memory, GB) that runs it, or null when it's too big. */
export function memoryClass(memoryGiB: number): number | null {
  return SELECT.classes.find((c) => memoryGiB <= c * SELECT.usable) ?? null;
}

/** "qwen3:30b" → "qwen3 30B", "gemma4:e4b" → "gemma4 E4B". */
export function displayName(ollamaModel: string): string {
  return prettyModelName(ollamaModel).slice(0, 60);
}

/**
 * Per family (qwen, gemma, qwen-coder, …) and memory class, keep only the newest version's
 * largest tag: qwen3.8 replaces qwen3.6 for 32 GB, but qwen3.6 stays for a class qwen3.8 has
 * no tag in. Models without a version in their name are their own family.
 */
export function dedupe(entries: CatalogModel[]): CatalogModel[] {
  const best = new Map<string, CatalogModel>();
  for (const e of entries) {
    const p = parseModelName(e.ollamaModel);
    const key = `${p.version.length ? p.family : p.base}@${e.minTotalMemoryGiB}`;
    const had = best.get(key);
    if (!had) {
      best.set(key, e);
      continue;
    }
    const hp = parseModelName(had.ollamaModel);
    const v = compareModelVersions(p.version, hp.version);
    if (v > 0 || (v === 0 && e.downloadBytes > had.downloadBytes)) best.set(key, e);
  }
  const keep = new Set([...best.values()].map((e) => e.ollamaModel));
  return entries.filter((e) => keep.has(e.ollamaModel));
}

export interface Guard {
  ok: boolean;
  reason: string;
}

/** Refuses a catalogue that looks broken compared with the last one published. */
export function guard(
  next: CatalogModel[],
  previous: CatalogModel[] | null,
  libraryCount: number,
): Guard {
  if (libraryCount < 100) return { ok: false, reason: `only ${libraryCount} models parsed` };
  if (next.length < 5) return { ok: false, reason: `only ${next.length} entries` };
  if (!previous || previous.length === 0) return { ok: true, reason: 'first catalogue' };
  const kept = next.filter((e) => previous.some((p) => p.ollamaModel === e.ollamaModel)).length;
  if (kept < previous.length * 0.6) {
    return { ok: false, reason: `only ${kept} of ${previous.length} entries kept` };
  }
  // New models only arrive after passing a test, a few per night; many at once means trouble.
  const base = (n: string) => n.split(':')[0] ?? n;
  const before = new Set(previous.map((e) => base(e.ollamaModel)));
  const added = new Set(next.map((e) => base(e.ollamaModel)).filter((b) => !before.has(b))).size;
  if (added > 15) return { ok: false, reason: `${added} new models at once` };
  return { ok: true, reason: 'ok' };
}

/** True when anything but pull counts and the signing time changed. */
export function changed(next: CatalogModel[], previous: CatalogModel[] | null): boolean {
  if (!previous) return true;
  const strip = (es: CatalogModel[]) =>
    JSON.stringify(
      [...es]
        .sort((a, b) => a.ollamaModel.localeCompare(b.ollamaModel))
        .map((e) => ({ ...e, pulls: 0 })),
    );
  return strip(next) !== strip(previous);
}
