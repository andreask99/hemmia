/** Diagrams as inline SVG (WEBSITE.md §3, P10.3). Colours come from site.css, so dark mode works. */
import type { Lang } from './content.ts';

const HOW = {
  en: {
    title: 'How Hemmia connects',
    phone: 'Your phone',
    hub: 'Your hub at home',
    local: 'Local models',
    relay: 'Relay (optional)',
    relayNote: 'passes encrypted traffic',
    provider: 'AI provider',
    providerNote: 'only with your key',
  },
  de: {
    title: 'Wie Hemmia verbunden ist',
    phone: 'Dein Telefon',
    hub: 'Dein Hub zu Hause',
    local: 'Lokale Modelle',
    relay: 'Relay (optional)',
    relayNote: 'leitet verschlüsselt weiter',
    provider: 'KI-Anbieter',
    providerNote: 'nur mit deinem Schlüssel',
  },
} as const;

function Box(p: {
  x: number;
  y: number;
  w: number;
  label: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <g>
      <rect
        x={p.x}
        y={p.y}
        width={p.w}
        height={56}
        rx={12}
        className={p.strong ? 'd-box d-strong' : 'd-box'}
      />
      <text x={p.x + p.w / 2} y={p.y + (p.note ? 24 : 33)} textAnchor="middle" className="d-label">
        {p.label}
      </text>
      {p.note && (
        <text x={p.x + p.w / 2} y={p.y + 42} textAnchor="middle" className="d-note">
          {p.note}
        </text>
      )}
    </g>
  );
}

export function HowDiagram({ lang }: { lang: Lang }) {
  const t = HOW[lang];
  return (
    <figure className="diagram">
      <svg viewBox="0 0 640 260" role="img" aria-label={t.title}>
        <title>{t.title}</title>
        <line x1={140} y1={60} x2={250} y2={60} className="d-line d-dashed" />
        <line x1={390} y1={60} x2={500} y2={60} className="d-line d-dashed" />
        <line x1={80} y1={88} x2={80} y2={172} className="d-line" />
        <line x1={140} y1={200} x2={500} y2={200} className="d-line" />
        <line x1={570} y1={172} x2={570} y2={88} className="d-line" />
        <Box x={20} y={32} w={120} label={t.phone} strong />
        <Box x={250} y={32} w={140} label={t.relay} note={t.relayNote} />
        <Box x={500} y={32} w={130} label={t.hub} strong />
        <Box x={20} y={172} w={120} label={t.provider} note={t.providerNote} />
        <Box x={500} y={172} w={130} label={t.local} />
      </svg>
    </figure>
  );
}

export const DIAGRAMS = { how: HowDiagram } as const;
export type DiagramName = keyof typeof DIAGRAMS;
export const isDiagram = (n: string): n is DiagramName => Object.hasOwn(DIAGRAMS, n);
