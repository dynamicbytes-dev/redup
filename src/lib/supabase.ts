import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

import { getSupabaseUrl, supabaseAnonKey } from './env';

export const supabase = createClient(getSupabaseUrl(), supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
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
