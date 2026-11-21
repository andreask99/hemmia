import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type CatalogModel,
  type CatalogPayload,
  LibraryModelName,
  compareModelVersions,
  parseModelName,
  signCatalog,
  verifyCatalog,
} from './catalog.ts';

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    raw: publicKey.export({ format: 'jwk' }).x ?? '',
    key: privateKey,
  };
}

const ENTRY: CatalogModel = {
  ollamaModel: 'qwen3.9:30b',
  name: 'Qwen3.9 30B',
  family: 'qwen',
  version: '3.9',
  params: '30b',
  downloadBytes: 18_556_685_856,
  digest: `sha256:${'a'.repeat(64)}`,
  memoryGiB: 22,
  minTotalMemoryGiB: 32,
  contextTokens: 262_144,
  vision: false,
  tools: true,
  think: true,
  pulls: 1_000_000,
  releasedAt: '2026-11-01',
  addedAt: '2026-11-21',
  tested: true,
  supersedes: ['qwen3.8:30b'],
  description: 'A model.',
};
const CATALOG: CatalogPayload = { v: 1, signedAt: 1000, entries: [ENTRY] };

describe('catalogue signing', () => {
  it('verifies what it signed', () => {
    const k = keys();
    expect(verifyCatalog(signCatalog(CATALOG, k.pem), k.raw)).toEqual(CATALOG);
  });

  it('refuses another key, a changed payload and a bad envelope', () => {
    const k = keys();
    const env = signCatalog(CATALOG, k.pem);
    expect(verifyCatalog(env, keys().raw)).toBeNull();
    const other = signCatalog({ ...CATALOG, signedAt: 2000 }, k.pem);
    expect(verifyCatalog({ payload: other.payload, sig: env.sig }, k.raw)).toBeNull();
    expect(verifyCatalog({ ...env, extra: 1 }, k.raw)).toBeNull();
    expect(verifyCatalog('nope', k.raw)).toBeNull();
  });

  it('refuses a signature made for the release manifest', () => {
    const k = keys();
    const bytes = Buffer.from(JSON.stringify(CATALOG));
    const sig = sign(null, Buffer.concat([Buffer.from('hemmia-manifest-v1\n'), bytes]), k.key);
    expect(
      verifyCatalog(
        { payload: bytes.toString('base64url'), sig: sig.toString('base64url') },
        k.raw,
      ),
    ).toBeNull();
  });

  it('refuses a validly signed payload with a bad entry', () => {
    const k = keys();
    const bad = { ...CATALOG, entries: [{ ...ENTRY, ollamaModel: 'evil/model:latest' }] };
    const bytes = Buffer.from(JSON.stringify(bad));
    const sig = sign(null, Buffer.concat([Buffer.from('hemmia-catalog-v1\n'), bytes]), k.key);
    expect(
      verifyCatalog(
        { payload: bytes.toString('base64url'), sig: sig.toString('base64url') },
        k.raw,
      ),
    ).toBeNull();
    expect(() => signCatalog(bad, k.pem)).toThrow();
  });

  it('refuses duplicate entries', () => {
    expect(() => signCatalog({ ...CATALOG, entries: [ENTRY, ENTRY] }, keys().pem)).toThrow();
  });
});

describe('library model names', () => {
  it.each([
    'qwen3:30b',
    'gemma4:e4b',
    'qwen3-coder:30b',
    'llama3.1:8b-instruct-q4_K_M'.toLowerCase(),
  ])('accepts %s', (n) => {
    expect(LibraryModelName.safeParse(n).success).toBe(true);
  });
  it.each([
    'qwen3',
    'user/model:latest',
    'registry.example.com/x:1',
    'gpt-oss:120b-cloud',
    'qwen3:cloud',
    'Qwen3:30b',
    'qwen3:30b ',
    '../x:1',
  ])('refuses %s', (n) => {
    expect(LibraryModelName.safeParse(n).success).toBe(false);
  });
});

describe('model names', () => {
  it.each([
    ['qwen3.8:30b', 'qwen', [3, 8], 30],
    ['qwen3:30b-a3b', 'qwen', [3], 30],
    ['qwen3-coder:30b', 'qwen-coder', [3], 30],
    ['qwen2.5-coder:7b', 'qwen-coder', [2, 5], 7],
    ['gemma4:e4b', 'gemma', [4], 4],
    ['gemma3n:e2b', 'gemma-n', [3], 2],
    ['llama3.2-vision:11b', 'llama-vision', [3, 2], 11],
    ['deepseek-r1:8b', 'deepseek-r', [1], 8],
    ['mistral-small3.2:24b', 'mistral-small', [3, 2], 24],
    ['gpt-oss:20b', 'gpt-oss', [], 20],
    ['mixtral:8x7b', 'mixtral', [], 56],
    ['gemma3:270m', 'gemma', [3], 0.27],
    ['qwen3.8', 'qwen', [3, 8], null],
    ['ornith-1.5:9b', 'ornith', [1, 5], 9],
    ['nemotron-3.5-super:120b', 'nemotron-super', [3, 5], 120],
    ['minicpm-v4.6:1b', 'minicpm-v', [4, 6], 1],
  ])('%s', (name, family, version, params) => {
    const p = parseModelName(name);
    expect(p.family).toBe(family);
    expect(p.version).toEqual(version);
    expect(p.paramsB).toBe(params);
  });

  it('orders versions', () => {
    expect(compareModelVersions([3, 9], [3, 8])).toBeGreaterThan(0);
    expect(compareModelVersions([4], [3, 9])).toBeGreaterThan(0);
    expect(compareModelVersions([3], [3, 0])).toBe(0);
    expect(compareModelVersions([2, 5], [3])).toBeLessThan(0);
  });
});
