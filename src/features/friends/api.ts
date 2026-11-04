import { supabase } from '@/lib/supabase';
import type { FriendRequestItem, FriendRequestStatus, Profile } from '@/lib/types';

export class FriendsError extends Error {}

type RawFriendRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  pair_key: string;
  status: FriendRequestStatus;
  created_at: string;
  updated_at: string;
  sender:
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'>
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'>[]
    | null;
  receiver:
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'>
    | Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_path' | 'about'>[]
    | null;
};

function unwrapProfile<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchFriendRequests(userId: string): Promise<FriendRequestItem[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select(
      `
      id,
      sender_id,
      receiver_id,
      pair_key,
      status,
      created_at,
      updated_at,
      sender:profiles!friend_requests_sender_id_fkey(id, username, display_name, avatar_path, about),
      receiver:profiles!friend_requests_receiver_id_fkey(id, username, display_name, avatar_path, about)
    `,
    )
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) {
    return [];
  }

  const rows = (data ?? []) as unknown as RawFriendRow[];
  const result: FriendRequestItem[] = [];

  for (const row of rows) {
    const isOutgoing = row.sender_id === userId;
    const otherProfile = unwrapProfile(isOutgoing ? row.receiver : row.sender);
    if (!otherProfile) continue;

    result.push({
      id: row.id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      pair_key: row.pair_key,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      other: otherProfile,
      direction: isOutgoing ? 'outgoing' : 'incoming',
    });
  }

  return result;
}

export async function sendFriendRequest(targetUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_friend_request', {
    target_user: targetUserId,
  });

  if (error) {
    if (/blocked/i.test(error.message)) {
      throw new FriendsError('No puedes enviar solicitud a este usuario.');
    }
    throw new FriendsError('No pudimos enviar la solicitud de amistad.');
  }

  return String(data);
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    request_id: requestId,
    accept,
  });

  if (error) {
    throw new FriendsError(
      accept
        ? 'No pudimos aceptar la solicitud.'
        : 'No pudimos rechazar la solicitud.',
    );
  }

  return String(data);
}

export async function deleteFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', requestId);

  if (error) {
    throw new FriendsError('No pudimos eliminar la solicitud o amistad.');
  }
}

