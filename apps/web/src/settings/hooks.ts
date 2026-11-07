import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import type {
  CreateLinkRequest,
  UpdateMeRequest,
  ChangePasswordRequest,
  CreateInviteRequest,
  AdminUpdateUserRequest,
} from '@hemmia/shared';
import {
  MeResponse,
  SessionListResponse,
  CreateInviteResponse,
  AdminUserListResponse,
} from '@hemmia/shared';
import {
  type AdminAddModelRequest,
  AdminPause,
  AdminModelsResponse,
  type AdminUpdateModelsRequest,
  type WebSearchMode,
  AdminWebSearch,
  AdminCloud,
  SystemCapabilities,
  CreateLinkResponse,
  DeviceList,
  RemoteStatus,
  SystemStatus,
  AdminEnginesResponse,
  CatalogResponse,
  StartPullResponse,
} from '@hemmia/shared';
import { ME_QUERY_KEY } from '../auth/hooks.ts';

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) =>
      api('/me', { method: 'PATCH', body, schema: MeResponse }),
    onSuccess(data) {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api('/auth/password', { method: 'POST', body }),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => api('/me/sessions', { schema: SessionListResponse }),
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api('/admin/users', { schema: AdminUserListResponse }),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: (body: CreateInviteRequest) =>
      api('/admin/invites', { method: 'POST', body, schema: CreateInviteResponse }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & AdminUpdateUserRequest) =>
      api(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/** What this computer can do (pictures, web search, Ollama). */
export function useCapabilities() {
  return useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api('/capabilities', { schema: SystemCapabilities }),
    staleTime: 60_000,
  });
}

export function useAdminModels() {
  return useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => api('/admin/models', { schema: AdminModelsResponse }),
  });
}

export function useUpdateModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminUpdateModelsRequest) =>
      api('/admin/models', { method: 'PUT', body, schema: AdminModelsResponse }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'models'], data);
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

function useModelsMutation<T>(fn: (v: T) => Promise<AdminModelsResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'models'], data);
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useAddModel() {
  return useModelsMutation((body: AdminAddModelRequest) =>
    api('/admin/models/extra', { method: 'POST', body, schema: AdminModelsResponse }),
  );
}

export function useRemoveModel() {
  return useModelsMutation((id: string) =>
    api(`/admin/models/extra/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      schema: AdminModelsResponse,
    }),
  );
}

export function usePause() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) =>
      api('/admin/pause', { method: 'PUT', body: { paused }, schema: AdminPause }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useWebSearchMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: WebSearchMode) =>
      api('/admin/web-search', { method: 'PUT', body: { mode }, schema: AdminWebSearch }),
    onSuccess: (data) => {
      queryClient.setQueryData<AdminModelsResponse>(['admin', 'models'], (old) => {
        if (!old) return old;
        return { ...old, webSearch: data.mode };
      });
    },
  });
}

/** Who may use cloud models with their own API key (admin family switch). */
export function useCloudMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: WebSearchMode) =>
      api('/admin/cloud', { method: 'PUT', body: { mode }, schema: AdminCloud }),
    onSuccess: (data) => {
      queryClient.setQueryData<AdminModelsResponse>(['admin', 'models'], (old) => {
        if (!old) return old;
        return { ...old, cloud: data.mode };
      });
      void queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['admin', 'system'],
    queryFn: () => api('/admin/system', { schema: SystemStatus }),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useAdminEngines() {
  return useQuery({
    queryKey: ['admin', 'engines'],
    queryFn: () => api('/admin/engines', { schema: AdminEnginesResponse }),
  });
}

export function useAddEngine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; baseUrl: string }) =>
      api('/admin/engines/custom', { method: 'POST', body, schema: AdminEnginesResponse }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'engines'], data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
  });
}

export function useRemoveEngine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/admin/engines/custom/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        schema: AdminEnginesResponse,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'engines'], data);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ['admin', 'catalog'],
    queryFn: () => api('/admin/catalog', { schema: CatalogResponse }),
  });
}

export function useStartPull() {
  return useMutation({
    mutationFn: (model: string) =>
      api('/admin/models/pulls', {
        method: 'POST',
        body: { model },
        schema: StartPullResponse,
      }),
  });
}

export function useRemoteStatus() {
  return useQuery({
    queryKey: ['admin', 'remote'],
    queryFn: () => api('/admin/remote', { schema: RemoteStatus }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useSetRemote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connect: boolean) =>
      api('/admin/remote', { method: 'POST', body: { connect }, schema: RemoteStatus }),
    onSuccess(data) {
      queryClient.setQueryData(['admin', 'remote'], data);
    },
  });
}

export function useForgetRemote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/admin/remote', { method: 'DELETE', schema: RemoteStatus }),
    onSuccess(data) {
      queryClient.setQueryData(['admin', 'remote'], data);
    },
  });
}

/** POST /api/links: a sign-in link or a device code (P3.6). */
export function useCreateLink() {
  return useMutation({
    mutationFn: (body: CreateLinkRequest) =>
      api('/links', { method: 'POST', body, schema: CreateLinkResponse }),
  });
}

/** Paired devices: the user's own, or (admins) another user's. */
export function useDevices(userId?: string) {
  return useQuery({
    queryKey: ['devices', userId ?? 'me'],
    queryFn: () =>
      api(userId ? `/admin/users/${userId}/devices` : '/devices', { schema: DeviceList }),
  });
}

export function useRemoveDevice(userId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(userId ? `/admin/users/${userId}/devices/${id}` : `/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices', userId ?? 'me'] });
    },
  });
}
