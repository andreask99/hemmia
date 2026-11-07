/** Agents: data hooks and the rule for which agents show as chips. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Agent,
  AgentDraft,
  type AgentDraftRequest,
  AgentListResponse,
  type SaveAgentRequest,
} from '@hemmia/shared';
import { api } from '../api/client.ts';

export const AGENTS_KEY = ['agents'] as const;
/** Chips shown on the start screen besides "Standard" and "All…". */
export const VISIBLE_AGENTS = 5;

export function useAgents() {
  return useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => api('/agents', { schema: AgentListResponse }),
  });
}

/** Pinned agents first (in their order), then the most recently used, up to `max`. */
export function visibleAgents(agents: readonly Agent[], max = VISIBLE_AGENTS): Agent[] {
  const pinned = agents
    .filter((a) => a.pinned)
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const recent = agents
    .filter((a) => !a.pinned && a.lastUsedAt !== null)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  return [...pinned, ...recent].slice(0, Math.max(max, pinned.length));
}

export function useSaveAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SaveAgentRequest }) =>
      id
        ? api(`/agents/${encodeURIComponent(id)}`, { method: 'PUT', body, schema: Agent })
        : api('/agents', { method: 'POST', body, schema: Agent }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function usePinAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned, order }: { id: string; pinned: boolean; order?: number }) =>
      api(`/agents/${encodeURIComponent(id)}/pin`, {
        method: 'PUT',
        body: { pinned, ...(order !== undefined ? { order } : {}) },
        schema: Agent,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

/** The model drafts (or revises) an agent; takes up to a minute. */
export function useDraftAgent() {
  return useMutation({
    mutationFn: (body: AgentDraftRequest) =>
      api('/agents/draft', { method: 'POST', body, schema: AgentDraft }),
  });
}
