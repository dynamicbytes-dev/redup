import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  createDiscordServer,
  createServerChannel,
  deleteDiscordServer,
  deleteServerChannel,
  fetchChannelMessages,
  fetchMyServers,
  fetchServerChannels,
  fetchServerDetails,
  fetchServerMembers,
  joinServerByCode,
  leaveDiscordServer,
  sendServerChannelMessage,
} from '@/features/servers/api';
import { supabase } from '@/lib/supabase';
import type { ServerChannelMessage } from '@/lib/types';

export const serverKeys = {
  myServers: (userId: string | null) => ['servers', 'my', userId] as const,
  server: (serverId: string) => ['servers', 'detail', serverId] as const,
  channels: (serverId: string) => ['servers', 'channels', serverId] as const,
  members: (serverId: string) => ['servers', 'members', serverId] as const,
  messages: (channelId: string) => ['servers', 'messages', channelId] as const,
  preview: (code: string) => ['servers', 'preview', code] as const,
};

export function useMyServers(userId: string | null) {
  return useQuery({
    queryKey: serverKeys.myServers(userId),
    queryFn: () => (userId ? fetchMyServers(userId) : []),
    enabled: Boolean(userId),
    staleTime: 10_000,
  });
}

export function useServer(serverId: string) {
  return useQuery({
    queryKey: serverKeys.server(serverId),
    queryFn: () => fetchServerDetails(serverId),
    enabled: Boolean(serverId),
  });
}

export function useServerChannels(serverId: string) {
  return useQuery({
    queryKey: serverKeys.channels(serverId),
    queryFn: () => fetchServerChannels(serverId),
    enabled: Boolean(serverId),
  });
}

export function useServerMembers(serverId: string) {
  return useQuery({
    queryKey: serverKeys.members(serverId),
    queryFn: () => fetchServerMembers(serverId),
    enabled: Boolean(serverId),
  });
}

export function useChannelMessages(channelId: string) {
  return useQuery({
    queryKey: serverKeys.messages(channelId),
    queryFn: () => fetchChannelMessages(channelId),
    enabled: Boolean(channelId),
  });
}

export function useCreateServer(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDiscordServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.myServers(userId) });
    },
  });
}

export function useJoinServer(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => joinServerByCode(inviteCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.myServers(userId) });
    },
  });
}

export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createServerChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.channels(serverId) });
    },
  });
}

export function useDeleteChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => deleteServerChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.channels(serverId) });
    },
  });
}

export function useDeleteServer(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteDiscordServer(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.myServers(userId) });
    },
  });
}

export function useLeaveServer(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, memberUserId }: { serverId: string; memberUserId: string }) =>
      leaveDiscordServer(serverId, memberUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serverKeys.myServers(userId) });
    },
  });
}

export function useSendChannelMessage(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendServerChannelMessage,
    onSuccess: (newMessage) => {
      queryClient.setQueryData<ServerChannelMessage[]>(
        serverKeys.messages(channelId),
        (old = []) => [newMessage, ...old],
      );
    },
  });
}

export function useChannelRealtime(channelId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channelId) return;

    const channel = supabase
      .channel(`server_channel:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'server_channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const newMsg = payload.new as ServerChannelMessage;
          // Obtener perfil del remitente si falta
          if (newMsg.sender_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_path, about, last_seen_at, show_online')
              .eq('id', newMsg.sender_id)
              .single();
            newMsg.sender_profile = profile ?? null;
          }
          queryClient.setQueryData<ServerChannelMessage[]>(
            serverKeys.messages(channelId),
            (old = []) => {
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [newMsg, ...old];
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, queryClient]);
}
