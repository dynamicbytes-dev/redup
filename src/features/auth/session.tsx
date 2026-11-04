import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';

import { queryClient, queryKeys } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import type { PrivacySettings, Profile } from '@/lib/types';

type SessionContextValue = {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  privacy: PrivacySettings;
  updatePrivacy: (patch: Partial<PrivacySettings>) => Promise<void>;
  globalOnlineIds: string[];
};

const DEFAULT_PRIVACY: PrivacySettings = {
  showOnline: true,
  readReceipts: true,
};

function privacyStorageKey(userId: string) {
  return `redup.privacy.${userId}`;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [globalOnlineIds, setGlobalOnlineIds] = useState<string[]>([]);
  const [appState, setAppState] = useState<AppStateStatus>(
    () => (AppState.currentState as AppStateStatus | null) ?? 'active',
  );
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // El listener va antes de getSession para no perder eventos.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      } else if (event === 'SIGNED_OUT') {
        queryClient.clear();
        setPrivacy(DEFAULT_PRIVACY);
        setGlobalOnlineIds([]);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  const userId = session?.user.id ?? null;

  // Cargar ajustes de privacidad guardados
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(privacyStorageKey(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<PrivacySettings>;
          setPrivacy({
            showOnline: parsed.showOnline ?? true,
            readReceipts: parsed.readReceipts ?? true,
          });
        } catch {
          // Ignorar JSON corrupto
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updatePrivacy = useCallback(
    async (patch: Partial<PrivacySettings>) => {
      setPrivacy((prev) => {
        const next: PrivacySettings = { ...prev, ...patch };
        if (userId) {
          AsyncStorage.setItem(privacyStorageKey(userId), JSON.stringify(next)).catch(() => {});
          supabase
            .rpc('update_privacy_settings', {
              p_show_online: next.showOnline,
              p_read_receipts: next.readReceipts,
            })
            .then(() => {});
        }
        return next;
      });
    },
    [userId],
  );

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(userId ?? 'anon'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId as string)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: Boolean(userId),
  });

  // Canal de presencia global en toda la app
  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('redup:presence', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<
          string,
          { user_id?: string; show_online?: boolean }[]
        >;
        const ids = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.user_id && entry.show_online !== false) {
              ids.add(entry.user_id);
            }
          }
        }
        setGlobalOnlineIds([...ids]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && privacy.showOnline && appState === 'active') {
          channel.track({
            user_id: userId,
            show_online: true,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      presenceChannelRef.current = null;
      setGlobalOnlineIds([]);
      supabase.removeChannel(channel);
    };
  }, [userId, privacy.showOnline, appState]);

  // Latido de "última conexión" (solo cuando showOnline está activo y la app está activa)
  useEffect(() => {
    if (!userId || !privacy.showOnline || appState !== 'active') return;
    const touch = () => {
      supabase.rpc('touch_last_seen').then(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    };
    const timer = setTimeout(touch, 1000);
    const interval = setInterval(touch, 45_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [userId, privacy.showOnline, appState]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      userId,
      loading,
      profile: profileQuery.data ?? null,
      profileLoading: profileQuery.isLoading,
      refreshProfile: async () => {
        if (userId) await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      },
      privacy,
      updatePrivacy,
      globalOnlineIds,
    }),
    [
      session,
      userId,
      loading,
      profileQuery.data,
      profileQuery.isLoading,
      privacy,
      updatePrivacy,
      globalOnlineIds,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
