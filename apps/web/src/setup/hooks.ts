import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import type { SetupAccountRequest } from '@hemmia/shared';
import { AccountResponse, SetupState } from '@hemmia/shared';

export function useSetupState() {
  return useQuery({
    queryKey: ['setup', 'state'],
    queryFn: () => api('/setup/state', { schema: SetupState }),
    retry: false,
  });
}

export function useSetupAccount() {
  return useMutation({
    mutationFn: (body: SetupAccountRequest) =>
      api('/setup/account', { method: 'POST', body, schema: AccountResponse }),
  });
}
