/**
 * Generates every icon and launch image from the Hemmia ghost (the same drawing as the join
 * page's icon.svg and the app's welcome screen): the web app's home-screen icons, favicon,
 * notification badge and iPhone launch images; the phone app's iOS AppIcon and Splash and
 * Android launcher icons (legacy, round, adaptive foreground) and splash drawables; the
 * website's icon and the press kit's logo files (apps/site/public/press/).
 *   node scripts/make-icons.ts   (prints the <link> tags for apps/web/index.html)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web/public/icons');
const SITE = join(ROOT, 'apps/site/public');
const ANDROID = join(ROOT, 'apps/mobile/android/app/src/main/res');
const IOS = join(ROOT, 'apps/mobile/ios/App/App/Assets.xcassets');

const FOREST = '#1f4d3f';
const THEMES = {
  light: { paper: '#f4f1e8', shadow: '#e0dccf' },
  dark: { paper: '#111815', shadow: '#26302b' },
};

/**
 * The ghost, `h` px tall (body only), centred at (cx, cy). Drawn in the 72-unit space of the
 * join page's icon (body from y 18 to 56). `mono`: a white silhouette with the face cut out,
 * for notification badges (`ink` changes its colour). The outline never gets thinner than one pixel.
 */
function ghost(
  cx: number,
  cy: number,
  h: number,
  o: { mono?: boolean; ink?: string; shadow?: string | null } = {},
): string {
  const s = h / 38;
  const t = `translate(${String(cx - 36 * s)} ${String(cy - 37 * s)}) scale(${String(s)})`;
  const body = 'M20 55V34a16 16 0 0 1 32 0v21l-5.33-4-5.34 4-5.33-4-5.33 4-5.34-4z';
  const face =
    '<circle cx="30" cy="34" r="2.4"/><circle cx="42" cy="34" r="2.4"/>' +
    '<path d="M32.6 40q3.4 2.8 6.8 0" fill="none" stroke-width="1.8" stroke-linecap="round"/>';
  if (o.mono) {
    const id = `m${String(Math.round(h * 1000))}`;
    return (
      `<defs><mask id="${id}"><g transform="${t}"><path d="${body}" fill="#fff"/>` +
      `<g fill="#000" stroke="#000">${face}</g></g></mask></defs>` +
      `<rect width="100%" height="100%" fill="${o.ink ?? '#fff'}" mask="url(#${id})"/>`
    );
  }
  const stroke = Math.max(1.6, 1 / s);
  const shadow =
    o.shadow === null
      ? ''
      : `<ellipse cx="36" cy="61" rx="11" ry="2" fill="${o.shadow ?? THEMES.light.shadow}"/>`;
  return (
    `<g transform="${t}">${shadow}` +
    `<path d="${body}" fill="#fffdf8" stroke="${FOREST}" stroke-width="${String(stroke)}" stroke-linejoin="round"/>` +
    `<g fill="#17231f" stroke="#17231f">${face}</g>` +
    `<circle cx="26" cy="39" r="2" fill="#e9b7a3"/><circle cx="46" cy="39" r="2" fill="#e9b7a3"/></g>`
  );
}

const svg = (w: number, h: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}">${inner}</svg>`;

/** Square icon on paper; `radius` rounds the corners, `circle` makes it round, `scale` sizes the ghost. */
function icon(size: number, o: { radius?: number; circle?: boolean; scale?: number } = {}): string {
  const bg = o.circle
    ? `<circle cx="${String(size / 2)}" cy="${String(size / 2)}" r="${String(size / 2)}" fill="${THEMES.light.paper}"/>`
    : `<rect width="${String(size)}" height="${String(size)}" rx="${String(o.radius ?? 0)}" fill="${THEMES.light.paper}"/>`;
  return svg(size, size, bg + ghost(size / 2, size * 0.47, size * (o.scale ?? 0.6)));
}

function splash(w: number, h: number, theme: keyof typeof THEMES): string {
  const { paper, shadow } = THEMES[theme];
  const g = Math.min(w, h) * 0.28;
  return svg(
    w,
    h,
    `<rect width="100%" height="100%" fill="${paper}"/>${ghost(w / 2, h * 0.45, g, { shadow })}`,
  );
}

async function png(source: string, file: string): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toFile(file);
}

// Web app (PWA).
await png(icon(180), join(WEB, 'apple-touch-icon.png'));
await png(icon(192), join(WEB, 'icon-192.png'));
await png(icon(512), join(WEB, 'icon-512.png'));
// Maskable: Android crops to a circle; keep the ghost inside the 80% safe zone.
await png(icon(512, { scale: 0.45 }), join(WEB, 'icon-maskable-512.png'));
// Notification badge: Android shows it as a monochrome silhouette.
await png(svg(96, 96, ghost(48, 46, 70, { mono: true })), join(WEB, 'badge-96.png'));
await png(icon(64, { radius: 14, scale: 0.64 }), join(WEB, 'favicon-64.png'));
writeFileSync(join(WEB, 'favicon.svg'), icon(64, { radius: 14, scale: 0.64 }));
mkdirSync(SITE, { recursive: true });
writeFileSync(join(SITE, 'icon.svg'), icon(64, { radius: 14, scale: 0.64 }));

// Press kit: the ghost on a transparent background, the app icon, and one-colour versions.
const PRESS = join(SITE, 'press');
mkdirSync(PRESS, { recursive: true });
const pressFiles: [string, string][] = [
  ['hemmia-ghost', svg(512, 512, ghost(256, 250, 380, { shadow: null }))],
  ['hemmia-icon', icon(512, { radius: 112 })],
  ['hemmia-ghost-black', svg(512, 512, ghost(256, 250, 380, { mono: true, ink: '#000' }))],
  ['hemmia-ghost-white', svg(512, 512, ghost(256, 250, 380, { mono: true }))],
];
for (const [name, source] of pressFiles) {
  writeFileSync(join(PRESS, `${name}.svg`), source);
  await sharp(Buffer.from(source), { density: 144 })
    .resize(1024, 1024)
    .png({ compressionLevel: 9 })
    .toFile(join(PRESS, `${name}.png`));
}

/** iPhone portrait screens: CSS width × height and pixel ratio (launch images must match exactly). */
const SCREENS: [number, number, number][] = [
  [440, 956, 3], // 16/17 Pro Max
  [402, 874, 3], // 16/17 Pro, 17
  [420, 912, 3], // Air
  [430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE, 8
];
const links: string[] = [];
for (const [w, h, dpr] of SCREENS) {
  for (const theme of ['light', 'dark'] as const) {
    const file = `splash-${String(w * dpr)}x${String(h * dpr)}-${theme}.png`;
    await png(splash(w * dpr, h * dpr, theme), join(WEB, file));
    links.push(
      `<link rel="apple-touch-startup-image" href="/icons/${file}" media="(device-width: ${String(w)}px) and (device-height: ${String(h)}px) and (-webkit-device-pixel-ratio: ${String(dpr)}) and (orientation: portrait) and (prefers-color-scheme: ${theme})" />`,
    );
  }
}

// iOS app: one 1024 px icon (Xcode makes the rest; no transparency, iOS rounds the corners).
await png(icon(1024), join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'));
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await png(splash(2732, 2732, 'light'), join(IOS, 'Splash.imageset', f));
}

// Android app.
const DENSITIES: [string, number][] = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];
for (const [d, k] of DENSITIES) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  await png(icon(legacy, { radius: legacy * 0.18 }), join(ANDROID, `mipmap-${d}/ic_launcher.png`));
  await png(icon(legacy, { circle: true }), join(ANDROID, `mipmap-${d}/ic_launcher_round.png`));
  // Adaptive foreground: 108 dp with the visible part in the inner 66 dp.
  await png(
    svg(fg, fg, ghost(fg / 2, fg * 0.47, fg * 0.36, { shadow: null })),
    join(ANDROID, `mipmap-${d}/ic_launcher_foreground.png`),
  );
}
writeFileSync(
  join(ANDROID, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F4F1E8</color>\n</resources>\n`,
);
const SPLASH: [string, number, number][] = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];
for (const [dir, w, h] of SPLASH)
  await png(splash(w, h, 'light'), join(ANDROID, dir, 'splash.png'));

process.stdout.write(`${links.join('\n')}\n`);
