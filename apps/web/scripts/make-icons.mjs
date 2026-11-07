// Renders the app icons into public/icons (run: npm run icons -w @hemmia/web).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });

// A white speech bubble with three dots on blue. `inset` shrinks the artwork for the
// maskable icon (safe zone = central 80%); `rounded` gives the plain icon rounded corners.
function svg({ inset = 0, rounded = true } = {}) {
  const s = 1 - inset * 2;
  const t = 512 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#1F4D3F"/>
  <g transform="translate(${t} ${t}) scale(${s})">
    <path d="M128 120h256a48 48 0 0 1 48 48v152a48 48 0 0 1-48 48H232l-80 64v-64h-24a48 48 0 0 1-48-48V168a48 48 0 0 1 48-48z" fill="#F4F1E8"/>
    <circle cx="186" cy="244" r="22" fill="#1F4D3F"/>
    <circle cx="256" cy="244" r="22" fill="#1F4D3F"/>
    <circle cx="326" cy="244" r="22" fill="#1F4D3F"/>
  </g>
</svg>`;
}

const render = (s, size, name) =>
  sharp(Buffer.from(s)).resize(size, size).png().toFile(`${out}${name}`);

await render(svg(), 192, 'icon-192.png');
await render(svg(), 512, 'icon-512.png');
await render(svg({ inset: 0.1, rounded: false }), 512, 'icon-maskable-512.png');
// iOS adds its own rounding and doesn't like transparency.
await render(svg({ rounded: false }), 180, 'apple-touch-icon.png');
process.stdout.write('icons written\n');
