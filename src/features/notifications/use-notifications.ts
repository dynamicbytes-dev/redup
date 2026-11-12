import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { isMutedUntil } from '@/lib/format';
import { queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { ConversationOverview, Message } from '@/lib/types';

import {
  ensureNotificationHandlerConfigured,
  formatPushPreview,
  getActiveConversationId,
  getPushEnabledPreference,
  getSavedPushToken,
  presentCallNotification,
  presentFriendNotification,
  presentLocalMessageNotification,
  presentServerChannelNotification,
  presentWallNotification,
  registerForPushNotificationsAsync,
  scheduleTestNotificationAsync,
  setPushEnabledPreference,
  syncAppBadgeCount,
  unregisterPushNotificationsAsync,
} from './api';

function handleNotificationNavigation(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data as
    | { conversationId?: string; url?: string; type?: string; serverId?: string; channelId?: string; callId?: string }
    | undefined;

  Notifications.clearLastNotificationResponse();

  if (data?.url) {
    try {
      router.push(data.url as any);
      return;
    } catch {}
  }

  if (data?.conversationId) {
    router.push(`/chat/${data.conversationId}`);
  }
}

export function useNotificationsBootstrap(userId: string | null) {
  const queryClient = useQueryClient();
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ensureNotificationHandlerConfigured();
  }, []);

  // Registro automático del token al iniciar sesión y limpieza al salir
  useEffect(() => {
    if (!userId) return;
    let active = true;

    getPushEnabledPreference().then((enabled) => {
      if (!active || !enabled) return;
      registerForPushNotificationsAsync().catch(() => {});
    });

    return () => {
      active = false;
    };
  }, [userId]);

  // Deep-link al tocar una notificación (en frío o en caliente)
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) {
      handleNotificationNavigation(initialResponse);
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response);
    });

    return () => {
      sub.remove();
    };
  }, [userId]);

  // Canal Realtime para presentar notificaciones de mensajes entrantes cuando el chat no está abierto
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    const channel = supabase
      .channel(`push-feed:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as Message | undefined;
          if (!msg || !msg.id) return;
          if (msg.sender_id === userId || msg.kind === 'system') return;
          if (getActiveConversationId() === msg.conversation_id) return;

          if (notifiedIdsRef.current.has(msg.id)) return;
          notifiedIdsRef.current.add(msg.id);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          const conversations =
            queryClient.getQueryData<ConversationOverview[]>(queryKeys.conversations) ?? [];
          const conv = conversations.find((c) => c.id === msg.conversation_id);

          if (conv && isMutedUntil(conv.muted_until)) {
            return;
          }

          const contactsMap =
            queryClient.getQueryData<Record<string, string>>(queryKeys.contacts) ?? {};

          let senderName =
            (msg.sender_id && contactsMap[msg.sender_id]) ||
            conv?.other_display_name ||
            'Nuevo mensaje';

          if (
            msg.sender_id &&
            !contactsMap[msg.sender_id] &&
            (!conv || conv.type === 'group')
          ) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('display_name, username')
              .eq('id', msg.sender_id)
              .maybeSingle();
            if (senderProfile?.display_name) {
              senderName = senderProfile.display_name;
            } else if (senderProfile?.username) {
              senderName = `@${senderProfile.username}`;
            }
          }

          const preview = formatPushPreview(msg.kind, msg.body);
          const isGroup = conv?.type === 'group';
          const title = isGroup ? conv?.name || 'Grupo' : senderName;
          const body = isGroup ? `${senderName}: ${preview}` : preview;

          await presentLocalMessageNotification({
            conversationId: msg.conversation_id,
            title,
            body,
            messageId: msg.id,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friend_requests' },
        async (payload) => {
          const req = payload.new as { id?: string; sender_id?: string; receiver_id?: string; status?: string } | undefined;
          if (!req || req.receiver_id !== userId || req.status !== 'pending') return;

          if (notifiedIdsRef.current.has(`fr-${req.id}`)) return;
          notifiedIdsRef.current.add(`fr-${req.id}`);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', req.sender_id)
            .maybeSingle();

          const name = sender?.display_name || (sender?.username ? `@${sender.username}` : 'Un usuario');

          await presentFriendNotification({
            title: '👥 Solicitud de amistad',
            body: `${name} te envió una solicitud de amistad en Akatsuki Chat.`,
            senderId: req.sender_id,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friend_requests' },
        async (payload) => {
          const req = payload.new as { id?: string; sender_id?: string; receiver_id?: string; status?: string } | undefined;
          if (!req || req.sender_id !== userId || req.status !== 'accepted') return;

          if (notifiedIdsRef.current.has(`fra-${req.id}`)) return;
          notifiedIdsRef.current.add(`fra-${req.id}`);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          const { data: receiver } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', req.receiver_id)
            .maybeSingle();

          const name = receiver?.display_name || (receiver?.username ? `@${receiver.username}` : 'Tu amigo');

          await presentFriendNotification({
            title: '✨ ¡Solicitud aceptada!',
            body: `${name} aceptó tu solicitud. Ahora son amigos en Akatsuki Chat.`,
            senderId: req.receiver_id,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'server_channel_messages' },
        async (payload) => {
          const msg = payload.new as {
            id?: string;
            server_id?: string;
            channel_id?: string;
            sender_id?: string;
            body?: string;
            kind?: string;
          } | undefined;

          if (!msg || !msg.id || msg.sender_id === userId || msg.kind === 'system') return;

          if (notifiedIdsRef.current.has(`scm-${msg.id}`)) return;
          notifiedIdsRef.current.add(`scm-${msg.id}`);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          // Verificar si el usuario es miembro de este servidor
          const { data: member } = await supabase
            .from('server_members')
            .select('server_id')
            .eq('server_id', msg.server_id)
            .eq('user_id', userId)
            .maybeSingle();

          if (!member) return;

          const [{ data: server }, { data: channel }, { data: sender }] = await Promise.all([
            supabase.from('servers').select('name').eq('id', msg.server_id).maybeSingle(),
            supabase.from('server_channels').select('name').eq('id', msg.channel_id).maybeSingle(),
            supabase.from('profiles').select('display_name, username').eq('id', msg.sender_id).maybeSingle(),
          ]);

          const serverName = server?.name || 'Servidor';
          const channelName = channel?.name || 'general';
          const senderName = sender?.display_name || (sender?.username ? `@${sender.username}` : 'Alguien');
          const preview = msg.body?.trim() || (msg.kind === 'image' ? '📷 Foto' : 'Mensaje');

          await presentServerChannelNotification({
            serverId: msg.server_id!,
            channelId: msg.channel_id!,
            serverName,
            channelName,
            senderName,
            body: preview,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        async (payload) => {
          const call = payload.new as {
            id?: string;
            caller_id?: string;
            callee_id?: string;
            status?: string;
            kind?: string;
          } | undefined;

          if (!call || !call.id || call.callee_id !== userId || call.status !== 'ringing') return;

          if (notifiedIdsRef.current.has(`call-${call.id}`)) return;
          notifiedIdsRef.current.add(`call-${call.id}`);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          const { data: caller } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', call.caller_id)
            .maybeSingle();

          const callerName = caller?.display_name || (caller?.username ? `@${caller.username}` : 'Alguien');

          await presentCallNotification({
            callId: call.id,
            callerName,
            isVideo: call.kind === 'video',
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wall_post_comments' },
        async (payload) => {
          const comment = payload.new as {
            id?: string;
            post_id?: string;
            author_id?: string;
            content?: string;
          } | undefined;

          if (!comment || !comment.id || comment.author_id === userId) return;

          if (notifiedIdsRef.current.has(`wpc-${comment.id}`)) return;
          notifiedIdsRef.current.add(`wpc-${comment.id}`);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          // Verificar si el post pertenece al usuario actual
          const { data: post } = await supabase
            .from('wall_posts')
            .select('author_id')
            .eq('id', comment.post_id)
            .maybeSingle();

          if (!post || post.author_id !== userId) return;

          const { data: author } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', comment.author_id)
            .maybeSingle();

          const authorName = author?.display_name || (author?.username ? `@${author.username}` : 'Un amigo');
          const preview = comment.content?.trim().slice(0, 80) || 'Comentario';

          await presentWallNotification({
            title: '💬 Nuevo comentario en tu muro',
            body: `${authorName}: "${preview}"`,
            postId: comment.post_id,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wall_post_reactions' },
        async (payload) => {
          const reaction = payload.new as {
            post_id?: string;
            user_id?: string;
            reaction?: string;
          } | undefined;

          if (!reaction || reaction.user_id === userId) return;

          const rKey = `wpr-${reaction.post_id}-${reaction.user_id}`;
          if (notifiedIdsRef.current.has(rKey)) return;
          notifiedIdsRef.current.add(rKey);

          const enabled = await getPushEnabledPreference();
          if (!enabled) return;

          const { data: post } = await supabase
            .from('wall_posts')
            .select('author_id')
            .eq('id', reaction.post_id)
            .maybeSingle();

          if (!post || post.author_id !== userId) return;

          const { data: reactor } = await supabase
            .from('profiles')
            .select('display_name, username')
            .eq('id', reaction.user_id)
            .maybeSingle();

          const name = reactor?.display_name || (reactor?.username ? `@${reactor.username}` : 'A un amigo');

          await presentWallNotification({
            title: '❤️ Reacción en tu muro',
            body: `${name} reaccionó con ${reaction.reaction || '❤️'} a tu publicación.`,
            postId: reaction.post_id,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Sincronización del badge de no leídos
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    const updateBadge = () => {
      const list =
        queryClient.getQueryData<ConversationOverview[]>(queryKeys.conversations) ?? [];
      const totalUnread = list.reduce(
        (acc, item) => acc + (isMutedUntil(item.muted_until) ? 0 : item.unread_count || 0),
        0,
      );
      syncAppBadgeCount(totalUnread).catch(() => {});
    };

    updateBadge();
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey[0] === queryKeys.conversations[0] &&
        event.type === 'updated'
      ) {
        updateBadge();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [userId, queryClient]);
}

export function usePushSettings() {
  const [enabled, setEnabled] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getPushEnabledPreference(),
      getSavedPushToken(),
      Platform.OS === 'web'
        ? Promise.resolve({ status: 'denied' })
        : Notifications.getPermissionsAsync(),
    ]).then(([pref, savedToken, perm]) => {
      if (!mounted) return;
      setEnabled(pref);
      setToken(savedToken);
      setPermissionGranted(perm.status === 'granted');
    });

    return () => {
      mounted = false;
    };
  }, []);

  const togglePush = useCallback(async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    await setPushEnabledPreference(next);
    Haptics.selectionAsync().catch(() => {});

    if (next) {
      const res = await registerForPushNotificationsAsync();
      setPermissionGranted(res.granted);
      setToken(res.token);
      if (!res.granted) {
        setEnabled(false);
        await setPushEnabledPreference(false);
      }
    } else {
      await unregisterPushNotificationsAsync();
      setToken(null);
    }
    setBusy(false);
  }, []);

  const sendTestNotification = useCallback(async (conversationId?: string | null) => {
    const res = await registerForPushNotificationsAsync();
    setPermissionGranted(res.granted);
    setToken(res.token);
    if (!res.granted) return false;

    setEnabled(true);
    await setPushEnabledPreference(true);
    await scheduleTestNotificationAsync(conversationId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return true;
  }, []);

  return {
    enabled,
    token,
    permissionGranted,
    busy,
    togglePush,
    sendTestNotification,
  };
}

