import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { CallKind, CallLogItem, ConversationType, Profile } from '@/lib/types';

import {
  answerCallSession,
  deleteCallLogEntry,
  fetchCallById,
  fetchCallLogs,
  finishCallSession,
  startCallSession,
} from './api';

export function useCallLogs(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('calls-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_logs' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.calls });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return useQuery({
    queryKey: queryKeys.calls,
    queryFn: fetchCallLogs,
    enabled,
  });
}

export function useCallDetail(callId: string) {
  return useQuery({
    queryKey: queryKeys.call(callId),
    queryFn: () => fetchCallById(callId),
    enabled: Boolean(callId),
  });
}

export function useStartCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      callerId: string;
      calleeId?: string | null;
      kind: CallKind;
      callerProfile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
      calleeProfile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'> | null;
      conversationMeta?: {
        id: string;
        type: ConversationType;
        name: string | null;
        avatar_path: string | null;
      } | null;
    }) => startCallSession(input),
    onSuccess: (call) => {
      queryClient.setQueryData(queryKeys.call(call.id), call);
      queryClient.invalidateQueries({ queryKey: queryKeys.calls });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      router.push(`/call/${call.id}`);
    },
  });
}

export function useAnswerCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (callId: string) => answerCallSession(callId),
    onSuccess: (_data, callId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.call(callId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calls });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  });
}

export function useFinishCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      callId: string;
      conversationId: string;
      actorId: string;
      kind: CallKind;
      status: 'completed' | 'missed' | 'declined';
      durationSec: number;
      insertChatSummary?: boolean;
    }) => finishCallSession(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.call(input.callId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.calls });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(input.conversationId) });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
  });
}

export function useDeleteCallLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (callId: string) => deleteCallLogEntry(callId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calls });
      Haptics.selectionAsync().catch(() => {});
    },
  });
}

export function useIncomingCalls(userId: string | null) {
  const queryClient = useQueryClient();
  const [incomingCall, setIncomingCall] = useState<CallLogItem | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('redup:calls')
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        const call = (payload as { call?: CallLogItem })?.call;
        if (!call || call.caller_id === userId) return;
        if (call.callee_id && call.callee_id !== userId) return;
        setIncomingCall(call);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_logs' },
        async (payload) => {
          const row = payload.new as { id?: string; caller_id?: string; status?: string };
          if (!row?.id || row.caller_id === userId || row.status !== 'ringing') return;
          const detail = await fetchCallById(row.id);
          if (detail && detail.status === 'ringing' && detail.caller_id !== userId) {
            setIncomingCall(detail);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
              () => {},
            );
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_logs' },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (!row?.id) return;
          if (row.status && row.status !== 'ringing') {
            setIncomingCall((current) => (current?.id === row.id ? null : current));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    const target = incomingCall;
    setIncomingCall(null);
    await answerCallSession(target.id);
    queryClient.invalidateQueries({ queryKey: queryKeys.calls });
    queryClient.invalidateQueries({ queryKey: queryKeys.call(target.id) });
    router.push(`/call/${target.id}`);
  }, [incomingCall, queryClient]);

  const declineIncomingCall = useCallback(async () => {
    if (!incomingCall || !userId) return;
    const target = incomingCall;
    setIncomingCall(null);
    await finishCallSession({
      callId: target.id,
      conversationId: target.conversation_id,
      actorId: userId,
      kind: target.kind,
      status: 'declined',
      durationSec: 0,
      insertChatSummary: true,
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.calls });
  }, [incomingCall, userId, queryClient]);

  return {
    incomingCall,
    acceptIncomingCall,
    declineIncomingCall,
  };
}

