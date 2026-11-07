/**
 * Converts screenshots for the website (WEBSITE.md §7):
 *   node scripts/screenshots.ts <file>…     files named <name>.<lang>.png, e.g. m4-connected.de.png
 * Writes public/img/<name>.<lang>.webp (long edge at most 1200 px, metadata dropped) and adds
 * the names and sizes to content/screenshots.json (both languages of a name must have the same
 * size). Use demo data only: check every image before committing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { mergeShots, parseShotFile, Screenshots, type ShotSize } from '../src/screenshots.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIST = join(ROOT, 'content', 'screenshots.json');
const OUT = join(ROOT, 'public', 'img');

const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write('usage: node scripts/screenshots.ts <name>.<lang>.png …\n');
  process.exit(2);
}
const shots = files.map((file) => {
  const shot = parseShotFile(file);
  if (!shot) throw new Error(`${file}: name it <name>.<en|de>.png (name: a-z, 0-9, -)`);
  return { file, ...shot };
});

mkdirSync(OUT, { recursive: true });
const sizes: Record<string, ShotSize> = {};
for (const s of shots) {
  const out = join(OUT, `${s.name}.${s.lang}.webp`);
  // sharp drops EXIF and other metadata unless asked to keep it.
  const info = await sharp(s.file)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(out);
  process.stdout.write(`${out} ${String(info.width)}×${String(info.height)}\n`);
  const seen = sizes[s.name];
  if (seen && (seen.width !== info.width || seen.height !== info.height)) {
    throw new Error(`${s.name}: the languages differ in size`);
  }
  sizes[s.name] = { width: info.width, height: info.height };
}

const existing = existsSync(LIST) ? Screenshots.parse(JSON.parse(readFileSync(LIST, 'utf8'))) : {};
writeFileSync(LIST, `${JSON.stringify(Screenshots.parse(mergeShots(existing, sizes)), null, 2)}\n`);
