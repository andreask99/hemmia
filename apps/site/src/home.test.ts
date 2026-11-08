import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LANGS } from './content.ts';
import { Home } from './Home.tsx';
import { HOME } from './home.ts';

const SHOTS = {
  'phone-chat': { width: 600, height: 1300 },
  'mac-setup-welcome': { width: 1200, height: 750 },
  'hub-family': { width: 1200, height: 750 },
};

function render(lang: (typeof LANGS)[number]): string {
  return renderToStaticMarkup(
    createElement(Home, {
      lang,
      shots: SHOTS,
      existing: new Set(['', 'how-it-works', 'faq', 'get-started']),
    }),
  );
}

describe('home page', () => {
  it('has the six messages of MARKETING.md §2b in both languages, with the same structure', () => {
    for (const lang of LANGS) {
      const html = render(lang);
      const t = HOME[lang];
      for (const heading of [
        t.asks.title,
        t.ways.title,
        t.family.title,
        t.compare.title,
        t.flow.title,
        t.promises.title,
        t.cost.title,
      ]) {
        expect(html).toContain(heading);
      }
      expect(t.asks.items).toHaveLength(HOME.en.asks.items.length);
      expect(t.compare.rows).toHaveLength(HOME.en.compare.rows.length);
      expect(t.promises.items).toHaveLength(6);
    }
  });

  it('keeps to the claims rules (MARKETING.md §1)', () => {
    const forbidden = [
      /collect (nothing|anything|no data)/i,
      /sammeln (nichts|keine daten)/i,
      /anonym/i,
      /open[ -]source/i, // only once the repository is public (P8.5)
      /chatgpt|gemini|copilot|siri|alexa/i,
      /works offline|funktioniert offline/i,
      // Only true for data at rest, not against whoever controls the running hub (SECURITY.md).
      /not even the person who runs|nicht einmal, wer den hub/i,
      /answered at home|zu hause beantwortet/i,
      /raspberry/i,
    ];
    for (const lang of LANGS) {
      const text = JSON.stringify(HOME[lang]);
      for (const f of forbidden) expect(text).not.toMatch(f);
    }
  });

  it('links only to pages that exist', () => {
    const html = renderToStaticMarkup(
      createElement(Home, { lang: 'en', shots: SHOTS, existing: new Set(['']) }),
    );
    expect(html).not.toContain('/how-it-works/');
    expect(html).not.toContain('/faq/');
  });
});
