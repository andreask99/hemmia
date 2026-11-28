/**
 * The owner's nightly email about the model catalogue (ops/catalog-job.sh; owner request
 * 2026-11-28: "clearer structured, how many new models, any I should try, and make it clear
 * when Qwen or Gemma has a newer version").
 *
 * Order: a one-line verdict, the models on this Mac (newer versions first), up to three picks
 * worth trying, then everything new grouped by model, removals, tonight's tests and a footer.
 * Pure: build.ts gathers the facts, this only words them (plain text and HTML).
 */
import {
  type CatalogModel,
  compareModelVersions,
  parseModelName,
  prettyModelName,
} from '@hemmia/relay-protocol';

export interface TestLine {
  model: string;
  ok: boolean;
  seconds: number;
  tools: boolean;
  vision: boolean;
  error: string | null;
}

export interface DigestInput {
  /** YYYY-MM-DD. */
  date: string;
  /** This Mac's memory (what "fits" means). */
  macMemoryGiB: number;
  /** Ollama models installed on this Mac; null when Ollama couldn't be asked. */
  installed: readonly string[] | null;
  /** The catalogue as it stands after tonight (published, or the last published one). */
  catalog: readonly CatalogModel[];
  /** The catalogue before tonight (null on the first run). */
  previous: readonly CatalogModel[] | null;
  published: boolean;
  tests: readonly TestLine[];
  /** Why tonight's run stopped or refused to publish, if it did. */
  problem: string | null;
  /** Catalogue entries waiting for a passed test. */
  waiting: number;
}

export interface Digest {
  /** Mail only when something happened. */
  send: boolean;
  subject: string;
  text: string;
  html: string;
}

/** "qwen3.8:27b" → "Qwen 3.8 27B" (shared with the hub). */
export const prettyName = prettyModelName;

/** The model without its size: "qwen3.8:27b" → "Qwen 3.8". */
const modelName = (ollamaModel: string) => prettyName(ollamaModel.split(':')[0] ?? ollamaModel);

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes < 10e9 ? 1 : 0)} GB`;

function downloads(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M downloads`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k downloads`;
  return `${n} downloads`;
}

function abilities(e: CatalogModel): string {
  const a = [e.tools ? 'tools' : null, e.vision ? 'pictures' : null, e.think ? 'thinking' : null];
  return a.filter(Boolean).join(', ') || 'chat only';
}

/** The first sentence of a description, at most ~110 characters. */
function blurb(d: string): string {
  const first = (/^.*?[.!?](\s|$)/.exec(d)?.[0] ?? d).trim();
  return first.length > 110 ? `${first.slice(0, 107).trimEnd()}…` : first;
}

const withTag = (m: string) => (m.includes(':') ? m : `${m}:latest`);

/** Same rule as the hub (apps/server/src/models/updates.ts successorOf), on catalogue entries. */
function successor(
  model: string,
  catalog: readonly CatalogModel[],
  memory: number,
): CatalogModel | null {
  const p = parseModelName(withTag(model));
  if (!p.version.length) return null;
  const newer = catalog.filter((e) => {
    if (e.minTotalMemoryGiB > memory) return false;
    const q = parseModelName(e.ollamaModel);
    return q.family === p.family && compareModelVersions(q.version, p.version) > 0;
  });
  const named = catalog.filter(
    (e) => e.minTotalMemoryGiB <= memory && e.supersedes.some((s) => withTag(s) === withTag(model)),
  );
  const all = [...named, ...newer];
  const dist = (e: CatalogModel) => {
    const a = parseModelName(e.ollamaModel).paramsB;
    return a === null || p.paramsB === null ? 99 : Math.abs(Math.log(a / p.paramsB));
  };
  all.sort(
    (a, b) =>
      compareModelVersions(
        parseModelName(b.ollamaModel).version,
        parseModelName(a.ollamaModel).version,
      ) ||
      dist(a) - dist(b) ||
      b.minTotalMemoryGiB - a.minTotalMemoryGiB,
  );
  return all[0] ?? null;
}

interface Mine {
  model: string;
  /** Newer version in the catalogue, if any. */
  next: CatalogModel | null;
  /** The same tag got new weights tonight. */
  reweighted: boolean;
}

interface NewModel {
  /** "qwen3.9" (the name without the size). */
  base: string;
  sizes: CatalogModel[];
  /** The biggest size that fits this Mac, if any. */
  fit: CatalogModel | null;
}

/** Facts for the email; exported for tests. */
export function analyse(input: DigestInput) {
  const prev = new Map((input.previous ?? []).map((e) => [e.ollamaModel, e]));
  const now = new Map(input.catalog.map((e) => [e.ollamaModel, e]));
  const added = input.previous ? input.catalog.filter((e) => !prev.has(e.ollamaModel)) : [];
  const removed = (input.previous ?? []).filter((e) => !now.has(e.ollamaModel));
  const reweighted = input.catalog.filter((e) => {
    const p = prev.get(e.ollamaModel);
    return p !== undefined && p.digest !== e.digest;
  });

  // Models on this Mac the catalogue knows (by family); local builds ("-dev") are skipped.
  const families = new Set(input.catalog.map((e) => parseModelName(e.ollamaModel).family));
  const mine: Mine[] = [];
  for (const m of input.installed ?? []) {
    const p = parseModelName(withTag(m));
    if (!families.has(p.family) || /(^|-)dev$/.test(p.base)) continue;
    mine.push({
      model: m,
      next: successor(m, input.catalog, input.macMemoryGiB),
      reweighted: reweighted.some((e) => withTag(e.ollamaModel) === withTag(m)),
    });
  }
  // Newer versions first, then by name.
  mine.sort(
    (a, b) => Number(b.next !== null) - Number(a.next !== null) || a.model.localeCompare(b.model),
  );

  const groups = new Map<string, CatalogModel[]>();
  for (const e of added) {
    const base = parseModelName(e.ollamaModel).base;
    groups.set(base, [...(groups.get(base) ?? []), e]);
  }
  const fresh: NewModel[] = [...groups].map(([base, sizes]) => {
    const params = (e: CatalogModel) => parseModelName(e.ollamaModel).paramsB ?? 0;
    const sorted = [...sizes].sort(
      (a, b) => params(a) - params(b) || a.downloadBytes - b.downloadBytes,
    );
    const fits = sorted.filter((e) => e.minTotalMemoryGiB <= input.macMemoryGiB);
    return { base, sizes: sorted, fit: fits[fits.length - 1] ?? null };
  });

  // Worth trying: new tonight, fits, tested (or a tested sibling), and not a family already on
  // this Mac (a newer Qwen or Gemma shows under "your models" instead). Tools first (Hemmia's
  // planner and shopping list need them), then downloads.
  const installedFamilies = new Set(
    (input.installed ?? []).map((m) => parseModelName(withTag(m)).family),
  );
  const picks = fresh
    .map((g) => g.fit)
    .filter((e): e is CatalogModel => e !== null)
    .filter((e) => !installedFamilies.has(parseModelName(e.ollamaModel).family))
    .sort((a, b) => Number(b.tools) - Number(a.tools) || b.pulls - a.pulls)
    .slice(0, 3);

  return { added, removed, reweighted, mine, fresh, picks };
}

export function buildDigest(input: DigestInput): Digest {
  const a = analyse(input);
  const updates = a.mine.filter((m) => m.next !== null || m.reweighted);
  const failed = input.tests.filter((t) => !t.ok);
  const problems = failed.length + (input.problem ? 1 : 0);
  const send =
    input.published ||
    input.tests.length > 0 ||
    input.problem !== null ||
    a.added.length > 0 ||
    a.removed.length > 0;

  // Subject: the most important thing first.
  const parts: string[] = [];
  if (updates.length) {
    const names = [...new Set(updates.map((m) => modelName(m.next?.ollamaModel ?? m.model)))];
    parts.push(`update for your models: ${names.join(', ')}`);
  }
  if (a.fresh.length) parts.push(`${a.fresh.length} new model${a.fresh.length === 1 ? '' : 's'}`);
  if (problems) parts.push(`${problems} problem${problems === 1 ? '' : 's'}`);
  if (!parts.length) parts.push(a.removed.length ? 'models removed' : 'nothing new for you');
  const subject = `Hemmia models: ${parts.join(' · ')}`;

  const T: string[] = [];
  const H: string[] = [];
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const h2 = (s: string) => {
    T.push('', s.toUpperCase(), '-'.repeat(s.length));
    H.push(
      `<h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b63;margin:28px 0 8px">${esc(s)}</h2>`,
    );
  };
  const card = (title: string, lines: string[], accent: string) => {
    T.push(title, ...lines.map((l) => `   ${l}`));
    H.push(
      `<div style="border-left:3px solid ${accent};padding:6px 12px;margin:8px 0">` +
        `<div style="font-weight:600">${esc(title)}</div>` +
        lines.map((l) => `<div style="color:#55554f;font-size:14px">${esc(l)}</div>`).join('') +
        '</div>',
    );
  };

  // Verdict.
  const verdict = [
    updates.length
      ? `${updates.length} of your models ${updates.length === 1 ? 'has' : 'have'} a newer version.`
      : input.installed === null
        ? 'Couldn’t ask Ollama which models are on this Mac.'
        : 'Your models are up to date.',
    a.fresh.length
      ? `${a.fresh.length} new model${a.fresh.length === 1 ? '' : 's'} in the catalogue` +
        (a.picks.length
          ? `, ${a.picks.length} worth trying.`
          : ', none that stand out for this Mac.')
      : 'No new models tonight.',
    problems ? `${problems} problem${problems === 1 ? '' : 's'}: see below.` : null,
  ].filter((x): x is string => x !== null);
  T.push(`Hemmia model catalogue, ${input.date}`, '', ...verdict);
  H.push(
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;color:#1f1f1c;line-height:1.45">`,
    `<div style="color:#6b6b63;font-size:13px">Hemmia model catalogue · ${esc(input.date)}</div>`,
    `<p style="font-size:17px;margin:6px 0 0">${verdict.map(esc).join('<br>')}</p>`,
  );

  // Your models.
  if (a.mine.length) {
    h2('Your models on this Mac');
    for (const m of a.mine) {
      if (m.next) {
        card(
          `⬆ ${prettyName(m.model)} → ${prettyName(m.next.ollamaModel)}`,
          [
            `Newer version, ${gb(m.next.downloadBytes)}, ${abilities(m.next)}${m.next.tested ? ', tested on this Mac' : ''}.`,
            `Settings → Models offers it, or: ollama pull ${m.next.ollamaModel}`,
          ],
          '#c2410c',
        );
      } else if (m.reweighted) {
        card(
          `⟳ ${prettyName(m.model)}: new weights`,
          [`Same version, re-published by Ollama: ollama pull ${m.model}`],
          '#c2410c',
        );
      } else {
        T.push(`✓ ${prettyName(m.model)}: up to date`);
        H.push(
          `<div style="padding:3px 0 3px 15px">✓ ${esc(prettyName(m.model))} <span style="color:#6b6b63">up to date</span></div>`,
        );
      }
    }
  }

  // Worth trying.
  if (a.picks.length) {
    h2('Worth trying');
    a.picks.forEach((e, i) => {
      card(
        `${i + 1}. ${prettyName(e.ollamaModel)}`,
        [
          blurb(e.description) || abilities(e),
          `${gb(e.downloadBytes)} · ${abilities(e)} · ${downloads(e.pulls)}${e.tested ? ' · tested on this Mac' : ''}`,
          `ollama pull ${e.ollamaModel}`,
        ],
        '#1f5f4a',
      );
    });
  }

  // Everything new.
  if (a.fresh.length) {
    h2(`New in the catalogue (${a.fresh.length})`);
    for (const g of a.fresh) {
      const sizes = g.sizes.map((e) => e.params.toUpperCase() || e.ollamaModel).join(', ');
      const fit = g.fit
        ? `fits this Mac up to ${g.fit.params.toUpperCase()}`
        : 'too big for this Mac';
      T.push(`• ${modelName(g.base)}: ${sizes} (${fit})`);
      H.push(
        `<div style="padding:3px 0">• <b>${esc(modelName(g.base))}</b> <span style="color:#6b6b63">${esc(sizes)} · ${esc(fit)}</span></div>`,
      );
    }
  }

  if (a.removed.length) {
    const groups = new Map<string, string[]>();
    for (const e of a.removed) {
      const base = parseModelName(e.ollamaModel).base;
      groups.set(base, [...(groups.get(base) ?? []), e.params.toUpperCase()]);
    }
    h2('Removed from the catalogue');
    for (const [base, sizes] of groups) {
      T.push(`• ${modelName(base)}: ${sizes.join(', ')}`);
      H.push(
        `<div style="padding:3px 0">• ${esc(modelName(base))} <span style="color:#6b6b63">${esc(sizes.join(', '))}</span></div>`,
      );
    }
    const note = 'Older versions leave when a newer one replaces them; installed copies stay.';
    T.push(note);
    H.push(`<div style="color:#6b6b63;font-size:13px">${esc(note)}</div>`);
  }

  if (input.tests.length || input.problem) {
    h2('Tonight on this Mac');
    const passed = input.tests.filter((t) => t.ok);
    if (passed.length) {
      const line = `${passed.length} test${passed.length === 1 ? '' : 's'} passed: ${passed.map((t) => prettyName(t.model)).join(', ')}`;
      T.push(line);
      H.push(`<div>${esc(line)}</div>`);
    }
    for (const t of failed) {
      const line = `✗ ${prettyName(t.model)} failed after ${t.seconds}s: ${t.error ?? 'unknown error'}`;
      T.push(line);
      H.push(`<div style="color:#b91c1c">${esc(line)}</div>`);
    }
    if (input.problem) {
      T.push(`✗ ${input.problem}`);
      H.push(`<div style="color:#b91c1c">✗ ${esc(input.problem)}</div>`);
    }
  }

  const footer =
    `Catalogue: ${input.catalog.length} sizes${input.published ? ', published tonight' : ', not published tonight'}` +
    `${input.waiting ? `; ${input.waiting} wait for a test` : ''}. This Mac: ${input.macMemoryGiB} GB.`;
  T.push('', footer);
  H.push(`<p style="color:#6b6b63;font-size:12px;margin-top:28px">${esc(footer)}</p></div>`);

  return { send, subject, text: `${T.join('\n')}\n`, html: H.join('\n') };
}
