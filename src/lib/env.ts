import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FALLBACK_URL = 'http://127.0.0.1:54321';

/**
 * En simulador, 127.0.0.1 apunta al Mac. En un teléfono físico (Expo Go o dev build)
 * hay que usar la IP de la máquina que sirve el bundle, que Expo expone en `hostUri`.
 */
function bundlerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    null;
  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

export function getSupabaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SUPABASE_URL ?? FALLBACK_URL;

  if (Platform.OS !== 'web') {
    const host = bundlerHost();
    if (host && /127\.0\.0\.1|localhost/.test(explicit)) {
      return explicit.replace(/(127\.0\.0\.1|localhost)/, host);
    }
    if (Platform.OS === 'android' && /127\.0\.0\.1|localhost/.test(explicit)) {
      return explicit.replace(/(127\.0\.0\.1|localhost)/, '10.0.2.2');
    }
  }

  return explicit;
}

export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
