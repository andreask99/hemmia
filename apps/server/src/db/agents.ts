/**
 * Agents repository. Owned by Claude (per-user isolation, encryption).
 *
 * A user sees their own personal agents and all family agents. Personal agent texts are
 * encrypted with the owner's data key; family agents are shared and stored in clear.
 * Only the owner edits a personal agent; only admins create, edit or delete family agents.
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { type Agent, AgentFields } from '@hemmia/shared';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';

export interface AgentViewer extends UserKey {
  role: 'admin' | 'member';
}

interface AgentRow {
  id: string;
  scope: 'personal' | 'family';
  owner_id: string | null;
  data: Buffer;
  model_id: string | null;
  think: 0 | 1 | null;
  web_search: 0 | 1;
  images: 0 | 1;
  updated_at: number;
  pinned: 0 | 1 | null;
  pin_order: number | null;
  last_used_at: number | null;
}

const Texts = AgentFields.pick({
  name: true,
  emoji: true,
  description: true,
  instructions: true,
  examples: true,
});
type Texts = z.infer<typeof Texts>;

export class AgentForbiddenError extends Error {
  override name = 'AgentForbiddenError';
  constructor() {
    super('agent forbidden');
  }
}

export function createAgentRepo(db: DB, now: () => number = Date.now) {
  const dataAad = (userId: string, agentId: string) => aadColumn(userId, 'agents', agentId, 'data');

  /** Personal: encrypted with the owner's key. Family: shared, plain JSON. */
  function encode(scope: 'personal' | 'family', v: AgentViewer, id: string, texts: Texts): Buffer {
    const json = JSON.stringify(Texts.parse(texts));
    return scope === 'personal'
      ? encryptString(v.dek, json, dataAad(v.userId, id))
      : Buffer.from(json, 'utf8');
  }

  function decode(v: AgentViewer, row: AgentRow): Texts {
    const json =
      row.scope === 'personal'
        ? decryptString(v.dek, row.data, dataAad(v.userId, row.id))
        : row.data.toString('utf8');
    return Texts.parse(JSON.parse(json) as unknown);
  }

  function toAgent(v: AgentViewer, row: AgentRow): Agent {
    return {
      id: row.id,
      scope: row.scope,
      editable: row.scope === 'personal' ? row.owner_id === v.userId : v.role === 'admin',
      ...decode(v, row),
      modelId: row.model_id,
      think: row.think === null ? null : row.think === 1,
      webSearch: row.web_search === 1,
      images: row.images === 1,
      pinned: row.pinned === 1,
      pinOrder: row.pinned === 1 ? row.pin_order : null,
      lastUsedAt: row.last_used_at,
      updatedAt: row.updated_at,
    };
  }

  const SELECT = `SELECT a.id, a.scope, a.owner_id, a.data, a.model_id, a.think, a.web_search,
      a.images, a.updated_at, p.pinned, p.pin_order, p.last_used_at
    FROM agents a LEFT JOIN agent_prefs p ON p.agent_id = a.id AND p.user_id = ?`;
  /** Rows the viewer may see: their own personal agents and all family agents. */
  const VISIBLE = `(a.scope = 'family' OR a.owner_id = ?)`;

  function row(v: AgentViewer, id: string): AgentRow | undefined {
    return db
      .prepare<[string, string, string], AgentRow>(`${SELECT} WHERE a.id = ? AND ${VISIBLE}`)
      .get(v.userId, id, v.userId);
  }

  return {
    list(v: AgentViewer): Agent[] {
      return db
        .prepare<[string, string], AgentRow>(`${SELECT} WHERE ${VISIBLE} ORDER BY a.created_at`)
        .all(v.userId, v.userId)
        .map((r) => toAgent(v, r));
    },

    get(v: AgentViewer, id: string): Agent | null {
      const r = row(v, id);
      return r ? toAgent(v, r) : null;
    },

    create(v: AgentViewer, fields: AgentFields, family: boolean): Agent {
      if (family && v.role !== 'admin') throw new AgentForbiddenError();
      const id = randomUUID();
      const t = now();
      const scope = family ? 'family' : 'personal';
      db.prepare(
        `INSERT INTO agents (id, scope, owner_id, data, model_id, think, web_search, images, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        scope,
        family ? null : v.userId,
        encode(scope, v, id, fields),
        fields.modelId,
        fields.think === null ? null : fields.think ? 1 : 0,
        fields.webSearch ? 1 : 0,
        fields.images ? 1 : 0,
        t,
        t,
      );
      const created = this.get(v, id);
      if (!created) throw new Error('agent not saved');
      return created;
    },

    /** Updates an agent the viewer may edit; an admin may move it between personal and family. */
    update(v: AgentViewer, id: string, fields: AgentFields, family: boolean): Agent | null {
      const r = row(v, id);
      if (!r) return null;
      const editable = r.scope === 'personal' ? r.owner_id === v.userId : v.role === 'admin';
      if (!editable || (family && v.role !== 'admin')) throw new AgentForbiddenError();
      const scope = family ? 'family' : 'personal';
      // Moving a family agent to personal makes it the admin's own.
      db.prepare(
        `UPDATE agents SET scope = ?, owner_id = ?, data = ?, model_id = ?, think = ?,
             web_search = ?, images = ?, updated_at = ? WHERE id = ?`,
      ).run(
        scope,
        family ? null : v.userId,
        encode(scope, v, id, fields),
        fields.modelId,
        fields.think === null ? null : fields.think ? 1 : 0,
        fields.webSearch ? 1 : 0,
        fields.images ? 1 : 0,
        now(),
        id,
      );
      return this.get(v, id);
    },

    /** Deletes an agent the viewer may edit. Chats keep running without it. */
    delete(v: AgentViewer, id: string): boolean {
      const r = row(v, id);
      if (!r) return false;
      const editable = r.scope === 'personal' ? r.owner_id === v.userId : v.role === 'admin';
      if (!editable) throw new AgentForbiddenError();
      db.prepare('DELETE FROM agents WHERE id = ?').run(id);
      return true;
    },

    /** Pins or unpins an agent for this viewer only. */
    pin(v: AgentViewer, id: string, pinned: boolean, order?: number): Agent | null {
      if (!row(v, id)) return null;
      const position =
        order ??
        db
          .prepare<[string], { n: number | null }>(
            'SELECT MAX(pin_order) + 1 AS n FROM agent_prefs WHERE user_id = ? AND pinned = 1',
          )
          .get(v.userId)?.n ??
        0;
      db.prepare(
        `INSERT INTO agent_prefs (user_id, agent_id, pinned, pin_order) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, agent_id) DO UPDATE SET pinned = excluded.pinned, pin_order = excluded.pin_order`,
      ).run(v.userId, id, pinned ? 1 : 0, pinned ? position : null);
      return this.get(v, id);
    },

    /** Remembers that the viewer used the agent (for the "recent" chips). */
    touch(v: AgentViewer, id: string): void {
      if (!row(v, id)) return;
      db.prepare(
        `INSERT INTO agent_prefs (user_id, agent_id, last_used_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, agent_id) DO UPDATE SET last_used_at = excluded.last_used_at`,
      ).run(v.userId, id, now());
    },
  };
}

export type AgentRepo = ReturnType<typeof createAgentRepo>;
