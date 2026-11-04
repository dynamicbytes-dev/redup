import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { compressToJpeg } from '@/features/profile/api';
import { assertRateLimit, validateStatusCaption } from '@/lib/security';
import { supabase } from '@/lib/supabase';
import type { StatusItem, StatusViewer } from '@/lib/types';

export class StatusError extends Error {}

const LOCAL_FALLBACK_KEY = 'redup.statuses.fallback.v1';

type RawStatusRow = {
  id: string;
  user_id: string;
  kind: 'text' | 'image';
  caption: string | null;
  bg_color: string;
  media_path: string | null;
  created_at: string;
  expires_at: string;
  author: StatusItem['author'];
  views?: {
    viewer_id: string;
    viewed_at: string;
    profile: StatusViewer['profile'];
  }[];
};

async function readFallbackStatuses(): Promise<StatusItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StatusItem[];
    const now = Date.now();
    return parsed.filter((item) => new Date(item.expires_at).getTime() > now);
  } catch {
    return [];
  }
}

async function writeFallbackStatuses(items: StatusItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // Ignorar fallo de almacenamiento local
  }
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /statuses|relation .* does not exist/i.test(error.message ?? '')
  );
}

export async function fetchActiveStatuses(currentUserId: string): Promise<StatusItem[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('statuses')
    .select(
      'id, user_id, kind, caption, bg_color, media_path, created_at, expires_at, author:profiles!statuses_user_id_fkey(id, username, display_name, avatar_path), views:status_views(viewer_id, viewed_at, profile:profiles!status_views_viewer_id_fkey(id, username, display_name, avatar_path))',
    )
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      const local = await readFallbackStatuses();
      return local.map((item) => ({
        ...item,
        viewedByMe:
          item.user_id === currentUserId ||
          item.viewers.some((v) => v.viewer_id === currentUserId),
      }));
    }
    throw new StatusError('No pudimos cargar los estados.');
  }

  return ((data ?? []) as unknown as RawStatusRow[]).map((row) => {
    const viewers: StatusViewer[] = (row.views ?? []).map((v) => ({
      viewer_id: v.viewer_id,
      viewed_at: v.viewed_at,
      profile: v.profile ?? null,
    }));
    return {
      id: row.id,
      user_id: row.user_id,
      kind: row.kind,
      caption: row.caption,
      bg_color: row.bg_color,
      media_path: row.media_path,
      created_at: row.created_at,
      expires_at: row.expires_at,
      author: row.author ?? null,
      viewers,
      viewedByMe:
        row.user_id === currentUserId ||
        viewers.some((v) => v.viewer_id === currentUserId),
    };
  });
}

async function readImageBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const file = new File(uri);
  return file.arrayBuffer();
}

export async function createTextStatus(input: {
  userId: string;
  author: StatusItem['author'];
  caption: string;
  bgColor: string;
}): Promise<void> {
  const { clean, error: valError } = validateStatusCaption(input.caption);
  if (valError) throw new StatusError(valError);

  // Anti-bot rate limit: máx 5 estados cada minuto
  assertRateLimit(`status:${input.userId}`, 5, 60_000, 'Estás publicando estados demasiado rápido.');

  const id = Crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 3600 * 1000);

  const { error } = await supabase.from('statuses').insert({
    id,
    user_id: input.userId,
    kind: 'text',
    caption: clean,
    bg_color: input.bgColor,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    if (isMissingTableError(error)) {
      const existing = await readFallbackStatuses();
      existing.push({
        id,
        user_id: input.userId,
        kind: 'text',
        caption: clean,
        bg_color: input.bgColor,
        media_path: null,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        author: input.author,
        viewers: [],
        viewedByMe: true,
      });
      await writeFallbackStatuses(existing);
      return;
    }
    throw new StatusError('No pudimos publicar tu estado.');
  }
}

export async function createImageStatus(input: {
  userId: string;
  author: StatusItem['author'];
  localUri: string;
  caption?: string | null;
}): Promise<void> {
  const id = Crypto.randomUUID();
  const compressed = await compressToJpeg(input.localUri, 1080);
  const buffer = await readImageBuffer(compressed);
  const path = `${input.userId}/status-${id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    throw new StatusError('No pudimos subir la foto del estado.');
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 3600 * 1000);
  let cleanCaption: string | null = null;
  if (input.caption?.trim()) {
    const { clean, error: captionErr } = validateStatusCaption(input.caption);
    if (captionErr) throw new StatusError(captionErr);
    cleanCaption = clean;
  }

  // Anti-bot rate limit: máx 5 estados cada minuto
  assertRateLimit(`status:${input.userId}`, 5, 60_000, 'Estás publicando estados demasiado rápido.');

  const { error } = await supabase.from('statuses').insert({
    id,
    user_id: input.userId,
    kind: 'image',
    caption: cleanCaption,
    bg_color: '#0D0C14',
    media_path: path,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    if (isMissingTableError(error)) {
      const existing = await readFallbackStatuses();
      existing.push({
        id,
        user_id: input.userId,
        kind: 'image',
        caption: cleanCaption,
        bg_color: '#0D0C14',
        media_path: path,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        author: input.author,
        viewers: [],
        viewedByMe: true,
      });
      await writeFallbackStatuses(existing);
      return;
    }
    throw new StatusError('No pudimos publicar el estado con foto.');
  }
}

export async function markStatusViewed(statusId: string, viewerId: string): Promise<void> {
  const { error } = await supabase.from('status_views').upsert({
    status_id: statusId,
    viewer_id: viewerId,
    viewed_at: new Date().toISOString(),
  });

  if (error && isMissingTableError(error)) {
    const existing = await readFallbackStatuses();
    const updated = existing.map((item) => {
      if (item.id !== statusId) return item;
      if (item.viewers.some((v) => v.viewer_id === viewerId)) return item;
      return {
        ...item,
        viewers: [
          ...item.viewers,
          { viewer_id: viewerId, viewed_at: new Date().toISOString(), profile: null },
        ],
      };
    });
    await writeFallbackStatuses(updated);
  }
}

export async function deleteStatus(
  statusId: string,
  mediaPath?: string | null,
): Promise<void> {
  if (mediaPath) {
    await supabase.storage.from('avatars').remove([mediaPath]).catch(() => {});
  }

  const { error } = await supabase.from('statuses').delete().eq('id', statusId);
  if (error) {
    if (isMissingTableError(error)) {
      const existing = await readFallbackStatuses();
      await writeFallbackStatuses(existing.filter((item) => item.id !== statusId));
      return;
    }
    throw new StatusError('No pudimos eliminar el estado.');
  }
}

