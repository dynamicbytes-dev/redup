import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import type { CallKind, CallLogItem, CallStatus, ConversationType, Profile } from '@/lib/types';

const LOCAL_CALLS_KEY = 'redup.calls.fallback.v1';

export type LiveKitSessionInfo = {
  configured: boolean;
  url: string | null;
  token: string | null;
  roomName: string;
};

type RawCallRow = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string | null;
  kind: CallKind;
  status: CallStatus;
  room_name: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number;
  caller:
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>[]
    | null;
  callee:
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path'>[]
    | null;
  conversation:
    | { id: string; type: ConversationType; name: string | null; avatar_path: string | null }
    | { id: string; type: ConversationType; name: string | null; avatar_path: string | null }[]
    | null;
};

function unwrapSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function normalizeCallRow(row: RawCallRow): CallLogItem {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    caller_id: row.caller_id,
    callee_id: row.callee_id,
    kind: row.kind,
    status: row.status,
    room_name: row.room_name,
    started_at: row.started_at,
    answered_at: row.answered_at,
    ended_at: row.ended_at,
    duration_sec: row.duration_sec ?? 0,
    caller: unwrapSingle(row.caller),
    callee: unwrapSingle(row.callee),
    conversation: unwrapSingle(row.conversation),
  };
}

async function readLocalCalls(): Promise<CallLogItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_CALLS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CallLogItem[];
  } catch {
    return [];
  }
}

async function writeLocalCalls(items: CallLogItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_CALLS_KEY, JSON.stringify(items.slice(0, 60)));
  } catch {
    // Ignorar error de almacenamiento local
  }
}

export async function fetchCallLogs(): Promise<CallLogItem[]> {
  const { data, error } = await supabase
    .from('call_logs')
    .select(
      `
      id,
      conversation_id,
      caller_id,
      callee_id,
      kind,
      status,
      room_name,
      started_at,
      answered_at,
      ended_at,
      duration_sec,
      caller:profiles!call_logs_caller_id_fkey(id, username, display_name, avatar_path),
      callee:profiles!call_logs_callee_id_fkey(id, username, display_name, avatar_path),
      conversation:conversations(id, type, name, avatar_path)
    `,
    )
    .order('started_at', { ascending: false })
    .limit(50);

  const local = await readLocalCalls();

  if (error) {
    return local;
  }

  const remote = ((data ?? []) as unknown as RawCallRow[]).map(normalizeCallRow);
  const remoteIds = new Set(remote.map((item) => item.id));
  const merged = [...remote, ...local.filter((item) => !remoteIds.has(item.id))];
  merged.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return merged;
}

export async function fetchCallById(callId: string): Promise<CallLogItem | null> {
  const { data, error } = await supabase
    .from('call_logs')
    .select(
      `
      id,
      conversation_id,
      caller_id,
      callee_id,
      kind,
      status,
      room_name,
      started_at,
      answered_at,
      ended_at,
      duration_sec,
      caller:profiles!call_logs_caller_id_fkey(id, username, display_name, avatar_path),
      callee:profiles!call_logs_callee_id_fkey(id, username, display_name, avatar_path),
      conversation:conversations(id, type, name, avatar_path)
    `,
    )
    .eq('id', callId)
    .maybeSingle();

  if (!error && data) {
    return normalizeCallRow(data as unknown as RawCallRow);
  }

  const local = await readLocalCalls();
  return local.find((c) => c.id === callId) ?? null;
}

export async function requestLiveKitCredentials(input: {
  conversationId: string;
  roomName: string;
  displayName: string;
}): Promise<LiveKitSessionInfo> {
  const envUrl = process.env.EXPO_PUBLIC_LIVEKIT_URL ?? null;

  try {
    const { data, error } = await supabase.functions.invoke('livekit-token', {
      body: {
        conversationId: input.conversationId,
        roomName: input.roomName,
        displayName: input.displayName,
      },
    });

    if (!error && data && typeof data === 'object') {
      const payload = data as {
        configured?: boolean;
        url?: string | null;
        token?: string | null;
      };
      if (payload.configured && payload.token) {
        return {
          configured: true,
          url: payload.url ?? envUrl,
          token: payload.token,
          roomName: input.roomName,
        };
      }
    }
  } catch {
    // Si la Edge Function no está desplegada en local, usamos señalización Realtime
  }

  return {
    configured: Boolean(envUrl),
    url: envUrl,
    token: null,
    roomName: input.roomName,
  };
}

export async function startCallSession(input: {
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
}): Promise<CallLogItem> {
  const id = Crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const roomName = `redup-${input.conversationId.slice(0, 8)}-${Date.now().toString(36)}`;

  const fallbackItem: CallLogItem = {
    id,
    conversation_id: input.conversationId,
    caller_id: input.callerId,
    callee_id: input.calleeId ?? null,
    kind: input.kind,
    status: 'ringing',
    room_name: roomName,
    started_at: nowIso,
    answered_at: null,
    ended_at: null,
    duration_sec: 0,
    caller: input.callerProfile ?? null,
    callee: input.calleeProfile ?? null,
    conversation: input.conversationMeta ?? {
      id: input.conversationId,
      type: input.calleeId ? 'direct' : 'group',
      name: null,
      avatar_path: null,
    },
  };

  const local = await readLocalCalls();
  await writeLocalCalls([fallbackItem, ...local.filter((c) => c.id !== id)]);

  const { data, error } = await supabase
    .from('call_logs')
    .insert({
      id,
      conversation_id: input.conversationId,
      caller_id: input.callerId,
      callee_id: input.calleeId ?? null,
      kind: input.kind,
      status: 'ringing',
      room_name: roomName,
      started_at: nowIso,
    })
    .select(
      `
      id,
      conversation_id,
      caller_id,
      callee_id,
      kind,
      status,
      room_name,
      started_at,
      answered_at,
      ended_at,
      duration_sec,
      caller:profiles!call_logs_caller_id_fkey(id, username, display_name, avatar_path),
      callee:profiles!call_logs_callee_id_fkey(id, username, display_name, avatar_path),
      conversation:conversations(id, type, name, avatar_path)
    `,
    )
    .maybeSingle();

  const created =
    !error && data ? normalizeCallRow(data as unknown as RawCallRow) : fallbackItem;

  // Emitir señalización de llamada entrante por Realtime
  const signalChannel = supabase.channel('redup:calls');
  signalChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      signalChannel
        .send({
          type: 'broadcast',
          event: 'incoming_call',
          payload: { call: created },
        })
        .finally(() => {
          supabase.removeChannel(signalChannel);
        });
    }
  });

  return created;
}

export async function answerCallSession(callId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const local = await readLocalCalls();
  const updatedLocal = local.map((item) =>
    item.id === callId
      ? { ...item, status: 'ongoing' as CallStatus, answered_at: nowIso }
      : item,
  );
  await writeLocalCalls(updatedLocal);

  await supabase
    .from('call_logs')
    .update({
      status: 'ongoing',
      answered_at: nowIso,
    })
    .eq('id', callId)
    .then(
      () => {},
      () => {},
    );
}

export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function finishCallSession(input: {
  callId: string;
  conversationId: string;
  actorId: string;
  kind: CallKind;
  status: 'completed' | 'missed' | 'declined';
  durationSec: number;
  insertChatSummary?: boolean;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const duration = Math.max(0, Math.floor(input.durationSec));

  const local = await readLocalCalls();
  const updatedLocal = local.map((item) =>
    item.id === input.callId
      ? {
          ...item,
          status: input.status,
          ended_at: nowIso,
          duration_sec: duration,
        }
      : item,
  );
  await writeLocalCalls(updatedLocal);

  await supabase
    .from('call_logs')
    .update({
      status: input.status,
      ended_at: nowIso,
      duration_sec: duration,
    })
    .eq('id', input.callId)
    .then(
      () => {},
      () => {},
    );

  if (input.insertChatSummary) {
    const icon = input.kind === 'video' ? '📹' : '📞';
    const label = input.kind === 'video' ? 'Videollamada' : 'Llamada de voz';
    const summary =
      input.status === 'completed' && duration > 0
        ? `${icon} ${label} · ${formatCallDuration(duration)}`
        : input.status === 'declined'
          ? `${icon} ${label} rechazada`
          : `${icon} ${label} sin respuesta`;

    await supabase
      .from('messages')
      .insert({
        id: Crypto.randomUUID(),
        conversation_id: input.conversationId,
        sender_id: input.actorId,
        kind: 'system',
        body: summary,
      })
      .then(
        () => {},
        () => {},
      );
  }
}

export async function deleteCallLogEntry(callId: string): Promise<void> {
  const local = await readLocalCalls();
  await writeLocalCalls(local.filter((c) => c.id !== callId));

  await supabase
    .from('call_logs')
    .delete()
    .eq('id', callId)
    .then(
      () => {},
      () => {},
    );
}

