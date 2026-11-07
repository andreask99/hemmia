import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config/load.ts';
import type { Config } from './config/schema.ts';
import { createWorkerEngine } from './imagegen/process.ts';
import { createOllamaClient } from './llm/ollama.ts';
import { createModelRegistry } from './models/registry.ts';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : 'Failed to load config'}\n`);
  process.exit(1);
}

const llm = createOllamaClient(config.ollamaUrl);
const imageEngine = createWorkerEngine({
  command: [
    'uv',
    'run',
    '--project',
    fileURLToPath(new URL('../../../services/imagegen', import.meta.url)),
    '--frozen',
    'python',
    '-m',
    'kchat_imagegen',
  ],
});
const { app, setup, remote } = await buildApp(config, {
  llm,
  imageEngine,
  registryFactory: (overrides, cloudKeys, capabilities, custom) =>
    createModelRegistry({
      models: config.models,
      llm,
      overrides: () => overrides.get(),
      cloudKeys,
      imagesAvailable: () => capabilities.current().images,
      customEngines: custom.engines,
      customModels: custom.models,
    }),
  ...(config.env === 'production'
    ? { webDistDir: fileURLToPath(new URL('../../web/dist', import.meta.url)) }
    : {}),
});
// Setup mode (SECURITY.md §6.1): the code file is current before the port answers, so an
// installer that waits for /api/health can open the setup page from it (packaging/macos).
const setupCode = setup.ensureCode();
await app.listen({ host: config.host, port: config.port });

// The one place a secret is printed, on stderr, by design.
if (setupCode) {
  process.stderr.write(
    `Hemmia setup: open http://localhost:${String(config.port)}/setup#${setupCode}\n`,
  );
  if (remote && config.connectOnStart) {
    // HEMMIA_CONNECT=1 (headless machines): also the address through the relay, once known.
    void (async () => {
      for (let i = 0; i < 90 && remote.hostnames().length === 0; i++) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      const host = remote.hostnames()[0];
      if (host) process.stderr.write(`Hemmia setup: or open https://${host}/setup#${setupCode}\n`);
    })();
  }
}

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
