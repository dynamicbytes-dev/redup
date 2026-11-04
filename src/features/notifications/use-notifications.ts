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
  presentLocalMessageNotification,
  registerForPushNotificationsAsync,
  scheduleTestNotificationAsync,
  setPushEnabledPreference,
  syncAppBadgeCount,
  unregisterPushNotificationsAsync,
} from './api';

function handleNotificationNavigation(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data as
    | { conversationId?: string; url?: string }
    | undefined;

  const conversationId = data?.conversationId;
  Notifications.clearLastNotificationResponse();

  if (conversationId) {
    router.push(`/chat/${conversationId}`);
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

