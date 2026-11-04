import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** URL firmada para un archivo del bucket privado `media` con caché en memoria. */
export async function signedMediaUrl(path: string | null | undefined, expiresIn = 60 * 60) {
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

  const cached = signedCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;

  signedCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + (expiresIn - 120) * 1000,
  });

  return data.signedUrl;
}

/** Hook que resuelve y memoriza la URL firmada de un archivo en `media`. */
export function useSignedMediaUrl(path: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(() => {
    if (!path) return null;
    if (
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('file://') ||
      path.startsWith('blob:') ||
      path.startsWith('data:')
    ) {
      return { path, url: path };
    }
    const cached = signedCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return { path, url: cached.url };
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
    signedMediaUrl(path).then((url) => {
      if (!cancelled) {
        setResolved({ path, url });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

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
  return resolved?.path === path ? resolved.url : (signedCache.get(path)?.url ?? null);
}
