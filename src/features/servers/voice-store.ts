import * as Haptics from 'expo-haptics';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { Profile, Server, ServerChannel } from '@/lib/types';

export type VoiceParticipant = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: string;
};

export type ActiveVoiceChannel = {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
};

type VoiceState = {
  activeChannel: ActiveVoiceChannel | null;
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  livekitInfo: { token: string | null; url: string | null; configured: boolean } | null;
  participants: VoiceParticipant[];
  realtimeChannel: any | null;

  // Actions
  joinChannel: (channel: ServerChannel, server: Server, myProfile: Profile) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setSpeaking: (speaking: boolean) => void;
};

export const useServerVoiceStore = create<VoiceState>((set, get) => ({
  activeChannel: null,
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  isDeafened: false,
  livekitInfo: null,
  participants: [],
  realtimeChannel: null,

  joinChannel: async (channel, server, myProfile) => {
    const current = get();
    if (current.activeChannel?.id === channel.id && current.isConnected) {
      return; // Ya conectado
    }

    // Salir del canal anterior si estaba en uno
    if (current.activeChannel) {
      await current.leaveChannel();
    }

    set({
      isConnecting: true,
      activeChannel: {
        id: channel.id,
        name: channel.name,
        serverId: server.id,
        serverName: server.name,
      },
      isMuted: false,
      isDeafened: false,
      participants: [],
    });

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      // 1. Obtener credenciales de LiveKit para este canal de voz
      let livekitResult: { token: string | null; url: string | null; configured: boolean } | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { channelId: channel.id },
        });
        if (!error && data?.token) {
          livekitResult = {
            token: data.token,
            url: data.url,
            configured: Boolean(data.configured),
          };
        }
      } catch {
        // En caso de que la Edge Function no responda, la presencia Realtime funcionará como fallback
      }

      // 2. Conectar al canal de presencia Realtime para listar participantes y estados
      const presenceChannelName = `server:voice:${channel.id}`;
      const rtChannel = supabase.channel(presenceChannelName, {
        config: { presence: { key: myProfile.id } },
      });

      const initialParticipant: VoiceParticipant = {
        userId: myProfile.id,
        username: myProfile.username,
        displayName: myProfile.display_name || myProfile.username,
        avatarPath: myProfile.avatar_path,
        isMuted: false,
        isSpeaking: false,
        joinedAt: new Date().toISOString(),
      };

      rtChannel
        .on('presence', { event: 'sync' }, () => {
          const state = rtChannel.presenceState();
          const list: VoiceParticipant[] = [];
          for (const key of Object.keys(state)) {
            const presences = state[key] as any[];
            if (presences && presences.length > 0) {
              const p = presences[0];
              list.push({
                userId: p.userId || key,
                username: p.username || 'usuario',
                displayName: p.displayName || p.username || 'Usuario',
                avatarPath: p.avatarPath ?? null,
                isMuted: Boolean(p.isMuted),
                isSpeaking: Boolean(p.isSpeaking),
                joinedAt: p.joinedAt || new Date().toISOString(),
              });
            }
          }
          // Asegurar que yo siempre esté incluido si estoy conectado
          if (!list.some((item) => item.userId === myProfile.id)) {
            list.push(initialParticipant);
          }
          set({ participants: list });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await rtChannel.track(initialParticipant);
            set({
              isConnecting: false,
              isConnected: true,
              livekitInfo: livekitResult,
              realtimeChannel: rtChannel,
              participants: [initialParticipant],
            });
          }
        });
    } catch {
      set({ isConnecting: false, activeChannel: null });
    }
  },

  leaveChannel: async () => {
    const { realtimeChannel } = get();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (realtimeChannel) {
      try {
        await realtimeChannel.untrack();
        await supabase.removeChannel(realtimeChannel);
      } catch {}
    }

    set({
      activeChannel: null,
      isConnecting: false,
      isConnected: false,
      isMuted: false,
      isDeafened: false,
      livekitInfo: null,
      participants: [],
      realtimeChannel: null,
    });
  },

  toggleMute: () => {
    const { isMuted, realtimeChannel, participants } = get();
    const next = !isMuted;
    Haptics.selectionAsync().catch(() => {});

    set({
      isMuted: next,
      participants: participants.map((p) =>
        p.userId === participants[0]?.userId ? { ...p, isMuted: next } : p,
      ),
    });

    if (realtimeChannel) {
      realtimeChannel.track({
        ...participants[0],
        isMuted: next,
      }).catch(() => {});
    }
  },

  toggleDeafen: () => {
    const { isDeafened, isMuted } = get();
    const next = !isDeafened;
    Haptics.selectionAsync().catch(() => {});

    // Al ensordecerse, también se silencia automáticamente el micrófono
    set({
      isDeafened: next,
      isMuted: next ? true : isMuted,
    });
  },

  setSpeaking: (speaking: boolean) => {
    const { participants, realtimeChannel } = get();
    set({
      participants: participants.map((p) =>
        p.userId === participants[0]?.userId ? { ...p, isSpeaking: speaking } : p,
      ),
    });

    if (realtimeChannel && participants[0]) {
      realtimeChannel.track({
        ...participants[0],
        isSpeaking: speaking,
      }).catch(() => {});
    }
  },
}));

