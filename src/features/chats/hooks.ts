import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { dispatchConversationPushNotification } from '@/features/notifications/api';
import { queryKeys } from '@/lib/query-client';
import type {
  ChatMessage,
  ConversationMember,
  ConversationOverview,
  MemberRole,
  Message,
} from '@/lib/types';

import {
  addGroupMembers,
  createDirectConversation,
  createGroupConversation,
  editMessage,
  fetchBlockedUsers,
  fetchContactDetail,
  fetchContactsMap,
  fetchConversations,
  fetchMembers,
  fetchMessages,
  insertMessage,
  leaveGroupConversation,
  markConversationRead,
  removeGroupMember,
  searchUsers,
  setBlockedUser,
  setConversationMuted,
  softDeleteMessage,
  updateGroupDetails,
  updateGroupMemberRole,
  uploadGroupAvatar,
  upsertContactAlias,
} from './api';
import { uploadChatMedia, type PickedMedia } from './media';

export type MessagesData = { pages: Message[][]; pageParams: (string | null)[] };

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: fetchConversations,
  });
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: async () => {
      const pages: Message[][] = [];
      let cursor: string | null = null;
      const first = await fetchMessages(conversationId, cursor);
      pages.push(first);
      return { pages, pageParams: [null] } as MessagesData;
    },
    // El historial se pagina a mano con `loadOlder`
    staleTime: 60_000,
  });
}

export function useOlderMessages(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<MessagesData>(queryKeys.messages(conversationId));
      const oldest = current?.pages.at(-1)?.at(-1);
      if (!oldest) return null;
      const older = await fetchMessages(conversationId, oldest.created_at);
      if (older.length > 0) {
        queryClient.setQueryData<MessagesData>(queryKeys.messages(conversationId), (old) =>
          old ? { ...old, pages: [...old.pages, older] } : old,
        );
      }
      return older.length;
    },
  });
}

export function useMembers(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () => fetchMembers(conversationId),
    enabled: Boolean(conversationId),
  });
}

/* ------------------------------------------------------------------ */
/* Helpers de caché                                                    */
/* ------------------------------------------------------------------ */

export function upsertMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  message: Message | ChatMessage,
) {
  queryClient.setQueryData<MessagesData>(queryKeys.messages(conversationId), (old) => {
    if (!old) return { pages: [[message as Message]], pageParams: [null] };

    let replaced = false;
    const pages = old.pages.map((page) =>
      page.map((item) => {
        if (item.id === message.id) {
          replaced = true;
          return message as Message;
        }
        return item;
      }),
    );

    if (!replaced) pages[0] = [message as Message, ...(pages[0] ?? [])];

    return { ...old, pages };
  });
}

function patchMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  id: string,
  patch: Partial<ChatMessage>,
) {
  queryClient.setQueryData<MessagesData>(queryKeys.messages(conversationId), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) =>
        page.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    };
  });
}

function notifyRemotePushTargets(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  senderId: string,
  message: Message,
) {
  const members =
    queryClient.getQueryData<ConversationMember[]>(queryKeys.conversation(conversationId)) ?? [];
  const me = members.find((m) => m.user_id === senderId)?.profile;
  const senderName = me?.display_name || me?.username || 'Redup';

  const conversations =
    queryClient.getQueryData<ConversationOverview[]>(queryKeys.conversations) ?? [];
  const conv = conversations.find((c) => c.id === conversationId);

  dispatchConversationPushNotification({
    conversationId,
    senderName,
    conversationTitle: conv?.name ?? null,
    isGroup: conv?.type === 'group',
    kind: message.kind,
    body: message.body,
    messageId: message.id,
  }).catch(() => { });
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                          */
/* ------------------------------------------------------------------ */

export function useSendMessage(conversationId: string, senderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { id: string; body: string; replyToId?: string | null }) =>
      insertMessage({
        id: variables.id,
        conversationId,
        senderId,
        body: variables.body,
        replyToId: variables.replyToId ?? null,
      }),

    onMutate: (variables) => {
      const optimistic: ChatMessage = {
        id: variables.id,
        conversation_id: conversationId,
        sender_id: senderId,
        kind: 'text',
        body: variables.body,
        media_path: null,
        media_meta: null,
        duration_ms: null,
        reply_to_id: variables.replyToId ?? null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        pending: true,
      };
      upsertMessage(queryClient, conversationId, optimistic);
      return { optimistic };
    },

    onSuccess: (serverMessage, variables) => {
      upsertMessage(queryClient, conversationId, serverMessage);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      notifyRemotePushTargets(queryClient, conversationId, senderId, serverMessage);
      void variables;
    },

    onError: (_error, variables) => {
      patchMessage(queryClient, conversationId, variables.id, { pending: false, failed: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useSendMediaMessage(conversationId: string, senderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      id: string;
      media: PickedMedia;
      caption?: string | null;
      replyToId?: string | null;
    }) => {
      const uploaded = await uploadChatMedia({
        conversationId,
        messageId: variables.id,
        media: variables.media,
      });

      return insertMessage({
        id: variables.id,
        conversationId,
        senderId,
        kind: variables.media.kind,
        body: variables.caption?.trim() ? variables.caption.trim() : null,
        mediaPath: uploaded.path,
        mediaMeta: uploaded.meta,
        durationMs: variables.media.durationMs ?? null,
        replyToId: variables.replyToId ?? null,
      });
    },

    onMutate: (variables) => {
      const optimistic: ChatMessage = {
        id: variables.id,
        conversation_id: conversationId,
        sender_id: senderId,
        kind: variables.media.kind,
        body: variables.caption?.trim() ? variables.caption.trim() : null,
        media_path: variables.media.localUri,
        media_meta: {
          name: variables.media.fileName,
          mimeType: variables.media.mimeType,
          size: variables.media.size ?? null,
          width: variables.media.width ?? null,
          height: variables.media.height ?? null,
          localMedia: variables.media,
        },
        duration_ms: variables.media.durationMs ?? null,
        reply_to_id: variables.replyToId ?? null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        pending: true,
      };
      upsertMessage(queryClient, conversationId, optimistic);
      return { optimistic };
    },

    onSuccess: (serverMessage) => {
      upsertMessage(queryClient, conversationId, serverMessage);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      notifyRemotePushTargets(queryClient, conversationId, senderId, serverMessage);
    },

    onError: (_error, variables) => {
      patchMessage(queryClient, conversationId, variables.id, { pending: false, failed: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => softDeleteMessage(messageId),
    onMutate: (messageId) => {
      patchMessage(queryClient, conversationId, messageId, {
        deleted_at: new Date().toISOString(),
        body: null,
        media_path: null,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useEditMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; body: string }) => editMessage(input.id, input.body),
    onMutate: (input) => {
      patchMessage(queryClient, conversationId, input.id, {
        body: input.body,
        edited_at: new Date().toISOString(),
      });
    },
    onSuccess: (_data, input) => {
      patchMessage(queryClient, conversationId, input.id, {
        body: input.body,
        edited_at: new Date().toISOString(),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useMuteConversation(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { conversationId: string; mutedUntil: string | null }) =>
      setConversationMuted(input.conversationId, userId, input.mutedUntil),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(input.conversationId) });
      Haptics.selectionAsync().catch(() => { });
    },
  });
}

export function useContactDetail(ownerId: string | null, otherUserId: string) {
  return useQuery({
    queryKey: queryKeys.contact(otherUserId),
    queryFn: () => fetchContactDetail(ownerId as string, otherUserId),
    enabled: Boolean(ownerId && otherUserId),
  });
}

export function useContactsMap(ownerId: string | null) {
  return useQuery({
    queryKey: queryKeys.contacts,
    queryFn: () => fetchContactsMap(ownerId as string),
    enabled: Boolean(ownerId),
  });
}

export function useSaveContactAlias(ownerId: string, otherUserId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alias: string | null) => upsertContactAlias(ownerId, otherUserId, alias),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contact(otherUserId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    },
  });
}

export function useToggleBlockUser(ownerId: string, otherUserId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blocked: boolean) => setBlockedUser(ownerId, otherUserId, blocked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contact(otherUserId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.blocks });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    },
  });
}

export function useBlockedUsers(ownerId: string | null) {
  return useQuery({
    queryKey: queryKeys.blocks,
    queryFn: () => fetchBlockedUsers(ownerId as string),
    enabled: Boolean(ownerId),
  });
}

/* ------------------------------------------------------------------ */
/* Fase 3 · Hooks de grupos                                            */
/* ------------------------------------------------------------------ */

export function useCreateGroup(creatorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; memberIds: string[]; localAvatarUri?: string | null }) =>
      createGroupConversation({
        creatorId,
        name: input.name,
        memberIds: input.memberIds,
        localAvatarUri: input.localAvatarUri,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    },
  });
}

export function useUpdateGroupDetails(conversationId: string, actorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name?: string; avatarPath?: string | null; systemText?: string }) =>
      updateGroupDetails({
        conversationId,
        actorId,
        name: input.name,
        avatarPath: input.avatarPath,
        systemText: input.systemText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    },
  });
}

export function useChangeGroupAvatar(conversationId: string, actorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { localUri: string; previousPath?: string | null }) => {
      const path = await uploadGroupAvatar(actorId, conversationId, input.localUri, input.previousPath);
      await updateGroupDetails({
        conversationId,
        actorId,
        avatarPath: path,
        systemText: 'Cambió la foto del grupo',
      });
      return path;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    },
  });
}

export function useAddGroupMembers(conversationId: string, actorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (users: { id: string; displayName: string }[]) =>
      addGroupMembers({ conversationId, actorId, users }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    },
  });
}

export function useUpdateGroupMemberRole(conversationId: string, actorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { targetUserId: string; targetName: string; role: MemberRole }) =>
      updateGroupMemberRole({
        conversationId,
        actorId,
        targetUserId: input.targetUserId,
        targetName: input.targetName,
        role: input.role,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.selectionAsync().catch(() => { });
    },
  });
}

export function useRemoveGroupMember(conversationId: string, actorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { targetUserId: string; targetName: string }) =>
      removeGroupMember({
        conversationId,
        actorId,
        targetUserId: input.targetUserId,
        targetName: input.targetName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    },
  });
}

export function useLeaveGroup(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string; displayName: string; members: ConversationMember[] }) =>
      leaveGroupConversation({
        conversationId,
        userId: input.userId,
        displayName: input.displayName,
        members: input.members,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.removeQueries({ queryKey: queryKeys.conversation(conversationId) });
      queryClient.removeQueries({ queryKey: queryKeys.messages(conversationId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    },
  });
}

export function useStartDirectChat() {
  return useMutation({
    mutationFn: (otherUserId: string) => createDirectConversation(otherUserId),
  });
}

export function useUserSearch(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: queryKeys.userSearch(trimmed),
    queryFn: () => searchUsers(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 15_000,
  });
}

export async function markRead(conversationId: string) {
  await markConversationRead(conversationId);
}
