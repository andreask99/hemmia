import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@hemmia/shared';
import {
  ChatListResponse,
  ChatSummary,
  type CreateChatRequest,
  type Language,
  MessagesResponse,
  ModelsResponse,
} from '@hemmia/shared';
import { api } from '../api/client.ts';
import type { TFunction } from '../i18n/index.tsx';

export const CHATS_KEY = ['chats'] as const;

export function chatQueryKeys(chatId: string) {
  return { messages: ['chats', chatId, 'messages'] as const, list: ['chats'] as const };
}

export function useChats() {
  return useQuery({
    queryKey: CHATS_KEY,
    queryFn: () => api('/chats', { schema: ChatListResponse }),
  });
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => api('/models', { schema: ModelsResponse }),
    staleTime: 5 * 60_000,
  });
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateChatRequest) =>
      api('/chats', { method: 'POST', body, schema: ChatSummary }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

function useUpdateChat<T extends { chatId: string }>(toBody: (v: T) => object) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: T) =>
      api(`/chats/${encodeURIComponent(v.chatId)}`, {
        method: 'PATCH',
        body: toBody(v),
        schema: ChatSummary,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function useRenameChat() {
  return useUpdateChat<{ chatId: string; title: string }>(({ title }) => ({ title }));
}

export function useSetChatModel() {
  return useUpdateChat<{ chatId: string; modelId: string }>(({ modelId }) => ({ modelId }));
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) =>
      api(`/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' }),
    onSuccess: async (_data, chatId) => {
      queryClient.removeQueries({ queryKey: ['chats', chatId] });
      await queryClient.invalidateQueries({ queryKey: CHATS_KEY, exact: true });
    },
  });
}

export function useMessages(chatId: string | undefined) {
  const id = chatId ?? '';
  return useInfiniteQuery({
    queryKey: chatQueryKeys(id).messages,
    queryFn: ({ pageParam }) =>
      api(
        `/chats/${encodeURIComponent(id)}/messages?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
        { schema: MessagesResponse },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: id !== '',
  });
}

export function chatTitle(chat: Pick<ChatSummary, 'title'>, t: TFunction): string {
  return chat.title ?? t('chat.untitled');
}

export function modelLabel(
  model: { label: { en: string; de: string } },
  language: Language,
): string {
  return model.label[language];
}

/** Pages arrive newest first, each page newest first; the UI wants oldest first. */
export function flattenOldestFirst(pages: readonly MessagesResponse[]): Message[] {
  return pages.flatMap((p) => p.messages).reverse();
}
