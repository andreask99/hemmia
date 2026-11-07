import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import type { LoginRequest, AcceptInviteRequest, RecoverRequest } from '@hemmia/shared';
import { MeResponse, SessionResponse, AccountResponse } from '@hemmia/shared';

export const ME_QUERY_KEY = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api('/me', { schema: MeResponse }),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api('/auth/login', { method: 'POST', body, schema: SessionResponse }),
    onSuccess(data) {
      queryClient.setQueryData(ME_QUERY_KEY, data.me);
    },
  });
}

export function useAcceptInvite() {
  return useMutation({
    mutationFn: (body: AcceptInviteRequest) =>
      api('/auth/invite/accept', { method: 'POST', body, schema: AccountResponse }),
  });
}

export function useRecover() {
  return useMutation({
    mutationFn: (body: RecoverRequest) =>
      api('/auth/recover', { method: 'POST', body, schema: AccountResponse }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled() {
      queryClient.clear();
    },
  });
}
