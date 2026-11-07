/** The app version: the root package.json `version` (semver; P8.4 sets real versions). */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

function read(): string {
  try {
    const pkg = z
      .object({ version: z.string() })
      .parse(
        JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')),
      );
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export const APP_VERSION = read();
