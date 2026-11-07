import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Blocks, parseBlocks } from './directives.tsx';
import { mergeShots, parseShotFile, Screenshots, shotPath } from './screenshots.ts';

describe('screenshots', () => {
  it('reads name and language from the file name', () => {
    expect(parseShotFile('/tmp/shots/m4-connected.de.png')).toEqual({
      name: 'm4-connected',
      lang: 'de',
    });
    expect(parseShotFile('h4-models.EN.jpg')).toEqual({ name: 'h4-models', lang: 'en' });
  });

  it('refuses other names', () => {
    expect(parseShotFile('m4-connected.png')).toBeNull();
    expect(parseShotFile('m4-connected.fr.png')).toBeNull();
    expect(parseShotFile('M4 Connected.en.png')).toBeNull();
    expect(parseShotFile('../x.en.gif')).toBeNull();
  });

  it('keeps the list sorted, and a new size replaces the old one', () => {
    const s = (width: number) => ({ width, height: 10 });
    const merged = mergeShots({ b: s(1), a: s(1) }, { a: s(2), c: s(3) });
    expect(Object.keys(merged)).toEqual(['a', 'b', 'c']);
    expect(merged.a).toEqual(s(2));
    expect(() => Screenshots.parse({ 'Not ok': s(1) })).toThrow();
    expect(() => Screenshots.parse({ ok: { width: 0, height: 1 } })).toThrow();
  });

  it('uses the path the screenshot directive renders', () => {
    expect(shotPath('m4-connected', 'de')).toBe('/img/m4-connected.de.webp');
  });
});

describe('screenshot directive', () => {
  const html = (shots: Record<string, { width: number; height: number }>, md?: string) =>
    renderToStaticMarkup(
      createElement(Blocks, {
        blocks: parseBlocks(md ?? '<!-- screenshot name="m4-connected" -->'),
        lang: 'de',
        shots,
      }),
    );

  it('shows a preview placeholder until the image exists', () => {
    const out = html({});
    expect(out).toContain('Vorschau');
    expect(out).not.toContain('<img');
  });

  it('shows the image once it is listed, with its size', () => {
    const out = html({ 'm4-connected': { width: 1200, height: 750 } });
    expect(out).toContain('src="/img/m4-connected.de.webp"');
    expect(out).toContain('width="1200"');
    expect(out).toContain('height="750"');
    expect(out).toContain('alt=""');
  });

  it('takes alt text from the directive', () => {
    const out = html(
      { a: { width: 10, height: 10 } },
      '<!-- screenshot name="a" alt="The chat on a phone" -->',
    );
    expect(out).toContain('alt="The chat on a phone"');
  });
});
