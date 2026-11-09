import './crypto-polyfill';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  bundlerHost,
  getActiveLocalHostOverride,
  getSupabaseUrl,
  setActiveLocalHostOverride,
  supabaseAnonKey,
} from './env';
import { secureStorage } from './secure-storage';

/**
 * Fetch resiliente para entorno de desarrollo local (:54321).
 * Si el teléfono está conectado por USB (`adb reverse`) o por Wi-Fi con aislamiento de clientes,
 * prueba automáticamente `127.0.0.1`, el host de Metro y `10.0.2.2` (emulador Android),
 * recordando el primer host que responda.
 */
const resilientFetch: typeof fetch = async (input, init) => {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (Platform.OS === 'web' || !/:54321\b/.test(rawUrl)) {
    return fetch(input, init);
  }

  const currentMatch = rawUrl.match(/\/\/([^:/]+):54321/);
  const currentHost = currentMatch?.[1] ?? '127.0.0.1';
  const metroHost = bundlerHost();
  const preferred = getActiveLocalHostOverride();

  const candidates = Array.from(
    new Set(
      [
        preferred,
        '127.0.0.1',
        metroHost && metroHost !== 'localhost' ? metroHost : null,
        // En desarrollo, fallback a la IP LAN de la máquina por si el túnel USB se desconecta
        __DEV__ ? '192.168.1.11' : null,
        currentHost,
        Platform.OS === 'android' ? '10.0.2.2' : null,
      ].filter((h): h is string => Boolean(h)),
    ),
  );

  let lastError: unknown;
  for (const host of candidates) {
    const targetUrl = rawUrl.replace(/\/\/([^:/]+):54321/, `//${host}:54321`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (init?.signal) {
      if (init.signal.aborted) {
        throw new Error('Aborted');
      }
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    // En el host activo o preferido, damos 15s para operaciones pesadas (signup, hashing, mails).
    // Para candidatos no verificados damos 6s antes de conmutar al siguiente host.
    const timeoutMs = (preferred && preferred === host) ? 15000 : 8000;
    timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (preferred !== host) {
        setActiveLocalHostOverride(host);
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (init?.signal?.aborted) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError;
};

export const supabase = createClient(getSupabaseUrl(), supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  global: {
    fetch: resilientFetch,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

let currentAppState: AppStateStatus = (AppState.currentState as AppStateStatus) ?? 'active';

AppState.addEventListener('change', (state) => {
  if (currentAppState.match(/inactive|background/) && state === 'active') {
    supabase.auth.startAutoRefresh();
  } else if (state.match(/inactive|background/)) {
    supabase.auth.stopAutoRefresh();
  }
  currentAppState = state;
});
