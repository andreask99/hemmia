/** The user's profile: notes kchat uses as context (Settings → Profile, "Noted" under replies). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfileResponse } from '@hemmia/shared';
import { api } from '../api/client.ts';

export const PROFILE_KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api('/profile', { schema: ProfileResponse }),
  });
}

/** Saves the whole profile, one note per entry. */
export function useSaveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes: string[]) =>
      api('/profile', { method: 'PUT', body: { notes }, schema: ProfileResponse }),
    onSuccess: (data) => {
      queryClient.setQueryData(PROFILE_KEY, data);
    },
  });
}

export function useWipeProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/profile', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });
}

/** The undo under a reply: removes one note the model saved. */
export function useRemoveNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/profile/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });
}
