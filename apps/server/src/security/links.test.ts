import { describe, expect, it } from 'vitest';
import { findLinks } from './links.ts';

describe('findLinks', () => {
  it('finds http(s) and www links and normalises them', () => {
    expect(
      findLinks('Fass zusammen: https://Example.org/a?b=1#teil und www.beispiel.de/impressum'),
    ).toEqual(['https://example.org/a?b=1', 'https://www.beispiel.de/impressum']);
  });

  it('drops trailing punctuation and unbalanced brackets', () => {
    expect(findLinks('Siehe https://example.org/agb. Und (https://example.com/x)!')).toEqual([
      'https://example.org/agb',
      'https://example.com/x',
    ]);
    expect(findLinks('https://en.wikipedia.org/wiki/Mercury_(planet), please')).toEqual([
      'https://en.wikipedia.org/wiki/Mercury_(planet)',
    ]);
  });

  it('reads Markdown and angle-bracket links', () => {
    expect(
      findLinks('[AGB](https://shop.example.com/agb) and <https://news.example.net/>'),
    ).toEqual(['https://shop.example.com/agb', 'https://news.example.net/']);
    expect(findLinks('[https://a.example.com](https://a.example.com)')).toEqual([
      'https://a.example.com/',
    ]);
  });

  it('ignores links in code', () => {
    const log = [
      'Why does this fail? see `https://inline.example.com/x`',
      '```',
      'GET https://api.example.com/v1/items 500',
      '```',
      'Docs: https://docs.example.com/errors',
    ].join('\n');
    expect(findLinks(log)).toEqual(['https://docs.example.com/errors']);
    expect(findLinks('~~~\nhttps://fenced.example.com\n~~~')).toEqual([]);
    // A lone backtick doesn't hide the rest of the line.
    expect(findLinks('it`s at https://example.org')).toEqual(['https://example.org/']);
  });

  it('skips local, home-network and odd addresses', () => {
    expect(
      findLinks(
        [
          'http://localhost:3000/x',
          'http://router/',
          'http://fritz.box',
          'http://nas.local/share',
          'https://mini.tail1234.ts.net/chat',
          'http://192.168.1.1/',
          'http://[::1]/',
          'https://user:pw@example.org/',
          'https://example.org:8443/',
          'ftp://example.org/file',
          'https://example.123/',
        ].join(' '),
      ),
    ).toEqual([]);
    expect(findLinks('http://93.184.215.14/page')).toEqual(['http://93.184.215.14/page']);
  });

  it('deduplicates and keeps at most three', () => {
    expect(
      findLinks(
        'https://a.example.com https://a.example.com/ https://b.example.com https://c.example.com https://d.example.com',
      ),
    ).toEqual(['https://a.example.com/', 'https://b.example.com/', 'https://c.example.com/']);
  });

  it('skips very long links and handles text without links', () => {
    expect(findLinks(`https://example.org/${'a'.repeat(2100)}`)).toEqual([]);
    expect(findLinks('Hallo, wie geht es dir?')).toEqual([]);
    expect(findLinks('')).toEqual([]);
  });
});
