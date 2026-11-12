import {
  LiveKitRoom,
} from '@livekit/react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useServerVoiceStore } from '@/features/servers/voice-store';
import { useTheme } from '@/theme';

export function ServerVoiceFloatingBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);

  const {
    activeChannel,
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    participants,
    livekitInfo,
    toggleMute,
    toggleDeafen,
    leaveChannel,
  } = useServerVoiceStore();

  if (!activeChannel) return null;

  return (
    <>
      {/* Barra flotante inferior de conexión de voz */}
      <View
        style={{
          position: 'absolute',
          bottom: Math.max(insets.bottom, 10) + 56, // Justo arriba de la barra de pestañas
          left: 14,
          right: 14,
          backgroundColor: '#111018',
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: isConnecting ? colors.accent : '#22C55E',
          paddingVertical: 10,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 10,
          zIndex: 99,
        }}>
        <Pressable
          onPress={() => setModalOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isConnecting ? colors.accent : '#22C55E',
            }}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 13.5, color: '#FFFFFF' }}>
              🔊 {activeChannel.name}
            </AppText>
            <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>
              {isConnecting
                ? 'Conectando...'
                : `${activeChannel.serverName} · ${participants.length} conectado${participants.length === 1 ? '' : 's'}`}
            </AppText>
          </View>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={toggleMute}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isMuted ? colors.danger : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              name={isMuted ? 'mic-off' : 'mic'}
              size={18}
              color={isMuted ? '#FFFFFF' : colors.text}
            />
          </Pressable>

          <Pressable
            onPress={toggleDeafen}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isDeafened ? colors.accent : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              name={isDeafened ? 'volume-mute' : 'volume-high'}
              size={18}
              color={isDeafened ? '#FFFFFF' : colors.text}
            />
          </Pressable>

          <Pressable
            onPress={leaveChannel}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="call-outline" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Modal interactivo de sala de voz (Estilo Discord) */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5, 5, 8, 0.88)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 20),
              paddingHorizontal: 20,
              maxHeight: '80%',
            }}>
            {/* Cabecera */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: 'center',
                marginBottom: 14,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="volume-high" size={20} color="#22C55E" />
                  <AppText variant="title" numberOfLines={1}>
                    {activeChannel.name}
                  </AppText>
                </View>
                <AppText variant="caption" color={colors.textMuted}>
                  Canal de voz de {activeChannel.serverName}
                </AppText>
              </View>

              <Pressable
                onPress={() => setModalOpen(false)}
                hitSlop={10}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* Lista de Miembros en el Canal de Voz */}
            <AppText
              variant="label"
              color={colors.textFaint}
              style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Miembros conectados ({participants.length})
            </AppText>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 12 }}>
              {participants.map((p) => (
                <View
                  key={p.userId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 10,
                    borderRadius: 14,
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: p.isSpeaking ? '#22C55E' : colors.border,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        padding: 2,
                        borderRadius: 24,
                        borderWidth: 2,
                        borderColor: p.isSpeaking ? '#22C55E' : 'transparent',
                      }}>
                      <Avatar name={p.displayName} uri={p.avatarPath} size={42} />
                    </View>
                    <View>
                      <AppText variant="bodyStrong">{p.displayName}</AppText>
                      <AppText variant="micro" color={colors.textMuted}>
                        @{p.username}
                      </AppText>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {p.isSpeaking ? (
                      <View
                        style={{
                          backgroundColor: '#22C55E20',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}>
                        <AppText style={{ fontSize: 11, color: '#22C55E', fontWeight: '700' }}>
                          Hablando
                        </AppText>
                      </View>
                    ) : null}

                    {p.isMuted ? (
                      <Icon name="mic-off" size={18} color={colors.danger} />
                    ) : (
                      <Icon name="mic" size={18} color={colors.textMuted} />
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Controles de Acción Inferiores */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-around',
                marginTop: 24,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}>
              <Pressable
                onPress={toggleMute}
                style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: isMuted ? colors.danger : colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={24}
                    color={isMuted ? '#FFFFFF' : colors.text}
                  />
                </View>
                <AppText variant="micro" color={isMuted ? colors.danger : colors.textMuted}>
                  {isMuted ? 'Silenciado' : 'Micrófono'}
                </AppText>
              </Pressable>

              <Pressable
                onPress={toggleDeafen}
                style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: isDeafened ? colors.accent : colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon
                    name={isDeafened ? 'volume-mute' : 'volume-high'}
                    size={24}
                    color={isDeafened ? '#FFFFFF' : colors.text}
                  />
                </View>
                <AppText variant="micro" color={isDeafened ? colors.accent : colors.textMuted}>
                  {isDeafened ? 'Ensordecido' : 'Altavoz'}
                </AppText>
              </Pressable>

              <Pressable
                onPress={async () => {
                  setModalOpen(false);
                  await leaveChannel();
                }}
                style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: colors.danger,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name="call" size={24} color="#FFFFFF" />
                </View>
                <AppText variant="micro" color={colors.danger}>
                  Desconectar
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Si hay LiveKit token configurado, montamos la sala para audio WebRTC de fondo */}
      {livekitInfo?.token && livekitInfo?.url && isConnected ? (
        <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
          <LiveKitRoom
            serverUrl={livekitInfo.url}
            token={livekitInfo.token}
            connect={true}
            audio={!isMuted && !isDeafened}
            video={false}>
            <View />
          </LiveKitRoom>
        </View>
      ) : null}
    </>
  );
}
