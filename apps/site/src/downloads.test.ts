import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DownloadCards } from './DownloadCards.tsx';
import { type Download, parseDownloads } from './downloads.ts';

const real = readFileSync(join(import.meta.dirname, '..', 'content', 'downloads.json'), 'utf8');
const note = { en: 'n', de: 'n' };
const four: Download[] = [
  { platform: 'ios', url: '', note },
  { platform: 'android', url: '', note },
  { platform: 'macos', url: '', note },
  { platform: 'docker', url: '', note },
];

describe('parseDownloads', () => {
  it('accepts content/downloads.json', () => {
    expect(parseDownloads(real).map((d) => d.platform)).toEqual([
      'ios',
      'android',
      'macos',
      'docker',
    ]);
  });

  it('refuses a missing or duplicated platform, http URLs and unknown fields', () => {
    expect(() => parseDownloads(JSON.stringify(four.slice(0, 3)))).toThrow();
    expect(() => parseDownloads(JSON.stringify([...four.slice(0, 3), four[0]]))).toThrow();
    expect(() =>
      parseDownloads(
        JSON.stringify([{ ...four[0], url: 'http://example.com/a' }, ...four.slice(1)]),
      ),
    ).toThrow();
    expect(() =>
      parseDownloads(JSON.stringify([{ ...four[0], extra: 1 }, ...four.slice(1)])),
    ).toThrow();
    expect(() => parseDownloads('{')).toThrow('not valid JSON');
  });
});

describe('DownloadCards', () => {
  const html = (items: Download[], lang: 'en' | 'de' = 'en') =>
    renderToStaticMarkup(createElement(DownloadCards, { items, lang }));

  it('shows "Coming soon" without a link while the URL is empty', () => {
    const out = html(four.slice(0, 1));
    expect(out).toContain('Coming soon');
    expect(out).toContain('aria-disabled="true"');
    expect(out).not.toContain('<a ');
    expect(html(four.slice(0, 1), 'de')).toContain('Demnächst');
  });

  it('links to the download with its version', () => {
    const out = html([
      { platform: 'macos', url: 'https://example.com/a.pkg', version: '0.1.0', note },
    ]);
    expect(out).toContain('href="https://example.com/a.pkg"');
    expect(out).toContain('Download 0.1.0');
    expect(out).toContain('Mac (Hemmia at home)');
    expect(html(four.slice(2, 3), 'de')).toContain('Mac (Hemmia zu Hause)');
  });
});
