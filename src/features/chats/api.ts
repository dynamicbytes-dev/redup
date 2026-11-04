import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

import { compressToJpeg } from '@/features/profile/api';
import { supabase } from '@/lib/supabase';
import type {
  BlockedUser,
  ContactDetail,
  ConversationMember,
  ConversationOverview,
  MemberRole,
  Message,
  Profile,
  UserSearchResult,
} from '@/lib/types';

export const PAGE_SIZE = 30;

export class ChatError extends Error {}

type MessageRow = Omit<Message, 'media_meta'> & { media_meta: unknown };

function normalizeMessage(row: MessageRow): Message {
  return {
    ...row,
    media_meta: (row.media_meta as Record<string, unknown> | null) ?? null,
  };
}

export async function fetchConversations(): Promise<ConversationOverview[]> {
  const { data, error } = await supabase.rpc('get_conversations_overview');
  if (error) throw new ChatError('No pudimos cargar tus chats.');
  return (data ?? []) as ConversationOverview[];
}

export async function fetchMessages(
  conversationId: string,
  before?: string | null,
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw new ChatError('No pudimos cargar los mensajes.');
  return ((data ?? []) as MessageRow[]).map(normalizeMessage);
}

export async function fetchMembers(conversationId: string): Promise<ConversationMember[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select(
      'conversation_id, user_id, role, joined_at, last_read_at, muted_until, profile:profiles(id, username, display_name, avatar_path, about, last_seen_at)',
    )
    .eq('conversation_id', conversationId);

  if (error) throw new ChatError('No pudimos cargar los participantes.');
  return (data ?? []) as unknown as ConversationMember[];
}

export async function insertMessage(input: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  kind?: Message['kind'];
  replyToId?: string | null;
  mediaPath?: string | null;
  mediaMeta?: Record<string, unknown> | null;
  durationMs?: number | null;
}): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      id: input.id,
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      kind: input.kind ?? 'text',
      body: input.body,
      reply_to_id: input.replyToId ?? null,
      media_path: input.mediaPath ?? null,
      media_meta: input.mediaMeta ?? null,
      duration_ms: input.durationMs ?? null,
    })
    .select('*')
    .single();

  if (error) throw new ChatError('No pudimos enviar el mensaje.');
  return normalizeMessage(data as MessageRow);
}

export async function softDeleteMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ body: null, media_path: null, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new ChatError('No pudimos eliminar el mensaje.');
}

export async function editMessage(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new ChatError('No pudimos editar el mensaje.');
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', { conv: conversationId });
  if (error) throw new ChatError('No pudimos marcar como leído.');
}

export async function createDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    other_user: otherUserId,
  });
  if (error) {
    if (/blocked/.test(error.message)) throw new ChatError('No puedes escribir a esta persona.');
    throw new ChatError('No pudimos abrir la conversación.');
  }
  return data as string;
}

export async function searchUsers(term: string): Promise<UserSearchResult[]> {
  const { data, error } = await supabase.rpc('search_users', { q: term });
  if (error) throw new ChatError('No pudimos buscar usuarios.');
  return (data ?? []) as UserSearchResult[];
}

export async function renameConversation(conversationId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ name })
    .eq('id', conversationId);
  if (error) throw new ChatError('No pudimos renombrar el grupo.');
}

export async function setConversationMuted(
  conversationId: string,
  userId: string,
  mutedUntil: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ muted_until: mutedUntil })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw new ChatError('No pudimos actualizar las notificaciones del chat.');
}

export async function fetchContactDetail(
  ownerId: string,
  otherUserId: string,
): Promise<ContactDetail> {
  const [profileRes, contactRes, blockRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path, about, last_seen_at, created_at')
      .eq('id', otherUserId)
      .single(),
    supabase
      .from('contacts')
      .select('alias')
      .eq('owner_id', ownerId)
      .eq('contact_id', otherUserId)
      .maybeSingle(),
    supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', ownerId)
      .eq('blocked_id', otherUserId)
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
    throw new ChatError('No pudimos cargar la información del contacto.');
  }

  return {
    profile: profileRes.data as Profile,
    alias: (contactRes.data as { alias: string | null } | null)?.alias ?? null,
    blocked: Boolean(blockRes.data),
  };
}

export async function upsertContactAlias(
  ownerId: string,
  contactId: string,
  alias: string | null,
): Promise<void> {
  const trimmed = alias?.trim() ?? '';
  if (!trimmed) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('owner_id', ownerId)
      .eq('contact_id', contactId);
    if (error) throw new ChatError('No pudimos quitar el alias del contacto.');
    return;
  }

  const { error } = await supabase
    .from('contacts')
    .upsert({ owner_id: ownerId, contact_id: contactId, alias: trimmed });
  if (error) throw new ChatError('No pudimos guardar el alias del contacto.');
}

export async function setBlockedUser(
  blockerId: string,
  blockedId: string,
  blocked: boolean,
): Promise<void> {
  if (blocked) {
    const { error } = await supabase
      .from('blocks')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId });
    if (error) throw new ChatError('No pudimos bloquear a este usuario.');
    return;
  }

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw new ChatError('No pudimos desbloquear a este usuario.');
}

export async function fetchBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select(
      'blocked_id, created_at, profile:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_path, about)',
    )
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });

  if (error) throw new ChatError('No pudimos cargar los usuarios bloqueados.');
  return (data ?? []) as unknown as BlockedUser[];
}

export async function fetchContactsMap(ownerId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('contacts')
    .select('contact_id, alias')
    .eq('owner_id', ownerId);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { contact_id: string; alias: string | null }[]) {
    if (row.alias?.trim()) map[row.contact_id] = row.alias.trim();
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Fase 3 · Grupos                                                     */
/* ------------------------------------------------------------------ */

export async function uploadGroupAvatar(
  userId: string,
  conversationId: string,
  localUri: string,
  previousPath?: string | null,
): Promise<string> {
  const compressed = await compressToJpeg(localUri);
  const file = new File(compressed);
  const buffer = await file.arrayBuffer();
  const path = `${userId}/group-${conversationId}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw new ChatError('No pudimos subir la foto del grupo.');

  if (previousPath && previousPath.startsWith(`${userId}/`)) {
    await supabase.storage.from('avatars').remove([previousPath]);
  }

  return path;
}

export async function createGroupConversation(input: {
  creatorId: string;
  name: string;
  memberIds: string[];
  localAvatarUri?: string | null;
}): Promise<string> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new ChatError('Escribe un nombre para el grupo.');

  const uniqueMembers = [...new Set(input.memberIds.filter((id) => id && id !== input.creatorId))];
  if (uniqueMembers.length === 0) {
    throw new ChatError('Selecciona al menos un participante.');
  }

  const conversationId = Crypto.randomUUID();
  let avatarPath: string | null = null;

  if (input.localAvatarUri) {
    avatarPath = await uploadGroupAvatar(input.creatorId, conversationId, input.localAvatarUri);
  }

  const { error: convError } = await supabase.from('conversations').insert({
    id: conversationId,
    type: 'group',
    name: cleanName,
    avatar_path: avatarPath,
    created_by: input.creatorId,
  });

  if (convError) throw new ChatError('No pudimos crear el grupo.');

  // Primero insertamos al creador como admin para que la política RLS permita añadir al resto
  const { error: adminError } = await supabase.from('conversation_members').insert({
    conversation_id: conversationId,
    user_id: input.creatorId,
    role: 'admin',
  });

  if (adminError) throw new ChatError('No pudimos configurar los permisos del grupo.');

  const otherRows = uniqueMembers.map((uid) => ({
    conversation_id: conversationId,
    user_id: uid,
    role: 'member' as const,
  }));

  const { error: membersError } = await supabase.from('conversation_members').insert(otherRows);
  if (membersError) throw new ChatError('No pudimos añadir a los participantes del grupo.');

  await supabase.from('messages').insert({
    id: Crypto.randomUUID(),
    conversation_id: conversationId,
    sender_id: input.creatorId,
    kind: 'system',
    body: `Creó el grupo “${cleanName}”`,
  });

  return conversationId;
}

export async function updateGroupDetails(input: {
  conversationId: string;
  actorId: string;
  name?: string;
  avatarPath?: string | null;
  systemText?: string;
}): Promise<void> {
  const patch: { name?: string; avatar_path?: string | null } = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;

  const { error } = await supabase
    .from('conversations')
    .update(patch)
    .eq('id', input.conversationId);

  if (error) throw new ChatError('No pudimos guardar los cambios del grupo.');

  if (input.systemText) {
    await supabase.from('messages').insert({
      id: Crypto.randomUUID(),
      conversation_id: input.conversationId,
      sender_id: input.actorId,
      kind: 'system',
      body: input.systemText,
    });
  }
}

export async function addGroupMembers(input: {
  conversationId: string;
  actorId: string;
  users: { id: string; displayName: string }[];
}): Promise<void> {
  if (input.users.length === 0) return;

  const rows = input.users.map((u) => ({
    conversation_id: input.conversationId,
    user_id: u.id,
    role: 'member' as const,
  }));

  const { error } = await supabase.from('conversation_members').insert(rows);
  if (error) throw new ChatError('No pudimos añadir a los nuevos participantes.');

  const names = input.users.map((u) => u.displayName).join(', ');
  await supabase.from('messages').insert({
    id: Crypto.randomUUID(),
    conversation_id: input.conversationId,
    sender_id: input.actorId,
    kind: 'system',
    body: `Añadió a ${names}`,
  });
}

export async function updateGroupMemberRole(input: {
  conversationId: string;
  actorId: string;
  targetUserId: string;
  targetName: string;
  role: MemberRole;
}): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ role: input.role })
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.targetUserId);

  if (error) throw new ChatError('No pudimos cambiar el rol del participante.');

  await supabase.from('messages').insert({
    id: Crypto.randomUUID(),
    conversation_id: input.conversationId,
    sender_id: input.actorId,
    kind: 'system',
    body:
      input.role === 'admin'
        ? `Nombró administrador a ${input.targetName}`
        : `Quitó como administrador a ${input.targetName}`,
  });
}

export async function removeGroupMember(input: {
  conversationId: string;
  actorId: string;
  targetUserId: string;
  targetName: string;
}): Promise<void> {
  await supabase.from('messages').insert({
    id: Crypto.randomUUID(),
    conversation_id: input.conversationId,
    sender_id: input.actorId,
    kind: 'system',
    body: `Eliminó a ${input.targetName} del grupo`,
  });

  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.targetUserId);

  if (error) throw new ChatError('No pudimos eliminar al participante del grupo.');
}

export async function leaveGroupConversation(input: {
  conversationId: string;
  userId: string;
  displayName: string;
  members: ConversationMember[];
}): Promise<void> {
  const others = input.members.filter((m) => m.user_id !== input.userId);
  const otherAdmins = others.filter((m) => m.role === 'admin');

  if (others.length > 0 && otherAdmins.length === 0) {
    const nextAdmin = [...others].sort(
      (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
    )[0];
    if (nextAdmin) {
      await supabase
        .from('conversation_members')
        .update({ role: 'admin' })
        .eq('conversation_id', input.conversationId)
        .eq('user_id', nextAdmin.user_id);
    }
  }

  await supabase.from('messages').insert({
    id: Crypto.randomUUID(),
    conversation_id: input.conversationId,
    sender_id: input.userId,
    kind: 'system',
    body: `${input.displayName} salió del grupo`,
  });

  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId);

  if (error) throw new ChatError('No pudimos salir del grupo.');
}
