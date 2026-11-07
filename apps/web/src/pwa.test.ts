// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Type definition for manifest icons
interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

// Type definition for manifest
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
}

describe('PWA Support', () => {
  it('manifest should contain required fields', () => {
    const manifestContent = readFileSync(
      new URL('../public/manifest.webmanifest', import.meta.url),
      'utf-8',
    );
    const manifest = JSON.parse(manifestContent) as Manifest;

    expect(manifest.name).toBe('Hemmia');
    expect(manifest.short_name).toBe('Hemmia');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#F4F1E8');
    expect(manifest.theme_color).toBe('#F4F1E8');

    // Check icons
    expect(manifest.icons).toHaveLength(3);

    const icon192 = manifest.icons.find((icon) => icon.sizes === '192x192');
    expect(icon192).toBeDefined();
    expect(icon192?.src).toBe('/icons/icon-192.png');
    expect(icon192?.type).toBe('image/png');

    const icon512 = manifest.icons.find((icon) => icon.sizes === '512x512');
    expect(icon512).toBeDefined();
    expect(icon512?.src).toBe('/icons/icon-512.png');
    expect(icon512?.type).toBe('image/png');

    const maskableIcon = manifest.icons.find((icon) => icon.purpose === 'maskable');
    expect(maskableIcon).toBeDefined();
    expect(maskableIcon?.src).toBe('/icons/icon-maskable-512.png');
    expect(maskableIcon?.type).toBe('image/png');
  });

  it('icons exist and have the declared sizes', () => {
    for (const [file, size] of [
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['icon-maskable-512.png', 512],
      ['apple-touch-icon.png', 180],
    ] as const) {
      const png = readFileSync(new URL(`../public/icons/${file}`, import.meta.url));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });

  it('service worker should not contain http(s) protocol', () => {
    const swContent = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf-8');

    expect(swContent).toContain('/api/');
    expect(swContent).not.toContain('http://');
    expect(swContent).not.toContain('https://');
  });

  it('index.html should contain PWA meta tags and manifest link', () => {
    const htmlContent = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

    for (const fragment of [
      'rel="manifest" href="/manifest.webmanifest"',
      'name="theme-color" content="#f4f1e8"',
      'rel="apple-touch-icon" href="/icons/apple-touch-icon.png"',
      'name="apple-mobile-web-app-capable" content="yes"',
      'name="apple-mobile-web-app-title" content="Hemmia"',
    ]) {
      expect(htmlContent).toContain(fragment);
    }

    // Should not contain script tags other than the module entry
    const scriptTags = htmlContent.match(/<script[^>]*><\/script>/g) || [];
    expect(scriptTags.length).toBe(1); // Only the main module script should exist
    expect(scriptTags[0]).toContain('src="/src/main.tsx"');
  });
});
