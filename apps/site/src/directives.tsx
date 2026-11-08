/**
 * Markdown with a few directives written as HTML comments, so the files still read well as
 * plain Markdown (WEBSITE.md §2):
 *   <!-- steps -->…<!-- /steps -->      numbered step cards (one per "## " heading inside)
 *   <!-- note -->…<!-- /note -->        a highlighted note
 *   <!-- screenshot name="m4-connected" alt="…" -->
 *   <!-- download -->                   the download buttons
 *   <!-- diagram name="how" -->         an inline SVG diagram (src/diagrams.tsx)
 *   <!-- cards -->…<!-- /cards -->      link cards, one per line inside:
 *                                       "- <pose> | [Title](/path/) | Description"
 */
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Lang } from './content.ts';
import { DIAGRAMS, type DiagramName, isDiagram } from './diagrams.tsx';
import { GhostPose, isPose, type Pose } from './ghosts.tsx';
import { type ShotSize, shotPath } from './screenshots.ts';

export type Block =
  | { kind: 'md'; text: string }
  | { kind: 'steps'; steps: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'screenshot'; name: string; alt: string }
  | { kind: 'download' }
  | { kind: 'diagram'; name: DiagramName }
  | { kind: 'cards'; cards: Card[] };

export interface Card {
  pose: Pose;
  title: string;
  href: string;
  text: string;
}

const OPEN = /<!--\s*(steps|note|screenshot|download|diagram|cards)\b([^>]*?)-->/;

/** The lines of a cards block: "- <pose> | [Title](/path/) | Description". */
export function parseCards(inner: string): Card[] {
  return inner
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^- ([a-z]+) \| \[([^\]]{1,80})\]\((\/[^)\s]*)\) \| (.{1,300})$/.exec(line);
      if (!m) throw new Error(`bad card line: ${line}`);
      const [, pose = '', title = '', href = '', text = ''] = m;
      if (!isPose(pose)) throw new Error(`unknown pose "${pose}"`);
      return { pose, title, href, text };
    });
}

/** Splits Markdown into plain parts and directive blocks. */
export function parseBlocks(md: string): Block[] {
  const out: Block[] = [];
  let rest = md;
  for (;;) {
    const m = OPEN.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push({ kind: 'md', text: rest.slice(0, m.index) });
    const name = m[1] ?? '';
    rest = rest.slice(m.index + m[0].length);
    if (name === 'screenshot') {
      const n = /name="([a-z0-9-]{1,60})"/.exec(m[2] ?? '');
      if (!n?.[1]) throw new Error('screenshot needs name="…"');
      const alt = /alt="([^"]{0,300})"/.exec(m[2] ?? '')?.[1] ?? '';
      out.push({ kind: 'screenshot', name: n[1], alt });
      continue;
    }
    if (name === 'diagram') {
      const n = /name="([a-z0-9-]{1,40})"/.exec(m[2] ?? '')?.[1] ?? '';
      if (!isDiagram(n)) throw new Error(`unknown diagram "${n}"`);
      out.push({ kind: 'diagram', name: n });
      continue;
    }
    if (name === 'download') {
      out.push({ kind: 'download' });
      continue;
    }
    const close = new RegExp(`<!--\\s*/${name}\\s*-->`).exec(rest);
    if (!close) throw new Error(`<!-- ${name} --> is not closed`);
    const inner = rest.slice(0, close.index);
    rest = rest.slice(close.index + close[0].length);
    if (name === 'note') out.push({ kind: 'note', text: inner });
    else if (name === 'cards') out.push({ kind: 'cards', cards: parseCards(inner) });
    else {
      const steps = inner
        .split(/^## /m)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `### ${s}`);
      out.push({ kind: 'steps', steps });
    }
  }
  if (rest.trim() !== '') out.push({ kind: 'md', text: rest });
  return out;
}

const md = (text: string) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;

export function Blocks({
  blocks,
  lang,
  download,
  shots,
}: {
  blocks: Block[];
  lang: Lang;
  download?: ReactNode;
  /** Screenshots that have images, with their size; others render a placeholder (WEBSITE.md §7). */
  shots?: Readonly<Record<string, ShotSize>>;
}) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'md':
            return <div key={i}>{md(b.text)}</div>;
          case 'note':
            return (
              <aside key={i} className="note">
                {md(b.text)}
              </aside>
            );
          case 'steps':
            return (
              <ol key={i} className="steps">
                {b.steps.map((s, j) => (
                  <li key={j} className="step">
                    {/* A step may hold a screenshot (or a note) too. */}
                    <Blocks blocks={parseBlocks(s)} lang={lang} download={download} shots={shots} />
                  </li>
                ))}
              </ol>
            );
          case 'screenshot': {
            const size = shots?.[b.name];
            if (!size)
              return (
                <figure key={i} className="screenshot screenshot-preview">
                  <figcaption>{lang === 'de' ? 'Vorschau' : 'Preview'}</figcaption>
                </figure>
              );
            return (
              <figure
                key={i}
                className={size.height > size.width ? 'screenshot screenshot-tall' : 'screenshot'}
              >
                <img
                  src={shotPath(b.name, lang)}
                  alt={b.alt}
                  loading="lazy"
                  width={size.width}
                  height={size.height}
                />
              </figure>
            );
          }
          case 'download':
            return <div key={i}>{download}</div>;
          case 'diagram': {
            const D = DIAGRAMS[b.name];
            return <D key={i} lang={lang} />;
          }
          case 'cards':
            return (
              <ul key={i} className="link-cards">
                {b.cards.map((c) => (
                  <li key={c.href}>
                    <a className="link-card" href={c.href}>
                      <span className="link-card-art">
                        <GhostPose pose={c.pose} size={64} />
                      </span>
                      <span className="link-card-body">
                        <span className="link-card-title">{c.title}</span>
                        <span className="link-card-text">{c.text}</span>
                      </span>
                      <span className="link-card-arrow" aria-hidden="true">
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </>
  );
}
