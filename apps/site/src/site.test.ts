import { describe, expect, it } from 'vitest';
import { brokenLinks, externalResources, missingTranslations } from './checks.ts';
import { ContentError, pagePath, parseContent } from './content.ts';
import { parseBlocks } from './directives.tsx';
import { HEADER_NAV, resolveNav } from './nav.ts';

const HEADER =
  '---\ntitle: Set up on a Mac\ndescription: Install the hub.\nnav: guides\norder: 20\n---\n';

describe('content header', () => {
  it('parses a valid header and keeps the body', () => {
    const { header, body } = parseContent(`${HEADER}# Hi\n`);
    expect(header).toEqual({
      title: 'Set up on a Mac',
      description: 'Install the hub.',
      nav: 'guides',
      order: 20,
      draft: 'false',
    });
    expect(body).toBe('# Hi\n');
  });

  it.each([
    ['no header', '# Hi'],
    ['missing field', '---\ntitle: X\nnav: guides\norder: 1\n---\n'],
    ['unknown nav', '---\ntitle: X\ndescription: Y\nnav: blog\norder: 1\n---\n'],
    ['unknown field', `${HEADER.slice(0, -4)}color: red\n---\n`],
  ])('refuses %s', (_name, text) => {
    expect(() => parseContent(text)).toThrow(ContentError);
  });

  it('builds paths per language', () => {
    expect(pagePath('en', '')).toBe('/');
    expect(pagePath('de', '')).toBe('/de/');
    expect(pagePath('de', 'guides/mac')).toBe('/de/guides/mac/');
  });
});

describe('directives', () => {
  it('splits Markdown into plain parts and directive blocks', () => {
    const blocks = parseBlocks(
      'Intro\n<!-- steps -->\n## One\nA\n## Two\nB\n<!-- /steps -->\n<!-- note -->Careful<!-- /note -->\n<!-- screenshot name="m4-connected" -->\n<!-- download -->\nEnd',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'md',
      'steps',
      'md',
      'note',
      'md',
      'screenshot',
      'md',
      'download',
      'md',
    ]);
    const steps = blocks[1];
    expect(steps?.kind === 'steps' && steps.steps).toEqual(['### One\nA', '### Two\nB']);
  });

  it('reads diagrams and refuses unknown ones', () => {
    expect(parseBlocks('<!-- diagram name="how" -->')).toEqual([{ kind: 'diagram', name: 'how' }]);
    expect(() => parseBlocks('<!-- diagram name="nope" -->')).toThrow('unknown diagram');
  });

  it('reads link cards and refuses malformed ones', () => {
    expect(
      parseBlocks(
        '<!-- cards -->\n- key | [Getting a key](/guides/api-keys/) | A key with a limit.\n<!-- /cards -->',
      ),
    ).toEqual([
      {
        kind: 'cards',
        cards: [
          {
            pose: 'key',
            title: 'Getting a key',
            href: '/guides/api-keys/',
            text: 'A key with a limit.',
          },
        ],
      },
    ]);
    expect(() => parseBlocks('<!-- cards -->\n- dragon | [A](/a/) | b\n<!-- /cards -->')).toThrow(
      'unknown pose',
    );
    // Only site paths: no external or javascript: links in cards.
    expect(() =>
      parseBlocks('<!-- cards -->\n- key | [A](javascript:alert(1)) | b\n<!-- /cards -->'),
    ).toThrow('bad card line');
  });

  it('reports unclosed blocks and bad screenshot names', () => {
    expect(() => parseBlocks('<!-- note -->x')).toThrow('not closed');
    expect(() => parseBlocks('<!-- screenshot name="../x" -->')).toThrow();
  });
});

describe('site checks', () => {
  it('finds resources loaded from other sites but allows links', () => {
    const html =
      '<a href="https://github.com/x">ok</a><script src="https://cdn.example/x.js"></script>' +
      '<link rel="stylesheet" href="https://fonts.example/a.css"><link rel="alternate" href="https://x.example/">' +
      '<img src="/img/a.webp" srcset="//cdn.example/b.webp 2x">';
    expect(externalResources(html)).toEqual([
      'https://cdn.example/x.js',
      'https://fonts.example/a.css',
      '//cdn.example/b.webp',
    ]);
  });

  it('finds broken internal links and missing translations', () => {
    const files = [
      {
        path: '/index.html',
        html: '<a href="/guides/mac/">x</a><a href="/de/">y</a><img src="/img/a.webp">',
      },
      { path: '/de/index.html', html: '<a href="/">x</a>' },
      { path: '/guides/mac/index.html', html: '<a href="#top">t</a>' },
    ];
    expect(brokenLinks(files, new Set())).toEqual(['/index.html → /img/a.webp']);
    expect(brokenLinks(files, new Set(['/img/a.webp']))).toEqual([]);
    expect(missingTranslations(files)).toEqual(['de missing: /guides/mac/index.html']);
  });
});

describe('navigation', () => {
  it('links only pages that exist and marks the current section', () => {
    const items = resolveNav(
      HEADER_NAV,
      'de',
      'guides/mac',
      new Set(['', 'privacy', 'guides', 'guides/mac']),
    );
    expect(items).toEqual([
      { href: '/de/privacy/', label: 'Datenschutz', current: false },
      { href: '/de/guides/', label: 'Anleitungen', current: true },
      { href: '/demo/?lang=de', label: 'Demo', current: false },
    ]);
  });
});
