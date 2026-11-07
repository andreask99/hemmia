/** site:check (WEBSITE.md §2): runs the checks of src/checks.ts over the built site. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brokenLinks,
  externalResources,
  missingTranslations,
  type SiteFile,
} from '../src/checks.ts';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const all: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else all.push(p);
  }
};
walk(DIST);
const rel = (p: string) => `/${relative(DIST, p)}`;
const files: SiteFile[] = all
  .filter((p) => p.endsWith('.html'))
  .map((p) => ({ path: rel(p), html: readFileSync(p, 'utf8') }));
const assets = new Set(all.filter((p) => !p.endsWith('.html')).map(rel));
const problems = [
  ...files.flatMap((f) => externalResources(f.html).map((u) => `${f.path} loads ${u}`)),
  ...brokenLinks(files, assets),
  ...missingTranslations(files),
];
if (problems.length > 0) {
  process.stderr.write(
    `site:check found ${String(problems.length)} problem(s):\n${problems.join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(`site:check ok (${String(files.length)} pages)\n`);
