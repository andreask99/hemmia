/**
 * Profiles: short notes about the user that the model gets as context. Owned by Claude
 * (encryption, per-user isolation).
 *
 * All notes of one profile are one JSON blob encrypted with the user's data key (column AAD
 * bound to the profile row), so they can only be read while the user is signed in. In clear:
 * that a profile exists, its owner, its agent (if any) and when it last changed.
 *
 * A profile is the user's own (`{ kind: 'user' }`) or, not used yet, the user's profile for
 * one agent (`{ kind: 'agent', agentId }`): the caller checks the agent is visible to them.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  MAX_PROFILE_CHARS,
  MAX_PROFILE_NOTES,
  NoteText,
  type ProfileNote,
  ProfileNote as ProfileNoteSchema,
} from '@hemmia/shared';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';

export type ProfileScope = { kind: 'user' } | { kind: 'agent'; agentId: string };
export const USER_PROFILE: ProfileScope = { kind: 'user' };

/**
 * The profile a chat reads and adds to, or null when the chat has it switched off. The one
 * place to change for per-agent profiles: return `{ kind: 'agent', agentId }` for agent chats
 * (and give agents a profile screen; the store and the undo already handle agent profiles).
 */
export function profileScopeFor(chat: {
  useProfile: boolean;
  agentId: string | null;
}): ProfileScope | null {
  return chat.useProfile ? USER_PROFILE : null;
}

const Notes = z.object({ notes: z.array(ProfileNoteSchema) });

/** Result of adding a note: saved, already there, or no room left. */
export type AddNoteResult =
  { status: 'saved'; note: ProfileNote } | { status: 'duplicate' } | { status: 'full' };

const totalChars = (notes: readonly { text: string }[]) =>
  notes.reduce((n, note) => n + note.text.length, 0);
const same = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export function createProfileRepo(db: DB, now: () => number = Date.now) {
  const dataAad = (userId: string, id: string) => aadColumn(userId, 'profiles', id, 'data');
  const agentOf = (scope: ProfileScope) => (scope.kind === 'agent' ? scope.agentId : null);

  interface Row {
    id: string;
    data: Buffer;
    updated_at: number;
  }

  function row(u: UserKey, scope: ProfileScope): Row | undefined {
    return db
      .prepare<[string, string], Row>(
        `SELECT id, data, updated_at FROM profiles
         WHERE user_id = ? AND coalesce(agent_id, '') = ?`,
      )
      .get(u.userId, agentOf(scope) ?? '');
  }

  function read(u: UserKey, r: Row): ProfileNote[] {
    return Notes.parse(JSON.parse(decryptString(u.dek, r.data, dataAad(u.userId, r.id))) as unknown)
      .notes;
  }

  /** Replaces the profile's notes (creating the profile if needed). */
  function write(u: UserKey, scope: ProfileScope, notes: readonly ProfileNote[]): void {
    const existing = row(u, scope);
    const id = existing?.id ?? randomUUID();
    const data = encryptString(u.dek, JSON.stringify({ notes }), dataAad(u.userId, id));
    if (existing) {
      db.prepare('UPDATE profiles SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
        data,
        now(),
        id,
        u.userId,
      );
    } else {
      db.prepare(
        'INSERT INTO profiles (id, user_id, agent_id, data, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, u.userId, agentOf(scope), data, now());
    }
  }

  return {
    get(u: UserKey, scope: ProfileScope): { notes: ProfileNote[]; updatedAt: number | null } {
      const r = row(u, scope);
      return r ? { notes: read(u, r), updatedAt: r.updated_at } : { notes: [], updatedAt: null };
    },

    /** Adds one note (from the model). Refuses duplicates and anything past the limits. */
    add(u: UserKey, scope: ProfileScope, text: string): AddNoteResult {
      const parsed = NoteText.parse(text);
      const r = row(u, scope);
      const notes = r ? read(u, r) : [];
      if (notes.some((n) => same(n.text, parsed))) return { status: 'duplicate' };
      if (
        notes.length >= MAX_PROFILE_NOTES ||
        totalChars(notes) + parsed.length > MAX_PROFILE_CHARS
      ) {
        return { status: 'full' };
      }
      const note: ProfileNote = { id: randomUUID(), text: parsed, createdAt: now() };
      write(u, scope, [...notes, note]);
      return { status: 'saved', note };
    },

    /**
     * Replaces the notes with these texts (the user's edit). Notes whose text is unchanged
     * keep their id and date, so an undo under an older reply still finds them.
     */
    save(u: UserKey, scope: ProfileScope, texts: readonly string[]): ProfileNote[] {
      const r = row(u, scope);
      const old = r ? read(u, r) : [];
      const used = new Set<string>();
      const notes: ProfileNote[] = [];
      for (const text of texts.map((t) => NoteText.parse(t))) {
        if (notes.some((n) => same(n.text, text))) continue;
        const kept = old.find((n) => !used.has(n.id) && n.text === text);
        if (kept) used.add(kept.id);
        notes.push(kept ?? { id: randomUUID(), text, createdAt: now() });
      }
      if (notes.length > MAX_PROFILE_NOTES || totalChars(notes) > MAX_PROFILE_CHARS) {
        throw new RangeError('profile too long');
      }
      write(u, scope, notes);
      return notes;
    },

    /**
     * Removes one note by id from any of the user's profiles (the undo under a reply).
     * Returns false if the user has no such note.
     */
    removeNote(u: UserKey, noteId: string): boolean {
      const rows = db
        .prepare<[string], Row & { agent_id: string | null }>(
          'SELECT id, agent_id, data, updated_at FROM profiles WHERE user_id = ?',
        )
        .all(u.userId);
      for (const r of rows) {
        const notes = read(u, r);
        if (!notes.some((n) => n.id === noteId)) continue;
        const scope: ProfileScope =
          r.agent_id === null ? USER_PROFILE : { kind: 'agent', agentId: r.agent_id };
        write(
          u,
          scope,
          notes.filter((n) => n.id !== noteId),
        );
        return true;
      }
      return false;
    },

    /** Deletes the profile (wipe). */
    wipe(u: UserKey, scope: ProfileScope): void {
      db.prepare("DELETE FROM profiles WHERE user_id = ? AND coalesce(agent_id, '') = ?").run(
        u.userId,
        agentOf(scope) ?? '',
      );
    },
  };
}

export type ProfileRepo = ReturnType<typeof createProfileRepo>;
