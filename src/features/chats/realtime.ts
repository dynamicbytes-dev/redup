import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { upsertMessage } from './hooks';

const TYPING_TIMEOUT = 4000;

/**
 * Un canal por conversación abierta:
 *  - postgres_changes para mensajes nuevos/editados
 *  - broadcast para "escribiendo…"
 *  - presence para el punto verde
 */
export function useChatRealtime(
  conversationId: string,
  userId: string,
  showOnline = true,
) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    const channel = supabase.channel(`conv:${conversationId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          upsertMessage(queryClient, conversationId, payload.new as Message);
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          upsertMessage(queryClient, conversationId, payload.new as Message);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const sender = (payload as { user_id?: string }).user_id;
        if (!sender || sender === userId) return;

        setTypingIds((prev) => (prev.includes(sender) ? prev : [...prev, sender]));

        if (timers.current[sender]) clearTimeout(timers.current[sender]);
        timers.current[sender] = setTimeout(() => {
          setTypingIds((prev) => prev.filter((id) => id !== sender));
        }, TYPING_TIMEOUT);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<
          string,
          { user_id?: string; show_online?: boolean }[]
        >;
        const ids = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.user_id && entry.show_online !== false) ids.add(entry.user_id);
          }
        }
        setOnlineIds([...ids]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && showOnline) {
          channel.track({
            user_id: userId,
            show_online: true,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
      setTypingIds([]);
      setOnlineIds([]);
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId, showOnline, queryClient]);

  function notifyTyping() {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, at: Date.now() },
    });
  }

  return {
    typingIds,
    onlineIds,
    notifyTyping,
    isTyping: typingIds.length > 0,
  };
}

/** Mantiene fresca la lista de chats mientras la app está abierta. */
export function useChatListRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel('messages-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
          }, 500);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}
