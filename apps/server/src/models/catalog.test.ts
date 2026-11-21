import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type CatalogPayload, signCatalog } from '@hemmia/relay-protocol';
import type { CatalogEntry } from '../config/schema.ts';
import { openDatabase } from '../db/database.ts';
import { createCatalogStore, createCatalogSync, fromRemote, mergeCatalog } from './catalog.ts';
import { remoteModel } from './catalog-fixtures.ts';

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    raw: publicKey.export({ format: 'jwk' }).x ?? '',
  };
}

const BUNDLED: CatalogEntry = {
  ollamaModel: 'gemma4:26b',
  label: { en: 'gemma4 26B', de: 'gemma4 26B' },
  description: { en: 'Best all-rounder', de: 'Bester Allrounder' },
  downloadGiB: 17,
  memoryGiB: 22,
  minTotalMemoryGiB: 32,
  vision: true,
  tools: true,
  think: true,
  contextTokens: 131072,
  recommendedFor: { minGiB: 32, maxGiB: null },
};

function serve(bodies: unknown[]) {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl: typeof fetch = (input, init) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    expect(init?.redirect).toBe('error');
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 }),
    );
  };
  return { urls, fetch: fetchImpl };
}

describe('merge', () => {
  it('keeps bundled texts, adds remote facts, then the remote-only models', () => {
    const out = mergeCatalog(
      [BUNDLED],
      [remoteModel('gemma4:26b', { pulls: 7 }), remoteModel('qwen3.9:30b')],
    );
    expect(out.map((e) => e.ollamaModel)).toEqual(['gemma4:26b', 'qwen3.9:30b']);
    expect(out[0]?.description.de).toBe('Bester Allrounder');
    expect(out[0]?.recommendedFor).toEqual({ minGiB: 32, maxGiB: null });
    expect(out[0]?.remote?.pulls).toBe(7);
    expect(out[1]?.downloadGiB).toBe(19);
    expect(out[1]?.contextTokens).toBe(262_144);
    expect(mergeCatalog([BUNDLED], null)).toEqual([BUNDLED]);
  });

  it('shows the English description only in English', () => {
    const e = fromRemote(remoteModel('qwen3.9:30b'));
    expect(e.description).toEqual({ en: 'New model.', de: '', fr: '', it: '' });
  });
});

describe('sync', () => {
  const catalog = (signedAt: number): CatalogPayload => ({
    v: 1,
    signedAt,
    entries: [remoteModel('qwen3.9:30b')],
  });

  it('stores a signed, newer catalogue; sends nothing about the hub', async () => {
    const k = keys();
    const store = createCatalogStore(openDatabase(':memory:'));
    const s = serve([signCatalog(catalog(10), k.pem)]);
    const changes: number[] = [];
    const sync = createCatalogSync({
      relayDomain: 'hemmia.test',
      store,
      enabled: () => true,
      fetch: s.fetch,
      publicKey: k.raw,
      onChange: (c) => {
        changes.push(c.signedAt);
      },
    });
    expect(await sync.sync()).toBe(true);
    expect(s.urls).toEqual(['https://api.hemmia.test/v1/catalog']);
    expect(store.get()?.entries[0]?.ollamaModel).toBe('qwen3.9:30b');
    expect(changes).toEqual([10]);
    // The same one again: nothing new.
    expect(await sync.sync()).toBe(false);
    expect(changes).toEqual([10]);
  });

  it('ignores forged, older and oversized catalogues', async () => {
    const k = keys();
    const store = createCatalogStore(openDatabase(':memory:'));
    store.set(catalog(10));
    const forged = signCatalog(catalog(20), keys().pem);
    const older = signCatalog(catalog(5), k.pem);
    const huge = 'x'.repeat(600 * 1024);
    for (const body of [forged, older, huge, 'not json']) {
      const sync = createCatalogSync({
        relayDomain: 'hemmia.test',
        store,
        enabled: () => true,
        fetch: serve([body]).fetch,
        publicKey: k.raw,
      });
      expect(await sync.sync()).toBe(false);
    }
    expect(store.get()?.signedAt).toBe(10);
  });

  it('asks nothing when switched off or without a relay', async () => {
    const s = serve([]);
    const store = createCatalogStore(openDatabase(':memory:'));
    for (const [relayDomain, on] of [
      ['hemmia.test', false],
      [null, true],
    ] as const) {
      const sync = createCatalogSync({ relayDomain, store, enabled: () => on, fetch: s.fetch });
      expect(await sync.sync()).toBe(false);
    }
    expect(s.urls).toEqual([]);
  });
});
