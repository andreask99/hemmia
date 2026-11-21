/**
 * The signed model catalogue (P11.1, DECISIONS.md 2026-11-21): which Ollama models Hemmia
 * suggests, with exact sizes and digests, and which older models each one supersedes. Built and
 * signed weekly by an unattended job on the owner's Mac, served by the relay at GET /v1/catalog
 * as an envelope `{ payload, sig }`; the signature (Ed25519) covers "hemmia-catalog-v1\n" + the
 * payload's bytes. Its key is separate from the release manifest's, because it is used
 * unattended. Even a stolen key can only list Ollama library model names (no `user/model`, no
 * cloud tags): hubs refuse anything else, and nothing is downloaded without an admin's tap.
 * Owned by Claude.
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * An Ollama library model with an explicit tag: `qwen3:30b`, `gemma4:e4b`. No namespace
 * (`user/model`), no registry host, no cloud-only tags (they run on Ollama's servers).
 */
export const LibraryModelName = z
  .string()
  .max(102)
  .regex(/^[a-z0-9][a-z0-9._-]{0,60}:[a-z0-9][a-z0-9._-]{0,39}$/)
  .refine((n) => !/(^|[-:.])cloud($|[-.])/.test(n.split(':')[1] ?? ''), 'no cloud tags');
export type LibraryModelName = z.infer<typeof LibraryModelName>;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CatalogModel = z
  .object({
    ollamaModel: LibraryModelName,
    /** Display name, e.g. "Qwen3 30B". */
    name: z.string().min(1).max(60),
    /** Name stem without version: "qwen" for qwen3.8, "qwen-coder" for qwen3-coder. */
    family: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
    /** The version in the model name ("3.8"), "" when the name has none. */
    version: z.string().regex(/^(\d{1,4}(\.\d{1,4}){0,2})?$/),
    /** Parameter size as Ollama states it ("30b", "e4b"), "" if unknown. */
    params: z.string().max(20),
    downloadBytes: z
      .number()
      .int()
      .positive()
      .max(1024 ** 4),
    /** sha256 of the registry manifest, as Ollama reports it for installed models. */
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    memoryGiB: z.number().positive().max(2048),
    minTotalMemoryGiB: z.number().int().positive().max(4096),
    contextTokens: z.number().int().positive().max(16_777_216),
    vision: z.boolean(),
    tools: z.boolean(),
    think: z.boolean(),
    /** Ollama's pull count for the whole model (all tags) when the catalogue was built. */
    pulls: z.number().int().nonnegative(),
    /** When Ollama last updated the model. */
    releasedAt: Day,
    /** When it joined Hemmia's catalogue ("New" for 30 days). */
    addedAt: Day,
    /** Passed the download-and-answer check on the owner's Mac (else a sibling tag did). */
    tested: z.boolean(),
    /** Older tags this one replaces: an admin using one of them is told about this one. */
    supersedes: z.array(LibraryModelName).max(20),
    /** Short English description from Ollama's library. */
    description: z.string().max(300),
  })
  .strict();
export type CatalogModel = z.infer<typeof CatalogModel>;

export const CatalogPayload = z
  .object({
    v: z.literal(1),
    /** When this catalogue was signed (ms); hubs ignore one older than what they have. */
    signedAt: z.number().int().positive(),
    entries: z
      .array(CatalogModel)
      .max(400)
      .refine((es) => new Set(es.map((e) => e.ollamaModel)).size === es.length, 'duplicate'),
  })
  .strict();
export type CatalogPayload = z.infer<typeof CatalogPayload>;

/** 256 KiB of JSON, base64url-encoded. */
const MAX_PAYLOAD = Math.ceil((256 * 1024 * 4) / 3);

export const CatalogEnvelope = z
  .object({
    payload: z.string().regex(B64URL).max(MAX_PAYLOAD),
    sig: z.string().regex(B64URL).length(86),
  })
  .strict();
export type CatalogEnvelope = z.infer<typeof CatalogEnvelope>;

/** The catalogue key's public half (raw Ed25519, base64url); created 2026-11-21. */
export const CATALOG_PUBLIC_KEY = '09hNy-JrNmvV2TC_X2dyPK_k1xHzjNmNF00vZWWF6NE';

const CONTEXT = Buffer.from('hemmia-catalog-v1\n');

function publicKeyFrom(raw: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw }, format: 'jwk' });
}

/** Signs a catalogue with the catalogue key (PEM, PKCS#8). Throws if it doesn't validate. */
export function signCatalog(catalog: CatalogPayload, privateKeyPem: string): CatalogEnvelope {
  const bytes = Buffer.from(JSON.stringify(CatalogPayload.parse(catalog)));
  const payload = bytes.toString('base64url');
  if (payload.length > MAX_PAYLOAD) throw new Error('catalogue too large');
  const sig = sign(null, Buffer.concat([CONTEXT, bytes]), createPrivateKey(privateKeyPem));
  return { payload, sig: sig.toString('base64url') };
}

/** The catalogue if the envelope is well-formed and signed by `publicKey`, else null. */
export function verifyCatalog(
  envelope: unknown,
  publicKey: string = CATALOG_PUBLIC_KEY,
): CatalogPayload | null {
  const env = CatalogEnvelope.safeParse(envelope);
  if (!env.success) return null;
  try {
    const bytes = Buffer.from(env.data.payload, 'base64url');
    const ok = verify(
      null,
      Buffer.concat([CONTEXT, bytes]),
      publicKeyFrom(publicKey),
      Buffer.from(env.data.sig, 'base64url'),
    );
    if (!ok) return null;
    const parsed = CatalogPayload.safeParse(JSON.parse(bytes.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A model name split into what the successor rule needs (P11.5). */
export interface ModelNameParts {
  /** Before the colon: "qwen3.8". */
  base: string;
  /** After the colon, "latest" when there is none. */
  tag: string;
  /** Name stem without the version: "qwen" (qwen3.8), "qwen-coder" (qwen3-coder). */
  family: string;
  /** Version numbers from the name ([3, 8] for qwen3.8); empty when the name has none. */
  version: number[];
  /** Parameters in billions from the tag ("30b" → 30, "e4b" → 4, "270m" → 0.27), or null. */
  paramsB: number | null;
}

export function parseModelName(name: string): ModelNameParts {
  const colon = name.indexOf(':');
  const base = colon < 0 ? name : name.slice(0, colon);
  const tag = colon < 0 ? 'latest' : name.slice(colon + 1);
  const m = /^(.*?[a-z])-?(\d{1,4}(?:\.\d{1,4}){0,2})([a-z]*)((?:-[a-z0-9.]+)*)$/.exec(base);
  let family = base;
  let version: number[] = [];
  if (m) {
    const stem = (m[1] ?? '').replace(/-$/, '');
    const glued = m[3] ? `-${m[3]}` : '';
    family = `${stem}${glued}${m[4] ?? ''}`;
    version = (m[2] ?? '').split('.').map(Number);
  }
  return { base, tag, family, version, paramsB: paramsFromTag(tag) };
}

/** Billions of parameters in a tag's first part: "30b-a3b" → 30, "8x7b" → 56, "e2b" → 2. */
export function paramsFromTag(tag: string): number | null {
  const m = /^(?:(\d{1,3})x)?e?(\d{1,4}(?:\.\d{1,3})?)([bm])(?:$|-)/.exec(tag);
  if (!m) return null;
  const n = Number(m[2]) * (m[3] === 'm' ? 0.001 : 1) * (m[1] ? Number(m[1]) : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Compares version arrays: >0 when a is newer ([3, 9] vs [3, 8]; [4] vs [3, 9]). */
export function compareModelVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
