/**
 * Cloud models: each person's own API keys, their monthly spending cap, and what they spent.
 * Owned by Claude (keys, encryption, per-user isolation).
 *
 * A key is stored encrypted with the user's data key as JSON {key, hint} (column AAD bound to
 * the user and provider), so it can only be used while that user is signed in or a reply of
 * theirs runs. The admin can't read or use it. In clear: which providers have a key, when it
 * was added, the cap, and token counts and estimated cost per month and model (no content).
 */
import { z } from 'zod';
import { type CloudKeyInfo, type CloudProvider, DEFAULT_CLOUD_CAP_CENTS } from '@hemmia/shared';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';
import { localDateTime } from './daily.ts';

const Secret = z.object({ key: z.string().min(1), hint: z.string() });

const PROVIDERS: readonly CloudProvider[] = ['anthropic', 'openai', 'openrouter'];
const isProvider = (p: string): p is CloudProvider => (PROVIDERS as readonly string[]).includes(p);

/** "YYYY-MM" of a time, in the Mac's time zone (as the planner's dates). */
export function monthOf(ms: number): string {
  return localDateTime(ms).date.slice(0, 7);
}

/** Estimated cost in millionths of a US dollar: list prices are dollars per million tokens. */
export function costMicros(
  prices: { inputPerMTok: number; outputPerMTok: number },
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.round(inputTokens * prices.inputPerMTok + outputTokens * prices.outputPerMTok);
}

export function createCloudRepo(db: DB, now: () => number = Date.now) {
  const secretAad = (userId: string, provider: CloudProvider) =>
    aadColumn(userId, 'cloud_keys', provider, 'secret');

  interface KeyRow {
    provider: string;
    secret: Buffer;
    created_at: number;
  }

  function rows(userId: string): KeyRow[] {
    return db
      .prepare<[string], KeyRow>(
        'SELECT provider, secret, created_at FROM cloud_keys WHERE user_id = ? ORDER BY provider',
      )
      .all(userId);
  }

  function open(u: UserKey, r: KeyRow & { provider: CloudProvider }) {
    return Secret.parse(
      JSON.parse(decryptString(u.dek, r.secret, secretAad(u.userId, r.provider))) as unknown,
    );
  }

  /** The cap in cents: the user's choice, or the default when they never chose. */
  function cap(userId: string): number | null {
    const row = db
      .prepare<[string], { cap_cents: number | null }>(
        'SELECT cap_cents FROM cloud_settings WHERE user_id = ?',
      )
      .get(userId);
    return row ? row.cap_cents : DEFAULT_CLOUD_CAP_CENTS;
  }

  function usage(userId: string, month: string) {
    const row = db
      .prepare<
        [string, string],
        { input: number | null; output: number | null; cost: number | null }
      >(
        `SELECT sum(input_tokens) AS input, sum(output_tokens) AS output, sum(cost_micros) AS cost
         FROM cloud_usage WHERE user_id = ? AND month = ?`,
      )
      .get(userId, month);
    return {
      inputTokens: row?.input ?? 0,
      outputTokens: row?.output ?? 0,
      costMicros: row?.cost ?? 0,
    };
  }

  return {
    /** Providers this user has a key for (clear metadata; no key needed). */
    providers(userId: string): ReadonlySet<CloudProvider> {
      return new Set(
        rows(userId)
          .map((r) => r.provider)
          .filter(isProvider),
      );
    },

    /** The user's keys as hints, for the settings screen. */
    list(u: UserKey): CloudKeyInfo[] {
      return rows(u.userId).flatMap((r) => {
        const provider = r.provider;
        if (!isProvider(provider)) return [];
        return [{ provider, hint: open(u, { ...r, provider }).hint, addedAt: r.created_at }];
      });
    },

    /** The user's key for a provider, or null. Callers must not log or keep it. */
    key(u: UserKey, provider: CloudProvider): string | null {
      const r = rows(u.userId).find((x) => x.provider === provider);
      return r ? open(u, { ...r, provider }).key : null;
    },

    /** Saves (or replaces) the user's key for a provider. */
    save(u: UserKey, provider: CloudProvider, key: string): void {
      const secret = encryptString(
        u.dek,
        JSON.stringify({ key, hint: key.slice(-4) }),
        secretAad(u.userId, provider),
      );
      db.prepare(
        `INSERT INTO cloud_keys (user_id, provider, secret, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET secret = excluded.secret,
           created_at = excluded.created_at`,
      ).run(u.userId, provider, secret, now());
    },

    /** Deletes the user's key for a provider. Returns false if there was none. */
    remove(userId: string, provider: CloudProvider): boolean {
      return (
        db
          .prepare('DELETE FROM cloud_keys WHERE user_id = ? AND provider = ?')
          .run(userId, provider).changes > 0
      );
    },

    cap,

    /** Sets the monthly cap in cents (null = no cap). */
    setCap(userId: string, capCents: number | null): void {
      db.prepare(
        `INSERT INTO cloud_settings (user_id, cap_cents) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET cap_cents = excluded.cap_cents`,
      ).run(userId, capCents);
    },

    /** Adds one model call's tokens and estimated cost to this month. */
    record(
      userId: string,
      provider: CloudProvider,
      model: string,
      inputTokens: number,
      outputTokens: number,
      cost: number,
    ): void {
      db.prepare(
        `INSERT INTO cloud_usage (user_id, month, provider, model, input_tokens, output_tokens,
                                  cost_micros)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, month, provider, model) DO UPDATE SET
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cost_micros = cost_micros + excluded.cost_micros`,
      ).run(userId, monthOf(now()), provider, model, inputTokens, outputTokens, cost);
    },

    /** This month's use so far. */
    thisMonth(userId: string) {
      return usage(userId, monthOf(now()));
    },

    /** True when this month's estimated cost has reached the user's cap. */
    overBudget(userId: string): boolean {
      const c = cap(userId);
      return c !== null && usage(userId, monthOf(now())).costMicros >= c * 10_000;
    },
  };
}

export type CloudRepo = ReturnType<typeof createCloudRepo>;
