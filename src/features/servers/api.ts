import { Share } from 'react-native';

import { supabase } from '@/lib/supabase';
import type {
  ChannelType,
  MessageKind,
  Server,
  ServerChannel,
  ServerChannelMessage,
  ServerMember,
  ServerPreview,
} from '@/lib/types';

export class AppError extends Error {}

export function getServerInviteLink(inviteCode: string): string {
  const clean = inviteCode.trim().toLowerCase();
  return `redup://join/${clean}`;
}

export function extractServerInviteCode(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Coincidencia con esquemas o rutas join/<codigo>
  const match = text.match(/(?:(?:https?:\/\/)?[a-zA-Z0-9.-]+\/|redup:\/\/|\b)join\/([a-zA-Z0-9_-]{4,32})/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  // 2. Coincidencia con "código: <codigo>"
  const codeMatch = text.match(/(?:c[oó]digo(?:\s+de\s+invitaci[oó]n)?[:\s]+)([a-zA-Z0-9_-]{6,32})/i);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1].toLowerCase();
  }

  return null;
}

export async function shareServerInvite(
  serverName: string,
  inviteCode: string,
): Promise<void> {
  const clean = inviteCode.trim().toLowerCase();
  const link = getServerInviteLink(clean);
  const message = `¡Únete a mi servidor "${serverName}" en Redup!\n\nEnlace para abrir en la app:\n${link}\n\nCódigo de invitación: ${clean}`;

  await Share.share({
    title: `Únete a ${serverName} en Redup`,
    message,
    url: link,
  });
}

export async function fetchMyServers(userId: string): Promise<Server[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('server_members')
    .select(`
      role,
      server:servers (
        id,
        name,
        description,
        avatar_path,
        owner_id,
        invite_code,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId);

  if (error) {
    throw new AppError('No pudimos cargar tus servidores.');
  }

  const servers: Server[] = [];
  for (const row of (data ?? []) as any[]) {
    if (row.server) {
      servers.push({
        ...row.server,
        my_role: row.role,
      });
    }
  }

  // Cargar conteo de miembros para cada servidor
  if (servers.length > 0) {
    const serverIds = servers.map((s) => s.id);
    const { data: memberCounts } = await supabase
      .from('server_members')
      .select('server_id')
      .in('server_id', serverIds);

    if (memberCounts) {
      const countsMap = new Map<string, number>();
      for (const item of memberCounts) {
        countsMap.set(item.server_id, (countsMap.get(item.server_id) ?? 0) + 1);
      }
      for (const s of servers) {
        s.member_count = countsMap.get(s.id) ?? 1;
      }
    }
  }

  return servers;
}

export async function fetchServerDetails(serverId: string): Promise<Server | null> {
  const { data, error } = await supabase
    .from('servers')
    .select('*')
    .eq('id', serverId)
    .single();

  if (error || !data) return null;

  const { count } = await supabase
    .from('server_members')
    .select('*', { count: 'exact', head: true })
    .eq('server_id', serverId);

  return {
    ...data,
    member_count: count ?? 1,
  };
}

export async function fetchServerChannels(serverId: string): Promise<ServerChannel[]> {
  const { data, error } = await supabase
    .from('server_channels')
    .select('*')
    .eq('server_id', serverId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError('No pudimos cargar los canales del servidor.');
  }

  return (data ?? []) as ServerChannel[];
}

export async function fetchServerMembers(serverId: string): Promise<ServerMember[]> {
  const { data, error } = await supabase
    .from('server_members')
    .select(`
      server_id,
      user_id,
      role,
      nickname,
      joined_at,
      profile:profiles (
        id,
        username,
        display_name,
        avatar_path,
        about,
        last_seen_at,
        show_online
      )
    `)
    .eq('server_id', serverId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new AppError('No pudimos cargar los miembros del servidor.');
  }

  return (data ?? []) as unknown as ServerMember[];
}

export async function fetchChannelMessages(
  channelId: string,
  limit = 50,
): Promise<ServerChannelMessage[]> {
  const { data, error } = await supabase
    .from('server_channel_messages')
    .select(`
      id,
      channel_id,
      server_id,
      sender_id,
      kind,
      body,
      media_path,
      media_meta,
      duration_ms,
      reply_to_id,
      created_at,
      edited_at,
      deleted_at,
      sender_profile:profiles (
        id,
        username,
        display_name,
        avatar_path,
        about,
        last_seen_at,
        show_online
      )
    `)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError('No pudimos cargar los mensajes del canal.');
  }

  return (data ?? []) as unknown as ServerChannelMessage[];
}

export async function createDiscordServer(params: {
  name: string;
  description?: string | null;
  avatarPath?: string | null;
}): Promise<{ id: string; name: string; invite_code: string; default_channel_id: string }> {
  const { data, error } = await supabase.rpc('create_discord_server', {
    p_name: params.name,
    p_description: params.description ?? null,
    p_avatar_path: params.avatarPath ?? null,
  });

  if (error || !data) {
    throw new AppError(error?.message || 'No pudimos crear el servidor.');
  }

  return data as any;
}

export async function createServerChannel(params: {
  serverId: string;
  name: string;
  topic?: string | null;
  type?: ChannelType;
}): Promise<ServerChannel> {
  const cleanName = params.name.trim().toLowerCase().replace(/\s+/g, '-');
  const { data, error } = await supabase
    .from('server_channels')
    .insert({
      server_id: params.serverId,
      name: cleanName,
      topic: params.topic?.trim() || null,
      type: params.type ?? 'text',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new AppError(error?.message || 'No pudimos crear el canal.');
  }

  return data as ServerChannel;
}

export async function deleteServerChannel(channelId: string): Promise<void> {
  const { error } = await supabase
    .from('server_channels')
    .delete()
    .eq('id', channelId);

  if (error) throw new AppError('No pudimos eliminar el canal.');
}

export async function deleteDiscordServer(serverId: string): Promise<void> {
  const { error } = await supabase
    .from('servers')
    .delete()
    .eq('id', serverId);

  if (error) throw new AppError('No pudimos eliminar el servidor.');
}

export async function leaveDiscordServer(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('server_members')
    .delete()
    .eq('server_id', serverId)
    .eq('user_id', userId);

  if (error) throw new AppError('No pudimos salir del servidor.');
}

export async function getServerPreviewByCode(inviteCode: string): Promise<ServerPreview | null> {
  // Extraer el código en caso de que hayan pegado una URL completa
  let clean = inviteCode.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    clean = parts[parts.length - 1];
  }
  clean = clean.toLowerCase();

  const { data, error } = await supabase.rpc('get_server_preview_by_code', {
    p_code: clean,
  });

  if (error || !data) return null;
  return data as ServerPreview;
}

export async function joinServerByCode(inviteCode: string): Promise<{
  server_id: string;
  name: string;
  channel_id: string;
  already_member: boolean;
}> {
  let clean = inviteCode.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    clean = parts[parts.length - 1];
  }
  clean = clean.toLowerCase();

  const { data, error } = await supabase.rpc('join_server_by_code', {
    p_code: clean,
  });

  if (error || !data) {
    throw new AppError(error?.message || 'No pudimos unirte al servidor.');
  }

  return data as any;
}

export async function sendServerChannelMessage(params: {
  channelId: string;
  serverId: string;
  senderId: string;
  body: string;
  replyToId?: string | null;
  kind?: MessageKind;
  mediaPath?: string | null;
  mediaMeta?: Record<string, unknown> | null;
  durationMs?: number | null;
}): Promise<ServerChannelMessage> {
  const id = crypto.randomUUID();
  const payload = {
    id,
    channel_id: params.channelId,
    server_id: params.serverId,
    sender_id: params.senderId,
    kind: params.kind ?? 'text',
    body: params.body.trim() || null,
    media_path: params.mediaPath ?? null,
    media_meta: params.mediaMeta ?? null,
    duration_ms: params.durationMs ?? null,
    reply_to_id: params.replyToId ?? null,
  };

  const { data, error } = await supabase
    .from('server_channel_messages')
    .insert(payload)
    .select(`
      id,
      channel_id,
      server_id,
      sender_id,
      kind,
      body,
      media_path,
      media_meta,
      duration_ms,
      reply_to_id,
      created_at,
      edited_at,
      deleted_at,
      sender_profile:profiles (
        id,
        username,
        display_name,
        avatar_path,
        about,
        last_seen_at,
        show_online
      )
    `)
    .single();

  if (error || !data) {
    throw new AppError(error?.message || 'No pudimos enviar el mensaje.');
  }

  return data as unknown as ServerChannelMessage;
}
