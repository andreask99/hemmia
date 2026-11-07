import { ConfigError, loadConfig } from '../config/load.ts';
import { publicBaseUrl } from '../config/urls.ts';
import { openDatabase } from '../db/database.ts';
import { createOverrideStore } from '../models/overrides.ts';
import { createAdmin } from '../security/admin.ts';
import { createAuth } from '../security/auth.ts';
import { runAdmin } from './admin.ts';

let code = 1;
try {
  const config = loadConfig(process.env);
  const db = openDatabase(config.dataDir);
  code = runAdmin(process.argv.slice(2), {
    auth: createAuth({ db }),
    admin: createAdmin(db),
    overrides: createOverrideStore(db),
    baseUrl: publicBaseUrl(config.allowedHosts),
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
    formatTime: (ms) =>
      new Date(ms).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }),
  });
  db.close();
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : 'Admin command failed'}\n`);
}
process.exit(code);
