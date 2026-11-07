import { z } from 'zod';
import { Id } from './chat.ts';

/**
 * Agents: a role (short system prompt) plus optional settings, chosen per chat.
 * Personal agents are encrypted with their owner's key; family agents (made by an admin)
 * are readable by everyone in the family.
 */
export const AGENT_INSTRUCTIONS_MAX = 1000;
export const AGENT_EXAMPLES_MAX = 3;

export const AgentFields = z.object({
  name: z.string().trim().min(1).max(40),
  /** One emoji (or a short symbol) shown as the agent's icon. */
  emoji: z.string().trim().min(1).max(8),
  description: z.string().trim().max(120).default(''),
  /** The role: a focused system prompt. */
  instructions: z.string().trim().min(1).max(AGENT_INSTRUCTIONS_MAX),
  /** Tap-to-start questions shown in an empty chat. */
  examples: z.array(z.string().trim().min(1).max(140)).max(AGENT_EXAMPLES_MAX).default([]),
  /** Preferred chat model; null = the user's or family default. */
  modelId: z.string().nullable().default(null),
  /** "Think harder" for chats with this agent; null = leave as is. */
  think: z.boolean().nullable().default(null),
  webSearch: z.boolean().default(true),
  images: z.boolean().default(true),
});
export type AgentFields = z.infer<typeof AgentFields>;

export const Agent = AgentFields.extend({
  id: Id,
  scope: z.enum(['personal', 'family']),
  /** The viewer may edit it (own personal agent, or an admin for family agents). */
  editable: z.boolean(),
  /** The viewer's own choices. */
  pinned: z.boolean(),
  /** Order among pinned agents (lower first); null when not pinned. */
  pinOrder: z.number().int().nullable(),
  lastUsedAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentTemplate = AgentFields.extend({ key: z.string() });
export type AgentTemplate = z.infer<typeof AgentTemplate>;

/** GET /api/agents */
export const AgentListResponse = z.object({
  agents: z.array(Agent),
  templates: z.array(AgentTemplate),
});
export type AgentListResponse = z.infer<typeof AgentListResponse>;

/** POST /api/agents, PUT /api/agents/:id. `family` is admin-only. */
export const SaveAgentRequest = AgentFields.extend({ family: z.boolean().default(false) });
export type SaveAgentRequest = z.infer<typeof SaveAgentRequest>;

/** PUT /api/agents/:id/pin. */
export const PinAgentRequest = z.object({
  pinned: z.boolean(),
  /** Position among pinned agents; absent = at the end. */
  order: z.number().int().min(0).max(1000).optional(),
});
export type PinAgentRequest = z.infer<typeof PinAgentRequest>;

/** POST /api/agents/draft: the model drafts an agent from a sentence, or revises one. */
export const AgentDraftRequest = z.object({
  description: z.string().trim().min(3).max(500),
  /** The current draft, to revise with `change`. */
  current: AgentFields.partial().optional(),
  change: z.string().trim().max(300).optional(),
});
export type AgentDraftRequest = z.infer<typeof AgentDraftRequest>;

export const AgentDraft = z.object({
  name: z.string().max(40),
  emoji: z.string().max(8),
  description: z.string().max(120),
  instructions: z.string().max(AGENT_INSTRUCTIONS_MAX),
  examples: z.array(z.string().max(140)).max(AGENT_EXAMPLES_MAX),
});
export type AgentDraft = z.infer<typeof AgentDraft>;
