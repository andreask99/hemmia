import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  HUB_BRIDGE_LEVEL,
  MIN_SHELL_LEVEL,
  type HealthResponse,
  type OllamaSetupStatus,
  type PicturesSetupStatus,
  type SearchSetupStatus,
  type SystemCapabilities,
  type SystemStatus,
} from '@hemmia/shared';
import type { Config } from './config/schema.ts';
import { publicBaseUrl, publicHost } from './config/urls.ts';
import { linksFor, registerLinkRoutes } from './routes/linkcodes.ts';
import { createLinkCodes } from './security/linkcodes.ts';
import { createChatRepo } from './db/chats.ts';
import { type DB, openDatabase } from './db/database.ts';
import { createBriefings } from './chat/briefings.ts';
import { createBriefingWarmer } from './chat/warm.ts';
import { createLeakGuard } from './jobs/leakGuard.ts';
import { createMemoryManager, type EngineControl } from './jobs/memory.ts';
import { createScheduler, type Scheduler } from './jobs/scheduler.ts';
import type { ImageEngine } from './imagegen/types.ts';
import { type CloudProvider, type LlmClient, LlmError } from './llm/types.ts';
import { createAnthropicClient } from '@hemmia/providers';
import type { FetchLike } from '@hemmia/providers';
import { createOpenAiClient } from '@hemmia/providers';
import { createOpenRouterClient } from '@hemmia/providers';
import { chatCompletions } from '@hemmia/providers';
import { createEngineStore, engineSleeping, listEngineModels } from './models/engines.ts';
import { registerAdminEngineRoutes } from './routes/admin-engines.ts';
import { registerAdminModelRoutes } from './routes/admin-models.ts';
import { registerAdminRemoteRoutes } from './routes/admin-remote.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerDeviceRoutes } from './routes/devices.ts';
import { createGate } from './security/gate.ts';
import { createSetup, type Setup } from './security/setup.ts';
import type { RemoteAccess } from './relay/remote.ts';
import { createRemoteAccess } from './relay/remote.ts';
import { createConnectWatch } from './relay/watch.ts';
import { createPullManager } from './models/pulls.ts';
import { createLocalEngineFetch } from './security/localengine.ts';
import { createCloudRepo } from './db/cloud.ts';
import { registerCloudRoutes } from './routes/cloud.ts';
import { createOverrideStore, type OverrideStore } from './models/overrides.ts';
import type { ModelRegistry } from './models/types.ts';
import { createLoggerOptions } from './logger.ts';
import { registerPushRoutes } from './routes/push.ts';
import { createSystemStatus } from './system/status.ts';
import { createKeepAwake } from './system/keepawake.ts';
import { APP_VERSION } from './system/version.ts';
import { hubAgent } from '@hemmia/relay-protocol';
import { createUpdateCheck } from './system/updates.ts';
import {
  type Capabilities,
  createCapabilities,
  defaultProbes,
  optimisticCapabilities,
  staticCapabilities,
} from './system/capabilities.ts';
import { registerAgentRoutes } from './routes/agents.ts';
import { createAgentRepo } from './db/agents.ts';
import { createDailyRepo } from './db/daily.ts';
import { createProfileRepo } from './db/profile.ts';
import { registerDailyRoutes, sendDueDaily } from './routes/daily.ts';
import { registerProfileRoutes } from './routes/profile.ts';
import type { runWebSearch } from './tools/websearch.ts';
import type { findPhotos } from './tools/webphotos.ts';
import type { readLinkedPage } from './tools/readpage.ts';
import { createPush } from './security/push.ts';
import { createPushRefs } from './security/pushref.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerAttachmentRoutes } from './routes/attachments.ts';
import { registerAuthRoutes, userAgentLabel } from './routes/auth.ts';
import { registerChatRoutes } from './routes/chats.ts';
import { registerImportRoutes } from './routes/import.ts';
import { registerMessageRoutes } from './routes/messages.ts';
import { registerModelRoutes } from './routes/models.ts';
import { createAdmin } from './security/admin.ts';
import { type AttachmentStore, createAttachmentStore } from './security/attachments.ts';
import { type Auth, createAuth } from './security/auth.ts';
import type { KdfParams } from './security/crypto.ts';
import {
  currentUser,
  HttpError,
  requireAdmin,
  requireUser,
  cookieSettings,
  registerSecurity,
} from './security/http.ts';
import { createOllamaManager, type OllamaDeps } from './system/ollama.ts';
import type { PicturesManager } from './system/pictures.ts';
import { createSearchManager, type SearchDeps } from './system/search.ts';
import { registerWebApp } from './static.ts';

export interface AppOverrides {
  db?: DB;
  kdfParams?: KdfParams;
  now?: () => number;
  /** Replace the commands and HTTP behind the admin system view (tests). */
  systemExec?: (cmd: string, args: string[]) => Promise<string>;
  systemFetch?: typeof fetch;
  /** Replaces the web search (tests). */
  webSearchRun?: typeof runWebSearch;
  /** Replaces the photo search (tests). */
  webPhotosRun?: typeof findPhotos;
  /** Replaces reading linked pages (tests). */
  webPageRead?: typeof readLinkedPage;
  /** Sends push notifications (tests); default: global fetch. */
  pushFetch?: typeof fetch;
  /** Chat engine and model registry. Chat routes are only registered when both exist. */
  llm?: LlmClient;
  registry?: ModelRegistry;
  /**
   * Builds the registry with access to the admin's model settings and to which cloud
   * providers each user has a key for (production).
   */
  registryFactory?: (
    overrides: OverrideStore,
    cloudKeys: (userId: string) => ReadonlySet<CloudProvider>,
    capabilities: Capabilities,
    custom: CustomEngineAccess,
  ) => ModelRegistry;
  /** Replaces the HTTPS requests to the cloud providers (tests). */
  cloudFetch?: FetchLike;
  /** Image engine; the image route is registered when present (with llm and registry). */
  imageEngine?: ImageEngine;
  /** Built web app to serve (production). */
  webDistDir?: string;
  /** What this computer can do; default: detected (tests: everything available). */
  capabilities?: Capabilities;
  /** Pictures set up by Hemmia (main.ts); absent in tests unless given. */
  pictures?: PicturesManager;
  /** Side effects of the web search installer (tests). */
  searchDeps?: Partial<SearchDeps>;
  /** Side effects of the Ollama installer (tests). */
  ollamaDeps?: Partial<OllamaDeps>;
  /** Requests to admin-added local servers; default: security/localengine.ts (tests). */
  localEngineFetch?: FetchLike;
  /** Tests: fast certificate polling and reconnects for remote access. */
  fastRemote?: boolean;
  /** Tests: how long turning Connect on waits for the tunnel. */
  remoteWaitMs?: number;
}

/** Admin-added local servers as the registry sees them (P1.7). */
export interface CustomEngineAccess {
  engines: () => readonly { id: string; label: string }[];
  models: () => Promise<{ engineId: string; engineLabel: string; models: string[] }[]>;
}

export interface App {
  app: FastifyInstance;
  /** Setup mode (first admin); main.ts prints the setup link. */
  setup: Setup;
  /** Remote access, when this build knows a relay. */
  remote: RemoteAccess | null;
  db: DB;
  auth: Auth;
  scheduler: Scheduler;
  attachments: AttachmentStore;
}

/** Unsent uploads are deleted after a day. */
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Ollama as the memory manager sees it. Ollama under-reports some models' size (gemma4:26b
 * shows 0.9 GiB but holds ~18 GiB), so the configured size wins when it is larger.
 */
function ollamaControl(llm: LlmClient, config: Config): EngineControl {
  const configured = new Map(config.models.chatModels.map((m) => [m.ollamaModel, m.memoryGiB]));
  return {
    name: 'ollama',
    loaded: async () =>
      (await llm.loaded()).map((m) => ({
        model: m.model,
        memoryGiB: Math.max(m.memoryGiB, configured.get(m.model) ?? 0),
      })),
    unload: (model) => llm.unload(model),
  };
}

/** The image worker as the memory manager sees it (sizes from config/models.json). */
function imageControl(engine: ImageEngine, config: Config): EngineControl {
  const configured = new Map(config.models.imageModels.map((m) => [m.mfluxModel, m.memoryGiB]));
  return {
    name: 'imagegen',
    loaded: async () =>
      (await engine.loaded()).map((m) => ({
        model: m.model,
        memoryGiB: Math.max(m.memoryGiB, configured.get(m.model) ?? 0),
      })),
    unload: (model) => engine.unload(model),
  };
}

/** Memory the models may use together (32 GB Mac: leaves ~10 GB for macOS and the app). */
const MODEL_MEMORY_BUDGET_GIB = 22;

/** JSON request bodies; uploads raise this per route. */
const BODY_LIMIT = 256 * 1024;

export async function buildApp(config: Config, overrides: AppOverrides = {}): Promise<App> {
  const app = Fastify({
    logger: createLoggerOptions(config),
    // Tailscale serve connects from loopback and sets X-Forwarded-For to the tailnet
    // client; trust it only from loopback so rate limits see real client addresses.
    // In a container every connection arrives from the runtime's gateway: trust nothing.
    trustProxy: config.container ? false : ['127.0.0.1', '::1'],
    bodyLimit: BODY_LIMIT,
  });
  const db = overrides.db ?? openDatabase(config.dataDir);
  const auth = createAuth({
    db,
    ...(overrides.kdfParams ? { kdfParams: overrides.kdfParams } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
  });

  // Remote access through the relay (P2.12): only when this build knows a relay.
  const remote = config.relayDomain
    ? createRemoteAccess({
        config,
        db,
        server: () => app.server,
        log: {
          info: (obj, msg) => {
            app.log.info(obj, msg);
          },
          warn: (obj, msg) => {
            app.log.warn(obj, msg);
          },
        },
        agent: hubAgent(APP_VERSION),
        ...(overrides.now ? { now: overrides.now } : {}),
        ...(overrides.fastRemote ? { fast: true } : {}),
      })
    : null;
  const gate = createGate({
    db,
    secure: cookieSettings(config).secure,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  registerSecurity(app, {
    config,
    auth,
    gate,
    ...(remote ? { extraHosts: () => remote.hostnames() } : {}),
  });
  registerDeviceRoutes(app, { gate });
  const linkAddresses = {
    relayDomain: config.relayDomain,
    hubHost: () => remote?.hostnames()[0] ?? null,
    publicHost: () => publicHost(config.allowedHosts),
  };
  registerLinkRoutes(app, {
    db,
    auth,
    gate,
    links: createLinkCodes({ db, ...(overrides.now ? { now: overrides.now } : {}) }),
    cookie: cookieSettings(config),
    linkAddresses,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  registerAdminRemoteRoutes(app, {
    remote,
    db,
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.remoteWaitMs !== undefined ? { waitMs: overrides.remoteWaitMs } : {}),
  });
  if (remote) {
    app.addHook('onReady', async () => {
      remote.startup();
    });
    app.addHook('onClose', async () => {
      remote.close();
    });
  }

  const capabilities =
    overrides.capabilities ??
    (config.env === 'test'
      ? // Tests run as on the Mac hub on any machine (CI is Linux); tests for other platforms
        // pass their own capabilities.
        staticCapabilities(optimisticCapabilities('darwin', 'arm64'))
      : createCapabilities(
          defaultProbes({
            ollamaUrl: config.ollamaUrl,
            searxngUrl: config.searxngUrl,
            dataDir: config.dataDir,
            imageProjectDir: fileURLToPath(new URL('../../../services/imagegen', import.meta.url)),
            ...(overrides.pictures ? { managedImages: overrides.pictures.managed } : {}),
          }),
        ));
  app.addHook('onReady', async () => {
    capabilities.start();
  });
  app.addHook('onClose', async () => {
    capabilities.stop();
  });
  app.get('/api/capabilities', { preHandler: requireUser }, async (): Promise<SystemCapabilities> =>
    capabilities.current(),
  );

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', bridge: HUB_BRIDGE_LEVEL, minShell: MIN_SHELL_LEVEL };
  });
  // With an injected (test) database, blobs stay in memory too.
  const attachments = createAttachmentStore({
    db,
    dataDir: overrides.db ? ':memory:' : config.dataDir,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  await registerAttachmentRoutes(app, {
    store: attachments,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  const daily = createDailyRepo(db, overrides.now);
  const pushRefs = createPushRefs(db, overrides.now);
  const push = createPush({
    db,
    subject: publicBaseUrl(config.allowedHosts),
    log: {
      info: (obj, msg) => {
        app.log.info(obj, msg);
      },
      warn: (obj, msg) => {
        app.log.warn(obj, msg);
      },
    },
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.pushFetch ? { fetch: overrides.pushFetch } : {}),
    native: { client: () => remote?.relayClient() ?? null, refs: pushRefs, appId: config.appId },
  });
  registerPushRoutes(app, push, { db, refs: pushRefs });
  registerDailyRoutes(app, { daily, ...(overrides.now ? { now: overrides.now } : {}) });
  const profiles = createProfileRepo(db, overrides.now);
  registerProfileRoutes(app, { profiles });
  const llm = overrides.llm;
  const agents = createAgentRepo(db, overrides.now);
  const imageEngine = overrides.imageEngine;
  const modelOverrides = createOverrideStore(db, overrides.now);
  // Cloud models: each user's own keys (encrypted), spending, and the provider clients.
  const cloudRepo = createCloudRepo(db, overrides.now);
  const cloudFetch = overrides.cloudFetch ? { fetch: overrides.cloudFetch } : {};
  const cloudClients = {
    anthropic: createAnthropicClient(cloudFetch),
    openai: createOpenAiClient(cloudFetch),
    openrouter: createOpenRouterClient(cloudFetch),
  };
  registerCloudRoutes(app, {
    cloud: cloudRepo,
    clients: cloudClients,
    mode: () => modelOverrides.get().cloud,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  // Admin-added local servers (LM Studio, llama.cpp, vLLM): address rule in localengine.ts.
  const engineStore = createEngineStore(db, overrides.now);
  const localFetch = overrides.localEngineFetch ?? createLocalEngineFetch();
  const customAccess: CustomEngineAccess = {
    engines: () => engineStore.list(),
    models: () =>
      Promise.all(
        engineStore.list().map(async (e) => ({
          engineId: e.id,
          engineLabel: e.label,
          models: await listEngineModels(localFetch, e.baseUrl).catch(() => []),
        })),
      ),
  };
  registerAdminEngineRoutes(app, {
    engines: engineStore,
    overrides: modelOverrides,
    capabilities,
    ollamaUrl: config.ollamaUrl,
    localFetch,
  });
  if (llm) {
    const pulls = createPullManager({
      llm,
      paused: () => modelOverrides.get().paused,
      diskFreeGiB: async () => (await capabilities.refresh()).diskFreeGiB,
      catalog: config.catalog,
      offer: async (model, entry) => {
        // Already offered by the config file or an earlier download: nothing to add.
        const known =
          config.models.chatModels.find((m) => m.ollamaModel === model) ??
          modelOverrides
            .get()
            .extraModels.find((m) => m.engine === 'ollama' && m.engineModel === model);
        if (known) return known.id;
        const sizeGiB =
          (await llm.installed().catch(() => [])).find((m) => m.model === model)?.sizeGiB ?? 0;
        const slug = model
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const id = `x-${slug}`.slice(0, 32);
        const current = modelOverrides.get();
        modelOverrides.set({
          ...current,
          extraModels: [
            ...current.extraModels.filter((m) => m.id !== id),
            {
              id,
              engineModel: model,
              label: entry?.label.en ?? model,
              memoryGiB: entry?.memoryGiB ?? Math.ceil(sizeGiB * 1.15 + 1),
              engine: 'ollama',
              vision: false,
              tools: false,
            },
          ],
        });
        return id;
      },
    });
    registerAdminModelRoutes(app, { catalog: config.catalog, capabilities, llm, pulls });
  }
  const registry =
    overrides.registry ??
    overrides.registryFactory?.(
      modelOverrides,
      (userId) => cloudRepo.providers(userId),
      capabilities,
      customAccess,
    );
  const ownsModel = (engine: string, model: string) =>
    engine !== 'ollama' ||
    config.models.chatModels.some((m) => m.ollamaModel === model) ||
    modelOverrides.get().extraModels.some((m) => m.engineModel === model);
  const memory = createMemoryManager({
    engines: [
      ...(llm ? [ollamaControl(llm, config)] : []),
      ...(imageEngine ? [imageControl(imageEngine, config)] : []),
    ],
    budgetGiB: MODEL_MEMORY_BUDGET_GIB,
    // Only kchat's own models may be unloaded; others (e.g. local-dev's coding model) stay.
    owns: ownsModel,
    paused: () => modelOverrides.get().paused,
  });
  const scheduler = createScheduler({
    memory,
    onError: (err, job) => {
      app.log.error({ err, jobId: job.id, kind: job.kind }, 'job failed');
    },
  });
  if (registry) {
    registerModelRoutes(app, { registry, ...(llm ? { llm } : {}) });
    registerChatRoutes(app, {
      repo: createChatRepo(db, overrides.now),
      registry,
      deleteBlobs: (ids) => attachments.deleteBlobs(ids),
      agents,
      ...(overrides.now ? { now: overrides.now } : {}),
    });
    registerImportRoutes(app, {
      db,
      repo: createChatRepo(db, overrides.now),
      registry,
      attachments,
      ...(overrides.now ? { now: overrides.now } : {}),
    });
    registerAgentRoutes(app, {
      agents,
      registry,
      scheduler,
      paused: () => modelOverrides.get().paused,
      ...(llm ? { llm } : {}),
    });
  }
  if (llm && registry) {
    registerMessageRoutes(app, {
      repo: createChatRepo(db, overrides.now),
      llm,
      scheduler,
      registry,
      briefings: createBriefings({
        repo: createChatRepo(db, overrides.now),
        registry,
        deleteBlobs: (ids) => attachments.deleteBlobs(ids),
        ...(overrides.now ? { now: overrides.now } : {}),
      }),
      agents,
      daily,
      profiles,
      paused: () => modelOverrides.get().paused,
      cloud: {
        clients: cloudClients,
        key: (user, provider) => cloudRepo.key(user, provider),
        record: (userId, provider, model, input, output, cost) => {
          cloudRepo.record(userId, provider, model, input, output, cost);
        },
      },
      overBudget: (userId) => cloudRepo.overBudget(userId),
      notify: (userId, payload) => push.notify(userId, payload),
      webSearch: (viewer) => {
        if (!capabilities.current().webSearch) return null;
        const mode = modelOverrides.get().webSearch;
        if (mode === 'off' || (mode === 'adults' && viewer.restricted)) return null;
        return {
          searxngUrl: config.searxngUrl,
          safeSearch: viewer.restricted ? 2 : 1,
          ...(overrides.webSearchRun ? { run: overrides.webSearchRun } : {}),
        };
      },
      webPhotos: {
        attachments,
        ...(overrides.webPhotosRun ? { run: overrides.webPhotosRun } : {}),
      },
      webPages: overrides.webPageRead ? { read: overrides.webPageRead } : {},
      localEngines: {
        chat: (engineId, request) => {
          const engine = engineStore.get(engineId);
          if (!engine) throw new LlmError('unavailable');
          return chatCompletions({ baseUrl: engine.baseUrl, fetch: localFetch }, request);
        },
        sleeping: async (engineId) => {
          const engine = engineStore.get(engineId);
          return engine ? engineSleeping(localFetch, engine.baseUrl) : false;
        },
      },
      ...(imageEngine
        ? {
            images: {
              engine: imageEngine,
              attachments,
              defaultModelId: () =>
                modelOverrides.get().imagesOff || !capabilities.current().images
                  ? null
                  : (modelOverrides.get().defaultImageModel ?? config.models.defaultImageModel),
            },
          }
        : {}),
      loadDocument: (user, id) => attachments.readText(user, id),
      loadScans: async (user, id) =>
        (await attachments.readScans(user, id)).map((b) => b.toString('base64')),
      needsVision: (user, ids) => attachments.needsVision(user, ids),
      ...(imageEngine
        ? {
            imageTool: {
              engine: imageEngine,
              attachments,
              models: (viewer: { restricted: boolean }) => {
                const o = modelOverrides.get();
                const defaultId =
                  o.imagesOff || !capabilities.current().images
                    ? null
                    : (o.defaultImageModel ?? config.models.defaultImageModel);
                const plain = defaultId ? registry.imageModel(defaultId, viewer) : null;
                const textModel = config.models.imageModels.find((m) => m.goodAtText);
                const text = plain && textModel ? registry.imageModel(textModel.id, viewer) : null;
                return { plain, text };
              },
            },
          }
        : {}),
      loadImage: async (user, id) => {
        const found = await attachments.read(user, id);
        if (!found) throw new Error('attachment missing');
        return found.bytes.toString('base64');
      },
      ...(overrides.now ? { now: overrides.now } : {}),
    });
  }

  const system = createSystemStatus({
    db,
    ollamaUrl: config.ollamaUrl,
    searxngUrl: config.searxngUrl,
    dataDir: config.dataDir,
    configuredGiB: (model) =>
      config.models.chatModels.find((m) => m.ollamaModel === model)?.memoryGiB ??
      modelOverrides.get().extraModels.find((m) => m.engineModel === model)?.memoryGiB ??
      config.models.imageModels.find((m) => m.mfluxModel === model)?.memoryGiB ??
      0,
    owns: ownsModel,
    snapshot: () => scheduler.snapshot(),
    paused: () => modelOverrides.get().paused,
    imageModels: async () => (imageEngine ? imageEngine.loaded() : []),
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.systemExec ? { exec: overrides.systemExec } : {}),
    ...(overrides.systemFetch ? { fetch: overrides.systemFetch } : {}),
  });
  // Keep a Mac awake while it must be reachable (remote access on, or a tailnet name set).
  const keepAwake = createKeepAwake({
    needed: () => (remote?.hostnames().length ?? 0) > 0 || publicHost(config.allowedHosts) !== null,
  });
  if (config.env !== 'test') {
    const check = setInterval(() => {
      keepAwake.update();
    }, 60_000);
    check.unref();
    app.addHook('onReady', async () => {
      keepAwake.update();
    });
    app.addHook('onClose', async () => {
      clearInterval(check);
      keepAwake.stop();
    });
  }
  // Packaged builds look for a newer release once a day (HEMMIA_UPDATE_CHECK=1).
  const updates = createUpdateCheck({
    relayDomain: config.relayDomain,
    currentVersion: APP_VERSION,
    platform: config.container ? 'docker' : 'mac',
  });
  if (config.updateCheck && config.env !== 'test') {
    app.addHook('onReady', async () => {
      updates.start();
    });
    app.addHook('onClose', async () => {
      updates.stop();
    });
  }
  app.get('/api/admin/system', { preHandler: requireAdmin }, async (): Promise<SystemStatus> => {
    return { ...(await system.get()), keepAwake: keepAwake.active(), update: updates.latest() };
  });

  // Ollama installed and run by Hemmia on a Mac without one (system/ollama.ts).
  const ollama = createOllamaManager({
    db,
    dataDir: config.dataDir,
    ollamaUrl: config.ollamaUrl,
    platform: config.env === 'test' && !overrides.ollamaDeps ? 'linux' : process.platform,
    container: config.container,
    log: {
      info: (obj, msg) => {
        app.log.info(obj, msg);
      },
      warn: (obj, msg) => {
        app.log.warn(obj, msg);
      },
    },
    ...(overrides.ollamaDeps ? { deps: overrides.ollamaDeps } : {}),
  });
  app.addHook('onReady', async () => {
    await ollama.start();
  });
  app.addHook('onClose', async () => {
    ollama.close();
  });
  app.get('/api/admin/ollama', { preHandler: requireAdmin }, async (): Promise<OllamaSetupStatus> =>
    ollama.status(),
  );
  // Pictures set up by Hemmia (system/pictures.ts); not registered without a manager (tests).
  const pictures = overrides.pictures;
  if (pictures) {
    let wasReady = pictures.managed();
    app.get(
      '/api/admin/pictures',
      { preHandler: requireAdmin },
      async (): Promise<PicturesSetupStatus> => {
        // Pictures that already work another way (a developer setup, the family hub) are ready.
        if (!pictures.managed() && capabilities.current().images) return { state: 'ready' };
        const status = await pictures.status();
        // Just finished: the apps should offer pictures now, not after the next check.
        if (status.state === 'ready' && !wasReady) {
          wasReady = true;
          await capabilities.refresh();
        }
        return status;
      },
    );
    app.post('/api/admin/pictures/install', { preHandler: requireAdmin }, async (req, reply) => {
      if (capabilities.current().images || !pictures.beginInstall()) {
        throw new HttpError(409, 'refused');
      }
      db.prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)').run(
        currentUser(req).userId,
        'pictures_install',
        Date.now(),
      );
      return reply.code(202).send(await pictures.status());
    });
  }

  // Web search set up by Hemmia on a Mac (system/search.ts).
  const search = createSearchManager({
    dataDir: config.dataDir,
    projectDir: fileURLToPath(new URL('../../../services/searxng', import.meta.url)),
    searxngUrl: config.searxngUrl,
    platform: config.env === 'test' && !overrides.searchDeps ? 'linux' : process.platform,
    arch: process.arch,
    container: config.container,
    log: {
      info: (obj, msg) => {
        app.log.info(obj, msg);
      },
      warn: (obj, msg) => {
        app.log.warn(obj, msg);
      },
    },
    ...(overrides.searchDeps ? { deps: overrides.searchDeps } : {}),
  });
  app.addHook('onReady', async () => {
    await search.start();
  });
  app.addHook('onClose', async () => {
    search.close();
  });
  app.get(
    '/api/admin/search-setup',
    { preHandler: requireAdmin },
    async (): Promise<SearchSetupStatus> => {
      const status = await search.status();
      // Search just came up: the apps should offer it now, not after the next check.
      if (status.state === 'ready' && !capabilities.current().webSearch) {
        await capabilities.refresh();
      }
      return status;
    },
  );
  app.post('/api/admin/search-setup/install', { preHandler: requireAdmin }, async (req, reply) => {
    if (!(await search.beginInstall())) throw new HttpError(409, 'refused');
    db.prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)').run(
      currentUser(req).userId,
      'search_install',
      Date.now(),
    );
    return reply.code(202).send(await search.status());
  });

  app.post('/api/admin/ollama/install', { preHandler: requireAdmin }, async (req, reply) => {
    if (!(await ollama.beginInstall())) throw new HttpError(409, 'refused');
    db.prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)').run(
      currentUser(req).userId,
      'ollama_install',
      Date.now(),
    );
    return reply.code(202).send(await ollama.status());
  });

  const setup = createSetup({
    db,
    dataDir: overrides.db ? ':memory:' : config.dataDir,
    needsSetup: () => auth.needsSetup(),
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  registerSetupRoutes(app, {
    db,
    auth,
    setup,
    cookie: cookieSettings(config),
    capabilities,
    onCreated: (req, reply, userId, sessionId) => {
      gate.bindSession(req, reply, userId, sessionId, userAgentLabel(req.headers['user-agent']));
    },
    ...(overrides.now ? { now: overrides.now } : {}),
  });

  registerAuthRoutes(app, {
    auth,
    cookie: cookieSettings(config),
    onSession: (req, reply, userId, sessionId) => {
      gate.bindSession(req, reply, userId, sessionId, userAgentLabel(req.headers['user-agent']));
    },
    deviceOf: (req, username) => req.device !== null && gate.ownedBy(req.device, username),
    onLogoutAll: (req, userId) => {
      gate.removeOthers(userId, req.device);
    },
    ...(overrides.now ? { now: overrides.now } : {}),
  });

  registerAccountRoutes(app, {
    auth,
    ...(overrides.now ? { now: overrides.now } : {}),
    admin: createAdmin(db, overrides.now),
    ...(registry ? { registry } : {}),
    inviteBaseUrl: publicBaseUrl(config.allowedHosts),
    inviteLinks: (code) => linksFor(linkAddresses, 'i', code),
    models: { file: config.models, overrides: modelOverrides },
    freeMemory: () => freeMemoryIfPaused(),
    ...(llm?.check ? { checkModel: llm.check.bind(llm) } : {}),
  });

  if (overrides.webDistDir) await registerWebApp(app, overrides.webDistDir);

  // While paused, free kchat's models once no job runs. Also picks up a pause set from the
  // admin CLI, which can't reach the running server.
  let freeing = false;
  async function freeMemoryIfPaused(): Promise<void> {
    if (freeing || !modelOverrides.get().paused || !scheduler.idle()) return;
    freeing = true;
    try {
      const freed = await memory.releaseOwned();
      if (freed.length > 0)
        app.log.info({ models: freed.map((r) => r.model) }, 'paused: models unloaded');
    } catch (err) {
      app.log.error({ err }, 'unloading models for pause failed');
    } finally {
      freeing = false;
    }
  }
  const pauseSweep = setInterval(() => {
    void freeMemoryIfPaused();
  }, 20_000);
  pauseSweep.unref();

  // Leak guard: unload a model whose memory grew more than 3 GB since loading (Ollama's
  // MLX runner leaks per tool call, #18620), once nothing runs. Raw engine sizes here.
  const leakGuard = llm
    ? createLeakGuard({
        loaded: () => llm.loaded(),
        unload: (model) => llm.unload(model),
        idle: () => scheduler.idle(),
        owns: (model) => ownsModel('ollama', model),
      })
    : null;
  const leakSweep = setInterval(() => {
    void leakGuard
      ?.check()
      .then((freed) => {
        for (const f of freed)
          app.log.info(
            { model: f.model, cleanGiB: f.baseGiB.toFixed(1), grownGiB: f.nowGiB.toFixed(1) },
            'leak guard: model unloaded to free leaked memory',
          );
      })
      .catch((err: unknown) => {
        app.log.error({ err }, 'leak guard failed');
      });
  }, 60_000);
  leakSweep.unref();

  // Planner: every 30 s, send the morning, weekly planning and evening notifications that
  // are due (content-free push).
  const dailyTimer = setInterval(() => {
    void sendDueDaily(
      daily,
      (userId, payload) => push.notify(userId, payload),
      (overrides.now ?? Date.now)(),
    ).catch((err: unknown) => {
      app.log.error({ err }, 'daily notifications failed');
    });
  }, 30_000);
  dailyTimer.unref();

  // Connect watch: tells the admins when Connect has been down for 10 minutes, and when it is back.
  const connectWatch = remote
    ? createConnectWatch({
        status: () => remote.status(),
        notify: async (up) => {
          const admins = db
            .prepare<[], { id: string; language: 'en' | 'de' }>(
              "SELECT id, language FROM users WHERE role = 'admin' AND disabled_at IS NULL",
            )
            .all();
          for (const a of admins) {
            await push.notify(a.id, { kind: 'connect', chatId: '', lang: a.language, ok: up });
          }
        },
        log: {
          info: (obj, msg) => {
            app.log.info(obj, msg);
          },
          warn: (obj, msg) => {
            app.log.warn(obj, msg);
          },
        },
        ...(overrides.now ? { now: overrides.now } : {}),
      })
    : null;
  const connectTimer = setInterval(() => {
    void connectWatch?.check();
  }, 60_000);
  connectTimer.unref();

  // Planner: load the chat model a few minutes before a notification, so the reply the phone
  // starts when it arrives doesn't wait for loading.
  const warmer =
    llm && registry
      ? createBriefingWarmer({
          daily,
          registry,
          llm,
          scheduler,
          paused: () => modelOverrides.get().paused,
          ...(overrides.now ? { now: overrides.now } : {}),
        })
      : null;
  const warmTimer = setInterval(() => {
    void warmer
      ?.check()
      .then((models) => {
        if (models.length > 0) app.log.info({ models }, 'planner: model loaded ahead');
      })
      .catch((err: unknown) => {
        app.log.error({ err }, 'planner warm-up failed');
      });
  }, 30_000);
  warmTimer.unref();

  const cleanup = setInterval(() => {
    attachments.cleanupOrphans(ORPHAN_MAX_AGE_MS).catch((err: unknown) => {
      app.log.error({ err }, 'orphan cleanup failed');
    });
  }, 60 * 60_000);
  cleanup.unref();

  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    clearInterval(pauseSweep);
    clearInterval(leakSweep);
    clearInterval(dailyTimer);
    clearInterval(connectTimer);
    clearInterval(warmTimer);
    await scheduler.shutdown();
    await imageEngine?.shutdown();
    if (!overrides.db) db.close();
  });

  await app.ready();
  return { app, db, auth, scheduler, attachments, setup, remote };
}
