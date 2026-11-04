import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import {
  formatCallDuration,
  requestLiveKitCredentials,
  type LiveKitSessionInfo,
} from '@/features/calls/api';
import { useAnswerCall, useCallDetail, useFinishCall } from '@/features/calls/hooks';
import { useContactsMap } from '@/features/chats/hooks';
import { supabase } from '@/lib/supabase';
import type { CallStatus } from '@/lib/types';
import { brand } from '@/theme/tokens';

const CALL_COLORS = {
  indigo400: brand.indigoLight,
  emerald: '#10B981',
  amber: '#F59E0B',
  rose400: '#FF7D6E',
  rose500: '#E5484D',
} as const;

export default function ActiveCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const callId = String(id ?? '');

  const { userId, profile } = useSession();
  const callQuery = useCallDetail(callId);
  const contactsMapQuery = useContactsMap(userId);
  const answerMutation = useAnswerCall();
  const finishMutation = useFinishCall();

  const call = callQuery.data;
  const contactsMap = contactsMapQuery.data ?? {};

  const [phase, setPhase] = useState<CallStatus>('ringing');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState<boolean | null>(null);
  const [frontCamera, setFrontCamera] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState<boolean | null>(null);
  const [livekitInfo, setLivekitInfo] = useState<LiveKitSessionInfo | null>(null);
  const endingRef = useRef(false);

  const isVideo = videoEnabled ?? call?.kind === 'video';
  const effectivePhase = call?.status === 'ongoing' && phase === 'ringing' ? 'ongoing' : phase;

  // Solicitar token de LiveKit al abrir la sala
  useEffect(() => {
    if (!call?.conversation_id || !call?.room_name) return;
    let active = true;

    requestLiveKitCredentials({
      conversationId: call.conversation_id,
      roomName: call.room_name,
      displayName: profile?.display_name ?? profile?.username ?? 'Usuario',
    }).then((info) => {
      if (!active) return;
      setLivekitInfo(info);
    });

    return () => {
      active = false;
    };
  }, [call?.conversation_id, call?.room_name, profile?.display_name, profile?.username]);

  // Canal Realtime de la llamada activa + auto-conexión para pruebas en un solo dispositivo
  useEffect(() => {
    if (!callId || !call) return;

    const channel = supabase.channel(`redup:call:${callId}`, {
      config: { presence: { key: userId ?? 'guest' } },
    });

    channel
      .on('broadcast', { event: 'call:accepted' }, () => {
        setPhase('ongoing');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      })
      .on('broadcast', { event: 'call:state' }, ({ payload }) => {
        const data = payload as {
          userId?: string;
          micMuted?: boolean;
          videoEnabled?: boolean;
        };
        if (!data || data.userId === userId) return;
        if (typeof data.micMuted === 'boolean') setRemoteMuted(data.micMuted);
        if (typeof data.videoEnabled === 'boolean') setRemoteVideo(data.videoEnabled);
      })
      .on('broadcast', { event: 'call:ended' }, () => {
        if (endingRef.current) return;
        endingRef.current = true;
        setPhase('completed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setTimeout(() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(app)/(tabs)/calls');
        }, 450);
      })
      .subscribe();

    const connectTimer = setTimeout(() => {
      setPhase((current) => {
        if (current === 'ringing') {
          answerMutation.mutate(callId);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          return 'ongoing';
        }
        return current;
      });
    }, 2600);

    return () => {
      clearTimeout(connectTimer);
      supabase.removeChannel(channel);
    };
  }, [callId, call, userId, answerMutation]);

  // Cronómetro de duración mientras la llamada está en curso
  useEffect(() => {
    if (effectivePhase !== 'ongoing') return;

    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [effectivePhase]);

  function broadcastState(nextMuted: boolean, nextVideo: boolean) {
    if (!callId) return;
    const channel = supabase.channel(`redup:call:${callId}`);
    channel.send({
      type: 'broadcast',
      event: 'call:state',
      payload: {
        userId,
        micMuted: nextMuted,
        videoEnabled: nextVideo,
      },
    });
  }

  function handleToggleMic() {
    const next = !micMuted;
    setMicMuted(next);
    broadcastState(next, Boolean(isVideo));
    Haptics.selectionAsync().catch(() => {});
  }

  function handleToggleSpeaker() {
    setSpeakerOn((prev) => !prev);
    Haptics.selectionAsync().catch(() => {});
  }

  function handleToggleVideo() {
    const next = !isVideo;
    setVideoEnabled(next);
    broadcastState(micMuted, next);
    Haptics.selectionAsync().catch(() => {});
  }

  function handleSwitchCamera() {
    setFrontCamera((prev) => !prev);
    Haptics.selectionAsync().catch(() => {});
  }

  async function handleHangUp() {
    if (endingRef.current) return;
    endingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

    if (call && userId) {
      const channel = supabase.channel(`redup:call:${call.id}`);
      channel
        .send({
          type: 'broadcast',
          event: 'call:ended',
          payload: { by: userId },
        })
        .catch(() => {});

      const finalStatus =
        effectivePhase === 'ongoing' && elapsedSec > 0 ? 'completed' : 'missed';

      await finishMutation
        .mutateAsync({
          callId: call.id,
          conversationId: call.conversation_id,
          actorId: userId,
          kind: isVideo ? 'video' : 'voice',
          status: finalStatus,
          durationSec: elapsedSec,
          insertChatSummary: true,
        })
        .catch(() => {});
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/calls');
    }
  }

  if (callQuery.isLoading && !call) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#0A0912',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator color={CALL_COLORS.indigo400} size="large" />
      </SafeAreaView>
    );
  }

  const isGroup = call?.conversation?.type === 'group';
  const otherProfile =
    call?.caller_id === userId ? call?.callee : call?.caller;
  const targetTitle = isGroup
    ? call?.conversation?.name || 'Llamada grupal'
    : (otherProfile?.id && contactsMap[otherProfile.id]) ||
      otherProfile?.display_name ||
      otherProfile?.username ||
      'Contacto';
  const targetAvatar = isGroup
    ? call?.conversation?.avatar_path
    : otherProfile?.avatar_path;

  const statusSubtitle =
    effectivePhase === 'ringing'
      ? 'Llamando…'
      : effectivePhase === 'ongoing'
        ? formatCallDuration(elapsedSec)
        : 'Llamada finalizada';

  const remoteShowsVideo = remoteVideo ?? isVideo;

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#090812',
        justifyContent: 'space-between',
      }}>
      {/* Barra superior */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingTop: 10,
        }}>
        <Pressable
          onPress={() => {
            if (call?.conversation_id) {
              router.replace(`/chat/${call.conversation_id}`);
            } else if (router.canGoBack()) {
              router.back();
            }
          }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />
        </Pressable>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(91, 75, 232, 0.22)',
            borderWidth: 1,
            borderColor: 'rgba(124, 110, 242, 0.35)',
          }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor:
                effectivePhase === 'ongoing' ? CALL_COLORS.emerald : CALL_COLORS.amber,
            }}
          />
          <AppText variant="micro" color="#E5E4F0" style={{ fontWeight: '600' }}>
            {livekitInfo?.configured
              ? `LiveKit SFU · ${call?.room_name ?? 'sala'}`
              : `Tiempo real · ${call?.room_name ?? 'sala'}`}
          </AppText>
        </View>

        {isVideo ? (
          <Pressable
            onPress={handleSwitchCamera}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="camera-reverse-outline" size={21} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={{ width: 42, height: 42 }} />
        )}
      </View>

      {/* Escenario central (voz o vídeo) */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
        {remoteShowsVideo && effectivePhase === 'ongoing' ? (
          <View
            style={{
              width: '100%',
              flex: 1,
              marginVertical: 20,
              borderRadius: 28,
              backgroundColor: '#151326',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
            <Avatar name={targetTitle} uri={targetAvatar} size={116} />
            <AppText
              variant="subtitle"
              color="#FFFFFF"
              style={{ marginTop: 16, fontSize: 22 }}>
              {targetTitle}
            </AppText>
            <AppText
              variant="caption"
              color="rgba(255,255,255,0.65)"
              style={{ marginTop: 4 }}>
              {statusSubtitle} · Vídeo HD activo
            </AppText>

            {remoteMuted ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: 'rgba(229, 72, 77, 0.25)',
                }}>
                <Icon name="mic-off" size={14} color={CALL_COLORS.rose400} />
                <AppText variant="micro" color="#FFFFFF">
                  Micrófono silenciado
                </AppText>
              </View>
            ) : null}

            {/* Vista previa local Picture-in-Picture */}
            <View
              style={{
                position: 'absolute',
                right: 16,
                bottom: 16,
                width: 108,
                height: 148,
                borderRadius: 18,
                backgroundColor: '#221F38',
                borderWidth: 1.5,
                borderColor: CALL_COLORS.indigo400,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
              }}>
              <Avatar
                name={profile?.display_name ?? 'Tú'}
                uri={profile?.avatar_path}
                size={48}
              />
              <AppText
                variant="micro"
                color="#FFFFFF"
                style={{ marginTop: 8, fontWeight: '600' }}>
                Tú ({frontCamera ? 'Frontal' : 'Trasera'})
              </AppText>
              {micMuted ? (
                <Icon
                  name="mic-off"
                  size={13}
                  color={CALL_COLORS.rose400}
                  style={{ marginTop: 4 }}
                />
              ) : null}
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 164,
                height: 164,
                borderRadius: 82,
                backgroundColor: 'rgba(91, 75, 232, 0.14)',
                borderWidth: 1,
                borderColor: 'rgba(124, 110, 242, 0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <View
                style={{
                  width: 136,
                  height: 136,
                  borderRadius: 68,
                  backgroundColor: 'rgba(91, 75, 232, 0.24)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Avatar name={targetTitle} uri={targetAvatar} size={112} />
              </View>
            </View>

            <AppText
              variant="title"
              color="#FFFFFF"
              style={{ marginTop: 22, textAlign: 'center' }}>
              {targetTitle}
            </AppText>

            <AppText
              variant="body"
              color="rgba(255,255,255,0.7)"
              style={{ marginTop: 6 }}>
              {statusSubtitle}
            </AppText>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.07)',
              }}>
              <Icon
                name={isVideo ? 'videocam-outline' : 'call-outline'}
                size={14}
                color={CALL_COLORS.indigo400}
              />
              <AppText variant="micro" color="rgba(255,255,255,0.75)">
                {isVideo ? 'Videollamada cifrada en tránsito' : 'Llamada de voz HD'}
              </AppText>
            </View>
          </View>
        )}
      </View>

      {/* Controles inferiores de llamada */}
      <View
        style={{
          marginHorizontal: 18,
          marginBottom: 18,
          paddingVertical: 18,
          paddingHorizontal: 16,
          borderRadius: 28,
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}>
        <CallControlButton
          icon={micMuted ? 'mic-off' : 'mic-outline'}
          label={micMuted ? 'Activar' : 'Silenciar'}
          active={micMuted}
          onPress={handleToggleMic}
        />

        <CallControlButton
          icon={isVideo ? 'videocam' : 'videocam-off-outline'}
          label="Vídeo"
          active={Boolean(isVideo)}
          onPress={handleToggleVideo}
        />

        <CallControlButton
          icon={speakerOn ? 'volume-high' : 'volume-medium-outline'}
          label="Altavoz"
          active={speakerOn}
          onPress={handleToggleSpeaker}
        />

        <Pressable
          onPress={handleHangUp}
          style={({ pressed }) => ({
            alignItems: 'center',
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}>
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: CALL_COLORS.rose500,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              name="call"
              size={25}
              color="#FFFFFF"
              style={{ transform: [{ rotate: '135deg' }] }}
            />
          </View>
          <AppText variant="micro" color="#FFFFFF">
            Colgar
          </AppText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CallControlButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}>
      <View
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={icon} size={22} color={active ? '#0A0912' : '#FFFFFF'} />
      </View>
      <AppText variant="micro" color="rgba(255,255,255,0.82)">
        {label}
      </AppText>
    </Pressable>
  );
}
