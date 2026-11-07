import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WebSearch } from '@hemmia/shared';
import { I18nProvider } from '../i18n/index.tsx';
import { WebSearches } from './WebSearches.tsx';

const show = (searches: WebSearch[]) =>
  render(
    <I18nProvider language="en">
      <WebSearches searches={searches} />
    </I18nProvider>,
  );

describe('WebSearches', () => {
  it('renders nothing for an empty list', () => {
    expect(show([]).container.innerHTML).toBe('');
  });

  it('summarises searches and links sources safely', () => {
    const { container } = show([
      {
        query: 'Wetter München',
        sources: [
          { title: 'Wetter heute', url: 'https://wetter.example/muc' },
          { title: 'DWD', url: 'https://dwd.example/' },
        ],
      },
      { query: 'Biergarten offen', sources: [{ title: 'Biergärten', url: 'https://bg.example/' }] },
    ]);
    const summary = container.querySelector('summary')?.textContent ?? '';
    expect(summary).toContain('Searched the web');
    expect(summary).toContain('3 sources');
    expect(screen.getByText('“Wetter München”')).toBeDefined();
    expect(screen.getByText('“Biergarten offen”')).toBeDefined();
    const link = screen.getByRole('link', { name: 'Wetter heute' });
    expect(link.getAttribute('href')).toBe('https://wetter.example/muc');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('skips non-web links and falls back to the host name for untitled pages', () => {
    show([
      {
        query: 'x',
        sources: [
          { title: 'evil', url: 'javascript:alert(1)' },
          { title: '  ', url: 'https://plain.example/page' },
        ],
      },
    ]);
    expect(screen.queryByRole('link', { name: 'evil' })).toBeNull();
    expect(screen.getByRole('link', { name: 'plain.example' }).getAttribute('href')).toBe(
      'https://plain.example/page',
    );
  });
});
