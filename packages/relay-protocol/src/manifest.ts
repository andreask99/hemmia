/**
 * The signed update manifest (P6.7, DECISIONS.md 2026-10-27): which release is current, where
 * its files are, and the minimum safe version. Signed with Ed25519; hubs verify it with the
 * public key built into them (MANIFEST_PUBLIC_KEY) before using anything in it. Served by the
 * relay at GET /v1/manifest as an envelope `{ payload, sig }`: the signature covers
 * "hemmia-manifest-v1\n" + the payload's bytes, so nothing is re-serialised before checking.
 * Owned by Claude.
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

const B64URL = /^[A-Za-z0-9_-]+$/;
const Version = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Https = z
  .string()
  .max(500)
  .refine((u) => u.startsWith('https://'), 'https only');

export const ManifestPlatform = z.enum(['mac', 'docker']);
export type ManifestPlatform = z.infer<typeof ManifestPlatform>;
export const ManifestChannel = z.enum(['stable', 'beta']);
export type ManifestChannel = z.infer<typeof ManifestChannel>;

export const Manifest = z
  .object({
    v: z.literal(1),
    channel: ManifestChannel,
    /** When this manifest was signed (ms); hubs ignore one older than what they have. */
    signedAt: z.number().int().positive(),
    latest: z
      .object({
        version: Version,
        /** Release day, YYYY-MM-DD. */
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** A major version: installed only after the admin's click (P6.6). */
        major: z.boolean(),
        notesUrl: Https,
        files: z
          .object({
            mac: z
              .object({ url: Https, size: z.number().int().positive(), sha256: Sha256 })
              .strict()
              .optional(),
            docker: z
              .object({
                image: z.string().max(200),
                digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
              })
              .strict()
              .optional(),
          })
          .strict(),
      })
      .strict(),
    /** Hubs below this version have known security holes (P2.17); null: none. */
    minimum: Version.nullable(),
  })
  .strict();
export type Manifest = z.infer<typeof Manifest>;

export const ManifestEnvelope = z
  .object({
    payload: z.string().regex(B64URL).max(16_384),
    sig: z.string().regex(B64URL).length(86),
  })
  .strict();
export type ManifestEnvelope = z.infer<typeof ManifestEnvelope>;

/** The release signing key's public half (raw Ed25519, base64url); created 2026-11-07. */
export const MANIFEST_PUBLIC_KEY = 'SzW8eKBGiV6ATcwN6wkg3_RjNPJ-ySy3HeZ8C2_jGA8';

const CONTEXT = Buffer.from('hemmia-manifest-v1\n');

function publicKeyFrom(raw: string): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw },
    format: 'jwk',
  });
}

/** Signs a manifest with the release key (PEM, PKCS#8). */
export function signManifest(manifest: Manifest, privateKeyPem: string): ManifestEnvelope {
  const bytes = Buffer.from(JSON.stringify(Manifest.parse(manifest)));
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.concat([CONTEXT, bytes]), key);
  return { payload: bytes.toString('base64url'), sig: sig.toString('base64url') };
}

/** The manifest if the envelope is well-formed and signed by `publicKey`, else null. */
export function verifyManifest(
  envelope: unknown,
  publicKey: string = MANIFEST_PUBLIC_KEY,
): Manifest | null {
  const env = ManifestEnvelope.safeParse(envelope);
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
    const parsed = Manifest.safeParse(JSON.parse(bytes.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
