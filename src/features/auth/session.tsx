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

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [privacyOverride, setPrivacyOverride] = useState<Partial<PrivacySettings>>({});
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
        setPrivacyOverride({});
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

  // La base de datos es la fuente de verdad; el override es solo optimista (mientras
  // se refresca el perfil tras guardar) y se reinicia al cerrar sesión.
  const serverPrivacy = useMemo<PrivacySettings>(
    () => ({
      showOnline: profileQuery.data?.show_online ?? DEFAULT_PRIVACY.showOnline,
      readReceipts: profileQuery.data?.read_receipts ?? DEFAULT_PRIVACY.readReceipts,
    }),
    [profileQuery.data],
  );

  const privacy = useMemo<PrivacySettings>(
    () => ({ ...serverPrivacy, ...privacyOverride }),
    [serverPrivacy, privacyOverride],
  );

  const updatePrivacy = useCallback(
    async (patch: Partial<PrivacySettings>) => {
      if (!userId) return;
      if (!profileQuery.isSuccess) {
        throw new Error('Espera un momento mientras cargamos tus ajustes.');
      }

      const next: PrivacySettings = { ...privacy, ...patch };

      const { error } = await supabase.rpc('update_privacy_settings', {
        p_show_online: next.showOnline,
        p_read_receipts: next.readReceipts,
      });

      if (error) {
        throw new Error('No pudimos guardar tus ajustes de privacidad. Inténtalo de nuevo.');
      }

      setPrivacyOverride((prev) => ({ ...prev, ...patch }));
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    },
    [privacy, profileQuery.isSuccess, userId],
  );

  // Canal de presencia global en toda la app
  useEffect(() => {
    if (!userId || !profileQuery.isSuccess) return;

    const channel = supabase.channel('redup:presence', {
      config: { private: true, presence: { key: userId } },
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
  }, [userId, profileQuery.isSuccess, privacy.showOnline, appState]);

  // Latido de "última conexión" (solo cuando showOnline está activo y la app está activa)
  useEffect(() => {
    if (!userId || !profileQuery.isSuccess || !privacy.showOnline || appState !== 'active') return;
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
  }, [userId, profileQuery.isSuccess, privacy.showOnline, appState]);

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
