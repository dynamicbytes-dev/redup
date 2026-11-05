import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FALLBACK_URL = 'http://127.0.0.1:54321';

let activeLocalHostOverride: string | null = null;

export function setActiveLocalHostOverride(host: string) {
  activeLocalHostOverride = host;
}

export function getActiveLocalHostOverride(): string | null {
  return activeLocalHostOverride;
}

/**
 * Obtiene el host que sirve el bundle de Metro (p. ej. `localhost` o `127.0.0.1`).
 */
export function bundlerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return host || null;
}

export function getSupabaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!explicit) {
    if (!__DEV__) {
      throw new Error(
        '[Redup Error] EXPO_PUBLIC_SUPABASE_URL no está configurada. En producción se requiere una URL válida de Supabase.',
      );
    }
    return FALLBACK_URL;
  }

  // Solo reescribimos hosts de desarrollo local (puerto 54321 o IPs privadas)
  const isLocalDev = /:54321\b/.test(explicit);
  if (!isLocalDev) return explicit;

  if (activeLocalHostOverride) {
    return explicit.replace(/\/\/([^:/]+):54321/, `//${activeLocalHostOverride}:54321`);
  }

  if (Platform.OS !== 'web') {
    const host = bundlerHost();
    if (host === 'localhost' || host === '127.0.0.1') {
      // Conectado por USB (`adb reverse`) o simulador iOS: usar túnel 127.0.0.1
      return explicit.replace(/\/\/([^:/]+):54321/, '//127.0.0.1:54321');
    }
    if (host) {
      return explicit.replace(/\/\/([^:/]+):54321/, `//${host}:54321`);
    }
  }

  return explicit;
}

/**
 * Reescribe cualquier URL local de Supabase Storage (`:54321`) al host activo que sí responde
 * en el dispositivo actual (por ejemplo `127.0.0.1` vía USB o la IP LAN).
 */
export function normalizeLocalSupabaseUrl(url: string): string {
  if (!/:54321\b/.test(url)) return url;
  const targetHost =
    activeLocalHostOverride ??
    (Platform.OS === 'web'
      ? '127.0.0.1'
      : (() => {
          const h = bundlerHost();
          if (!h || h === 'localhost') return '127.0.0.1';
          return h;
        })());
  return url.replace(/\/\/([^:/]+):54321/, `//${targetHost}:54321`);
}

export const supabaseAnonKey = (() => {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key && !__DEV__) {
    throw new Error(
      '[Redup Error] EXPO_PUBLIC_SUPABASE_ANON_KEY no está configurada. En producción se requiere una anon key válida.',
    );
  }
  return key ?? '';
})();
