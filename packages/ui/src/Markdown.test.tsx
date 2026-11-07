import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, safeUrl } from './Markdown.tsx';

function html(text: string): HTMLElement {
  return render(<Markdown text={text} />).container;
}

describe('Markdown: untrusted input renders inert', () => {
  it('drops script tags', () => {
    const c = html('<script>alert(1)</script> hi');
    expect(c.querySelector('script')).toBeNull();
    expect(c.innerHTML).not.toContain('<script');
  });

  it('drops raw HTML elements and event handlers', () => {
    for (const input of [
      '<img src=x onerror=alert(1)>',
      '<iframe src="https://x.example"></iframe>',
      '<svg onload=alert(1)>',
      '<a href="https://x.example">x</a>',
      '<div style="position:fixed">x</div>',
    ]) {
      const c = html(input);
      expect(c.querySelector('img, iframe, svg, a, div[style]')).toBeNull();
      expect(c.innerHTML).not.toMatch(/onerror|onload/);
    }
  });

  it('neutralises dangerous link schemes', () => {
    for (const input of [
      '[click](javascript:alert(1))',
      '[x](JaVaScRiPt:alert(1))',
      '[x]( javascript:alert(1))',
      '[x](data:text/html;base64,PHNjcmlwdD4=)',
      '[x](vbscript:msgbox(1))',
      '<javascript:alert(1)>',
    ]) {
      const c = html(input);
      for (const a of c.querySelectorAll('a')) {
        expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:|data:|vbscript:/i);
      }
      expect(c.innerHTML).not.toMatch(/href="(javascript|data|vbscript):/i);
    }
  });

  it('never loads remote images', () => {
    const c = html('![a](https://evil.example/track.png)');
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toContain('[a]');
  });

  it('opens normal links safely in a new tab', () => {
    const a = html('[docs](https://example.com)').querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
    expect(a?.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('Markdown: formatting', () => {
  it('renders GFM tables in a scroll container', () => {
    const c = html('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(c.querySelector('.overflow-x-auto table')).not.toBeNull();
  });

  it('highlights fenced code and adds a copy button', () => {
    const c = html('```ts\nconst x = 1;\n```');
    expect(c.querySelector('pre code.hljs')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Copy"]')).not.toBeNull();
  });

  it('renders inline code and emphasis', () => {
    const c = html('use `npm` **now**');
    expect(c.querySelector('code')?.textContent).toBe('npm');
    expect(c.querySelector('strong')?.textContent).toBe('now');
  });
});

describe('safeUrl', () => {
  it('allows http(s), mailto and anchors only', () => {
    expect(safeUrl('https://a.b')).toBe('https://a.b');
    expect(safeUrl('http://a.b')).toBe('http://a.b');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('#top')).toBe('#top');
    for (const bad of [
      'javascript:x',
      ' JAVASCRIPT:x',
      'data:x',
      'vbscript:x',
      'file:///etc',
      '/relative',
      'ftp://x',
    ]) {
      expect(safeUrl(bad)).toBe('');
    }
  });
});
