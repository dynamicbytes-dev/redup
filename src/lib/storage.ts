import { useEffect, useState } from 'react';

import { normalizeLocalSupabaseUrl } from './env';
import { supabase } from './supabase';

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return normalizeLocalSupabaseUrl(path);
  return normalizeLocalSupabaseUrl(
    supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl,
  );
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

export type StorageBucket = 'media' | 'statuses' | 'avatars';

/** URL firmada para un archivo de storage (por defecto `media`) con caché en memoria. */
export async function signedMediaUrl(
  path: string | null | undefined,
  expiresIn = 60 * 60,
  bucket: StorageBucket = 'media',
) {
  if (!path) return null;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('file://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const cacheKey = `${bucket}:${path}`;
  const cached = signedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;

  const normalizedUrl = normalizeLocalSupabaseUrl(data.signedUrl);

  signedCache.set(cacheKey, {
    url: normalizedUrl,
    expiresAt: Date.now() + (expiresIn - 120) * 1000,
  });

  return normalizedUrl;
}

/** Hook que resuelve y memoriza la URL firmada de un archivo de storage (por defecto `media`). */
export function useSignedMediaUrl(
  path: string | null | undefined,
  bucket: StorageBucket = 'media',
): string | null {
  const cacheKey = path ? `${bucket}:${path}` : '';

  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(() => {
    if (!path) return null;
    if (
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('file://') ||
      path.startsWith('blob:') ||
      path.startsWith('data:')
    ) {
      return { key: cacheKey, url: path };
    }
    const cached = signedCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { key: cacheKey, url: cached.url };
    }
    return null;
  });

  useEffect(() => {
    if (!path) return;
    if (
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('file://') ||
      path.startsWith('blob:') ||
      path.startsWith('data:')
    ) {
      return;
    }

    let cancelled = false;
    signedMediaUrl(path, 60 * 60, bucket).then((url) => {
      if (!cancelled) {
        setResolved({ key: cacheKey, url });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [path, bucket, cacheKey]);

  if (!path) return null;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('file://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }
  return resolved?.key === cacheKey ? resolved.url : (signedCache.get(cacheKey)?.url ?? null);
}
