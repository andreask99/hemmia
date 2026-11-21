/**
 * Replacing and deleting Ollama models from Settings → Models (P11.6). Admin only (routes).
 *
 * Replace (after the new model is downloaded): the new model is offered, and everything that
 * used the old one moves over in one transaction: each person's default model, chats, agents,
 * the family default and the switched-off list. Adults-only carries over, so a teen account
 * never gains a model through an update. The old model stops being offered but stays on disk
 * until the admin deletes it.
 *
 * Delete: refused while a reply or picture runs or waits (it might use the model) and when it
 * is the last local model. People whose default it was fall back to the family default; chats
 * keep their id and use the server's existing fallback to a local model. Owned by Claude.
 */
import type { ChatModelConfig } from '../config/schema.ts';
import type { DB } from '../db/database.ts';
import type { LlmClient } from '../llm/types.ts';
import type { OverrideStore } from './overrides.ts';
import { type UpdateStateStore, withTag } from './updates.ts';

export type LifecycleErrorCode =
  'busy' | 'not_installed' | 'not_offered' | 'last_model' | 'unavailable';

export class LifecycleError extends Error {
  readonly code: LifecycleErrorCode;
  constructor(code: LifecycleErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface LifecycleDeps {
  db: DB;
  overrides: OverrideStore;
  /** Chat models from config/models.json. */
  configModels: readonly ChatModelConfig[];
  llm: Pick<LlmClient, 'installed' | 'unload' | 'remove'>;
  /** Offers a downloaded Ollama model (adds it to the family's models); returns its id. */
  offer: (model: string) => Promise<string>;
  /** True when no job runs or waits for the GPU. */
  idle: () => boolean;
  updateState: UpdateStateStore;
  /** The catalogue digest for a model, if the catalogue has it. */
  catalogDigest: (model: string) => string | null;
}

export function createModelLifecycle(deps: LifecycleDeps) {
  const same = (a: string, b: string) => withTag(a) === withTag(b);

  /** The id under which the family is offered this Ollama model, or null. */
  function offeredId(model: string): string | null {
    const o = deps.overrides.get();
    const cfg = deps.configModels.find(
      (m) => same(m.ollamaModel, model) && !o.disabled.includes(m.id),
    );
    if (cfg) return cfg.id;
    return (
      o.extraModels.find((m) => m.engine === 'ollama' && same(m.engineModel, model))?.id ?? null
    );
  }

  function adultOnly(id: string): boolean {
    const cfg = deps.configModels.find((m) => m.id === id);
    if (cfg) return cfg.adultOnly;
    return deps.overrides.get().extraModels.find((m) => m.id === id)?.adultOnly ?? false;
  }

  /**
   * Ids of local models the family can use now: offered (config switched on, or added) and
   * downloaded, or on a local model server.
   */
  function localOffered(onDisk: readonly string[]): string[] {
    const o = deps.overrides.get();
    const have = (model: string) => onDisk.some((m) => same(m, model));
    const cfg = deps.configModels
      .filter((m) => have(m.ollamaModel) && m.enabled && !o.disabled.includes(m.id))
      .map((m) => m.id);
    const extra = o.extraModels
      .filter((m) => m.engine !== 'ollama' || have(m.engineModel))
      .map((m) => m.id);
    return [...cfg, ...extra];
  }

  /** Stops offering `id`: an added model leaves the list, a config model is switched off. */
  function withdraw(id: string): void {
    const o = deps.overrides.get();
    const isConfig = deps.configModels.some((m) => m.id === id);
    deps.overrides.set({
      ...o,
      extraModels: o.extraModels.filter((m) => m.id !== id),
      disabled: isConfig && !o.disabled.includes(id) ? [...o.disabled, id] : o.disabled,
      defaultChatModel: o.defaultChatModel === id ? null : o.defaultChatModel,
    });
  }

  async function onDisk(): Promise<string[]> {
    const list = await deps.llm.installed().catch(() => null);
    if (list === null) throw new LifecycleError('unavailable');
    return list.map((m) => m.model);
  }

  async function installed(model: string): Promise<boolean> {
    return (await onDisk()).some((m) => same(m, model));
  }

  function setBaseline(model: string, drop?: string): void {
    const s = deps.updateState.get();
    const dropped = drop ? withTag(drop) : null;
    const baselines = Object.fromEntries(
      Object.entries(s.baselines).filter(([m]) => m !== dropped),
    );
    const digest = deps.catalogDigest(model);
    if (digest) baselines[withTag(model)] = digest;
    deps.updateState.set({ ...s, baselines });
  }

  return {
    offeredId,

    /**
     * Moves the family from `from` to `to` (already downloaded). For new weights of the same
     * tag (`from` = `to`) only the baseline moves: Ollama replaced the files in place.
     */
    async replace(from: string, to: string): Promise<{ toId: string; moved: number }> {
      if (same(from, to)) {
        const id = offeredId(from);
        if (!id) throw new LifecycleError('not_offered');
        setBaseline(to);
        return { toId: id, moved: 0 };
      }
      if (!(await installed(to))) throw new LifecycleError('not_installed');
      const fromId = offeredId(from);
      if (!fromId) throw new LifecycleError('not_offered');
      const toId = await deps.offer(to);
      if (toId === fromId) return { toId, moved: 0 };
      const keepAdultOnly = adultOnly(fromId);

      const moved = deps.db.transaction(() => {
        let n = 0;
        for (const sql of [
          'UPDATE users SET default_model_id = ? WHERE default_model_id = ?',
          'UPDATE chats SET model_id = ? WHERE model_id = ?',
          'UPDATE agents SET model_id = ? WHERE model_id = ?',
        ]) {
          n += deps.db.prepare(sql).run(toId, fromId).changes;
        }
        return n;
      })();

      const o = deps.overrides.get();
      // The new model is switched on or off like the old one was (a config model the admin
      // had switched off comes back on when it replaces one in use).
      const fromOff = o.disabled.includes(fromId);
      const disabled = o.disabled.filter((id) => id !== toId);
      deps.overrides.set({
        ...o,
        defaultChatModel: o.defaultChatModel === fromId ? toId : o.defaultChatModel,
        disabled: fromOff ? [...disabled, toId] : disabled,
        extraModels: o.extraModels.map((m) =>
          m.id === toId ? { ...m, adultOnly: m.adultOnly || keepAdultOnly } : m,
        ),
      });
      // The old one: no longer offered (the family default moved above), still on disk.
      const after = deps.overrides.get();
      deps.overrides.set({
        ...after,
        extraModels: after.extraModels.filter((m) => m.id !== fromId),
        disabled:
          deps.configModels.some((m) => m.id === fromId) && !after.disabled.includes(fromId)
            ? [...after.disabled, fromId]
            : after.disabled,
      });
      setBaseline(to, from);
      return { toId, moved };
    },

    /** Deletes an Ollama model from disk and from the family's models. */
    async remove(model: string): Promise<void> {
      if (!deps.idle()) throw new LifecycleError('busy');
      const disk = await onDisk();
      if (!disk.some((m) => same(m, model))) throw new LifecycleError('not_installed');
      const id = offeredId(model);
      if (id) {
        if (localOffered(disk).filter((x) => x !== id).length === 0) {
          throw new LifecycleError('last_model');
        }
        withdraw(id);
        deps.db.transaction(() => {
          deps.db
            .prepare('UPDATE users SET default_model_id = NULL WHERE default_model_id = ?')
            .run(id);
          deps.db.prepare('UPDATE agents SET model_id = NULL WHERE model_id = ?').run(id);
        })();
      }
      if (!deps.llm.remove) throw new LifecycleError('unavailable');
      await deps.llm.unload(model).catch(() => undefined);
      await deps.llm.remove(model);
      const s = deps.updateState.get();
      const gone = withTag(model);
      const baselines = Object.fromEntries(Object.entries(s.baselines).filter(([m]) => m !== gone));
      deps.updateState.set({ ...s, baselines });
    },
  };
}
export type ModelLifecycle = ReturnType<typeof createModelLifecycle>;
