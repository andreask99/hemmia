import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AttachmentRef } from '@hemmia/shared';
import { I18nProvider } from '../i18n/index.tsx';
import { WebPhotos } from './WebPhotos.tsx';

const photo = (n: number, source: AttachmentRef['source']): AttachmentRef => ({
  id: `00000000-0000-4000-8000-00000000000${String(n)}`,
  kind: 'web',
  mime: 'image/jpeg',
  width: 800,
  height: 600,
  name: null,
  pages: null,
  scanPages: 0,
  source,
});

const show = (photos: AttachmentRef[], onOpen = vi.fn()) =>
  render(
    <I18nProvider language="en">
      <WebPhotos photos={photos} onOpen={onOpen} />
    </I18nProvider>,
  );

describe('WebPhotos', () => {
  it('renders nothing without photos', () => {
    expect(show([]).container.innerHTML).toBe('');
  });

  it('loads the photos from kchat and credits their pages safely', () => {
    const { container } = show([
      photo(1, { title: 'Red panda', url: 'https://www.zoo.example/panda' }),
      photo(2, { title: 'Panda', url: 'https://wiki.example/Red_panda' }),
      photo(3, { title: 'Again', url: 'https://zoo.example/other' }),
    ]);
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual([1, 2, 3].map((n) => `/api/attachments/${photo(n, null).id}`));
    expect(container.querySelector('figcaption')?.textContent).toContain('Photos from the web:');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['zoo.example', 'wiki.example']);
    expect(links[0]?.getAttribute('href')).toBe('https://www.zoo.example/panda');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('never links non-web sources', () => {
    show([photo(1, { title: 'x', url: 'javascript:alert(1)' }), photo(2, null)]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('opens a photo when tapped', () => {
    const onOpen = vi.fn();
    show([photo(1, null), photo(2, null)], onOpen);
    const first = screen.getAllByRole('button', { name: 'Open image' })[0];
    if (first) fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledWith(photo(1, null).id);
  });
});
