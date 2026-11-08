/** Diagrams as inline SVG (WEBSITE.md §3, P10.3). Colours come from site.css, so dark mode works. */
import type { Lang } from './content.ts';

const HOW = {
  en: {
    title: 'How Hemmia connects',
    main: 'The main way: your own AI at home',
    phone: 'Your phone',
    link: 'Hemmia Connect or Tailscale',
    linkNote: 'encrypted · Tailscale is free',
    hub: 'Your hub at home',
    hubNote: 'local AI models run here',
    optional: 'Optional: cloud models with your own key',
    provider: 'AI provider',
    providerNote: 'only with your key',
    fromPhone: 'app on its own',
    fromHub: 'cloud models',
  },
  de: {
    title: 'Wie Hemmia verbunden ist',
    main: 'Der Hauptweg: deine eigene KI zu Hause',
    phone: 'Dein Telefon',
    link: 'Hemmia Connect oder Tailscale',
    linkNote: 'verschlüsselt · Tailscale kostenlos',
    hub: 'Dein Hub zu Hause',
    hubNote: 'hier laufen lokale KI-Modelle',
    optional: 'Optional: Cloud-Modelle mit deinem Schlüssel',
    provider: 'KI-Anbieter',
    providerNote: 'nur mit deinem Schlüssel',
    fromPhone: 'nur die App',
    fromHub: 'Cloud-Modelle',
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

/**
 * The main way (bold, top): phone → Hemmia Connect or Tailscale → the hub, where the local
 * models run. Optional (dashed, below): an AI provider, reached by the app on its own or by the
 * hub for cloud models, with the person's own key. Local models and providers aren't connected.
 */
export function HowDiagram({ lang }: { lang: Lang }) {
  const t = HOW[lang];
  return (
    <figure className="diagram">
      <svg viewBox="0 0 640 300" role="img" aria-label={t.title}>
        <title>{t.title}</title>
        <text x={20} y={22} className="d-cap d-cap-main">
          {t.main}
        </text>
        <line x1={150} y1={68} x2={190} y2={68} className="d-line d-main" />
        <line x1={420} y1={68} x2={455} y2={68} className="d-line d-main" />
        <Box x={20} y={40} w={130} label={t.phone} strong />
        <Box x={190} y={40} w={230} label={t.link} note={t.linkNote} strong />
        <Box x={455} y={40} w={175} label={t.hub} note={t.hubNote} strong />

        <text x={320} y={186} textAnchor="middle" className="d-cap">
          {t.optional}
        </text>
        <path d="M85 96 V228 H240" className="d-line d-dashed d-optional" fill="none" />
        <path d="M542 96 V228 H400" className="d-line d-dashed d-optional" fill="none" />
        <text x={95} y={150} className="d-note">
          {t.fromPhone}
        </text>
        <text x={552} y={150} className="d-note">
          {t.fromHub}
        </text>
        <Box x={240} y={200} w={160} label={t.provider} note={t.providerNote} />
      </svg>
    </figure>
  );
}

export const DIAGRAMS = { how: HowDiagram } as const;
export type DiagramName = keyof typeof DIAGRAMS;
export const isDiagram = (n: string): n is DiagramName => Object.hasOwn(DIAGRAMS, n);
