import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { I18nProvider } from '../i18n/index.tsx';
import { LinkedPages } from './LinkedPages.tsx';

function renderWithI18n(component: ReactNode) {
  return render(<I18nProvider language="en">{component}</I18nProvider>);
}

describe('LinkedPages', () => {
  it('renders nothing for empty list', () => {
    const { container } = renderWithI18n(<LinkedPages pages={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a read page with title and URL', () => {
    const pages = [
      {
        id: 'p1',
        url: 'https://shop.example.org/versand',
        title: 'Versand',
        status: 'read' as const,
        reason: null,
      },
    ];
    const { container } = renderWithI18n(<LinkedPages pages={pages} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://shop.example.org/versand');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toContain('Versand');
    expect(link?.textContent).toContain('shop.example.org');
  });

  it('renders a read page with empty title showing the host', () => {
    const pages = [
      {
        id: 'p1',
        url: 'https://shop.example.org/versand',
        title: '',
        status: 'read' as const,
        reason: null,
      },
    ];
    const { container } = renderWithI18n(<LinkedPages pages={pages} />);

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('shop.example.org');
  });

  it('renders an unreadable page with reason', () => {
    const pages = [
      {
        id: 'p1',
        url: 'https://news.example.com/a',
        title: '',
        status: 'unreadable' as const,
        reason: 'forbidden' as const,
      },
    ];
    const { container } = renderWithI18n(<LinkedPages pages={pages} />);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://news.example.com/a');
    expect(link?.textContent).toContain("Couldn't read news.example.com");
    expect(link?.textContent).toContain('login or paywall');
  });

  it('skips a page with invalid URL', () => {
    const pages = [
      {
        id: 'p1',
        url: 'javascript:alert(1)',
        title: '',
        status: 'read' as const,
        reason: null,
      },
    ];
    const { container } = renderWithI18n(<LinkedPages pages={pages} />);

    // Should render nothing for invalid URLs
    expect(container.innerHTML).toBe('');
  });
});
