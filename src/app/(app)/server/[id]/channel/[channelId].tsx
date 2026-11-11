import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import { pickChatImageFromLibrary, uploadChatMedia } from '@/features/chats/media';
import { shareServerInvite } from '@/features/servers/api';
import {
  useChannelMessages,
  useChannelRealtime,
  useSendChannelMessage,
  useServer,
  useServerChannels,
  useServerMembers,
} from '@/features/servers/hooks';
import {
  saveImageToGallery,
  shareLocalOrRemoteMedia,
} from '@/lib/save-media';
import { useTheme } from '@/theme';

export default function ServerChannelScreen() {
  const { id, channelId } = useLocalSearchParams<{ id: string; channelId: string }>();
  const serverId = String(id ?? '');
  const activeChannelId = String(channelId ?? '');

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();

  const { data: server } = useServer(serverId);
  const { data: channels = [] } = useServerChannels(serverId);
  const { data: members = [] } = useServerMembers(serverId);
  const { data: messages = [], isLoading: loadingMessages } = useChannelMessages(activeChannelId);

  // Realtime
  useChannelRealtime(activeChannelId);

  const channel = useMemo(
    () => channels.find((c) => c.id === activeChannelId),
    [channels, activeChannelId],
  );

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Manejo fluido de teclado anti-superposición
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  const fallbackKeyboardHeight = useSharedValue(0);

  useEffect(() => {
    const onShow = (e: any) => {
      const h = Math.max(0, e?.endCoordinates?.height ?? 0);
      const duration = Platform.OS === 'ios' ? (e?.duration ?? 250) : 180;
      fallbackKeyboardHeight.value = withTiming(h, {
        duration,
        easing: Easing.out(Easing.ease),
      });
    };

    const onHide = (e: any) => {
      const duration = Platform.OS === 'ios' ? (e?.duration ?? 250) : 180;
      fallbackKeyboardHeight.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.ease),
      });
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];

    return () => {
      for (const sub of subs) sub.remove();
    };
  }, [fallbackKeyboardHeight]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const reanimatedHeight = Math.max(0, keyboard.height.value);
    const nativeHeight = Math.max(0, fallbackKeyboardHeight.value);
    const activeKeyboard = Math.max(reanimatedHeight, nativeHeight);
    return {
      paddingBottom: Math.max(activeKeyboard, insets.bottom),
    };
  });

  const sendMutation = useSendChannelMessage(activeChannelId);

  async function handleSend() {
    const body = text.trim();
    if (!body || !userId || sending) return;

    setSending(true);
    setText('');
    try {
      await sendMutation.mutateAsync({
        channelId: activeChannelId,
        serverId,
        senderId: userId,
        body,
      });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No pudimos enviar el mensaje.');
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function handleSendPhoto() {
    if (!userId || sending) return;
    try {
      const picked = await pickChatImageFromLibrary();
      if (!picked) return;

      setSending(true);
      const messageId = crypto.randomUUID();
      const uploaded = await uploadChatMedia({
        conversationId: `server-${serverId}`,
        messageId,
        media: picked,
      });
      await sendMutation.mutateAsync({
        channelId: activeChannelId,
        serverId,
        senderId: userId,
        body: '📷 Foto',
        kind: 'image',
        mediaPath: uploaded.path,
        mediaMeta: uploaded.meta,
      });
    } catch {
      Alert.alert('Error', 'No pudimos enviar la foto.');
    } finally {
      setSending(false);
    }
  }

  async function handleShare() {
    if (!server) return;
    await shareServerInvite(server.name, server.invite_code);
  }

  const options: SheetOption[] = [
    {
      label: 'Invitar personas / Compartir enlace',
      icon: 'share-social-outline',
      onPress: handleShare,
    },
    {
      label: 'Ver miembros del servidor',
      icon: 'people-outline',
      onPress: () => setMembersModalOpen(true),
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ========================================================= */}
      {/* HEADER DEL CANAL */}
      {/* ========================================================= */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Pressable hitSlop={8} onPress={() => router.back()} style={{ padding: 4 }}>
            <Icon name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <AppText style={{ color: colors.textFaint, fontSize: 18, fontWeight: '700' }}>
                #
              </AppText>
              <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16.5 }}>
                {channel?.name ?? 'canal'}
              </AppText>
            </View>

            <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>
              {channel?.topic || server?.name || 'Servidor'}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable hitSlop={8} onPress={handleShare} style={{ padding: 8 }}>
            <Icon name="person-add-outline" size={20} color={colors.text} />
          </Pressable>

          <Pressable hitSlop={8} onPress={() => setOptionsOpen(true)} style={{ padding: 8 }}>
            <Icon name="ellipsis-vertical" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* ========================================================= */}
      {/* MENSAJES Y COMPOSER CON TECLADO ANIMADO */}
      {/* ========================================================= */}
      <Animated.View style={[{ flex: 1 }, animatedContainerStyle]}>
        {loadingMessages ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 14 }}
            renderItem={({ item }) => {
              const isSystem = item.kind === 'system';
              if (isSystem) {
                return (
                  <View
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      marginVertical: 4,
                      backgroundColor: colors.surfaceAlt,
                      borderRadius: 10,
                      alignSelf: 'center',
                    }}>
                    <AppText variant="caption" color={colors.textMuted} align="center">
                      {item.body}
                    </AppText>
                  </View>
                );
              }

              const author = item.sender_profile;
              const authorName = author?.display_name || author?.username || 'Usuario';
              const timeString = format(new Date(item.created_at), 'p', { locale: es });
              const isOwner = server?.owner_id === item.sender_id;

              return (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    marginVertical: 6,
                    paddingVertical: 2,
                  }}>
                  <Avatar name={authorName} uri={author?.avatar_path} size={40} />

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="bodyStrong" style={{ fontSize: 15 }}>
                        {authorName}
                      </AppText>

                      {isOwner ? (
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1.5,
                            borderRadius: 4,
                            backgroundColor: colors.primary,
                          }}>
                          <AppText style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                            CORONA
                          </AppText>
                        </View>
                      ) : null}

                      <AppText variant="micro" color={colors.textMuted}>
                        {timeString}
                      </AppText>
                    </View>

                    {item.body ? (
                      <AppText
                        variant="body"
                        color={colors.text}
                        style={{ marginTop: 2, lineHeight: 21 }}>
                        {item.body}
                      </AppText>
                    ) : null}

                    {item.kind === 'image' && item.media_path ? (
                      <Pressable
                        onPress={() => setLightboxImage(item.media_path)}
                        style={{
                          marginTop: 6,
                          borderRadius: 12,
                          overflow: 'hidden',
                          maxWidth: 240,
                          maxHeight: 240,
                        }}>
                        <Image
                          source={{ uri: item.media_path }}
                          style={{ width: 240, height: 180 }}
                          contentFit="cover"
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 32,
                  gap: 10,
                }}>
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppText style={{ fontSize: 28, color: colors.primary, fontWeight: '700' }}>
                    #
                  </AppText>
                </View>

                <AppText variant="title" align="center">
                  ¡Te damos la bienvenida a #{channel?.name}!
                </AppText>
                <AppText variant="body" color={colors.textMuted} align="center">
                  Este es el comienzo del canal #{channel?.name}. ¡Sé el primero en enviar un mensaje!
                </AppText>
              </View>
            }
          />
        )}

        {/* Input Composer de Canal */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.bgElevated,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}>
          <Pressable
            onPress={handleSendPhoto}
            hitSlop={8}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="image-outline" size={20} color={colors.text} />
          </Pressable>

          <View
            style={{
              flex: 1,
              backgroundColor: colors.surfaceAlt,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: Platform.OS === 'ios' ? 8 : 4,
              minHeight: 40,
              justifyContent: 'center',
            }}>
            <TextField
              placeholder={`Enviar mensaje en #${channel?.name ?? 'canal'}`}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              style={{
                fontSize: 15,
                color: colors.text,
                padding: 0,
                margin: 0,
              }}
            />
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: text.trim() ? colors.primary : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: text.trim() ? (pressed ? 0.8 : 1) : 0.5,
            })}>
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Icon
                name="arrow-up"
                size={20}
                color={text.trim() ? '#FFFFFF' : colors.textMuted}
              />
            )}
          </Pressable>
        </View>
      </Animated.View>

      {/* Menú de opciones */}
      <ActionSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={`#${channel?.name}`}
        options={options}
      />

      {/* Modal de Miembros del Servidor */}
      <Modal
        visible={membersModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMembersModalOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }}>
            <AppText variant="title" style={{ fontSize: 18 }}>
              Miembros ({members.length})
            </AppText>
            <Pressable hitSlop={10} onPress={() => setMembersModalOpen(false)}>
              <Icon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <FlatList
            data={members}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item }) => {
              const name = item.profile?.display_name || item.profile?.username || 'Usuario';
              const isOwner = server?.owner_id === item.user_id;

              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 10,
                  }}>
                  <Avatar name={name} uri={item.profile?.avatar_path} size={42} />

                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{name}</AppText>
                    {item.profile?.username ? (
                      <AppText variant="caption" color={colors.textMuted}>
                        @{item.profile.username}
                      </AppText>
                    ) : null}
                  </View>

                  {isOwner ? (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: colors.primary,
                      }}>
                      <AppText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        DUEÑO
                      </AppText>
                    </View>
                  ) : (
                    <AppText variant="caption" color={colors.textMuted}>
                      {item.role}
                    </AppText>
                  )}
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Lightbox para imágenes */}
      <Modal
        visible={Boolean(lightboxImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxImage(null)}>
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                padding: 16,
                gap: 12,
              }}>
              <Pressable
                onPress={async () => {
                  if (lightboxImage) await shareLocalOrRemoteMedia(lightboxImage);
                }}
                style={{ padding: 8 }}>
                <Icon name="share-outline" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (lightboxImage) {
                    const res = await saveImageToGallery(lightboxImage);
                    Alert.alert(res.success ? 'Listo' : 'Aviso', res.message);
                  }
                }}
                style={{ padding: 8 }}>
                <Icon name="download-outline" size={24} color="#FFFFFF" />
              </Pressable>

              <Pressable onPress={() => setLightboxImage(null)} style={{ padding: 8 }}>
                <Icon name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {lightboxImage ? (
                <Image
                  source={{ uri: lightboxImage }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : null}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
