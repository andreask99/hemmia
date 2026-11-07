/**
 * Cloud AI (Settings → Account): the user's own API keys for Claude (Anthropic) and GPT
 * (OpenAI), their monthly limit and this month's use. A key goes to the server once (it is
 * checked with the provider, then stored encrypted) and is never sent back: only a hint.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CloudProvider, CloudSettingsResponse } from '@hemmia/shared';
import { api } from '../api/client.ts';

export const CLOUD_KEY = ['cloud'] as const;

export function useCloudSettings() {
  return useQuery({
    queryKey: CLOUD_KEY,
    queryFn: () => api('/cloud', { schema: CloudSettingsResponse }),
  });
}

/** Checks the key with the provider and saves it. Errors: cloud_key, cloud_unavailable. */
export function useSaveCloudKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, key }: { provider: CloudProvider; key: string }) =>
      api(`/cloud/keys/${provider}`, {
        method: 'PUT',
        body: { key },
        schema: CloudSettingsResponse,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CLOUD_KEY, data);
      // New cloud models in the model picker.
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useRemoveCloudKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: CloudProvider) => api(`/cloud/keys/${provider}`, { method: 'DELETE' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CLOUD_KEY });
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

/** Sets the monthly limit in US cents (null = no limit). */
export function useSetCloudCap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (capCents: number | null) =>
      api('/cloud/cap', { method: 'PUT', body: { capCents }, schema: CloudSettingsResponse }),
    onSuccess: (data) => {
      queryClient.setQueryData(CLOUD_KEY, data);
    },
  });
}
