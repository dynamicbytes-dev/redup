import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
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

import { Composer } from '@/components/chat/composer';
import { DaySeparator } from '@/components/chat/day-separator';
import { MessageBubble } from '@/components/chat/message-bubble';
import { AppText } from '@/components/ui/app-text';
import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import { useStartCall } from '@/features/calls/hooks';
import {
  markRead,
  useContactsMap,
  useConversations,
  useDeleteMessage,
  useEditMessage,
  useMembers,
  useMessages,
  useMuteConversation,
  useOlderMessages,
  useSendMediaMessage,
  useSendMessage,
} from '@/features/chats/hooks';
import type { PickedMedia } from '@/features/chats/media';
import { useChatRealtime } from '@/features/chats/realtime';
import { setActiveConversationId } from '@/features/notifications/api';
import { isMutedUntil, isSameMessageDay, mutePresetIso, relativeLastSeen } from '@/lib/format';
import { queryKeys } from '@/lib/query-client';
import {
  saveDocumentToDevice,
  saveImageToGallery,
  shareLocalOrRemoteMedia,
} from '@/lib/save-media';
import { signedMediaUrl } from '@/lib/storage';
import type { ChatMessage } from '@/lib/types';
import { useTheme } from '@/theme';

type Row =
  | { type: 'message'; message: ChatMessage; key: string }
  | { type: 'day'; date: string; key: string };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id ?? '');

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });

  // Fallback nativo: en Android con barra de 3 botones o configuraciones edge-to-edge donde
  // useAnimatedKeyboard puede retornar 0, Keyboard.addListener recibe siempre la altura real del teclado.
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

    const onFrame = (e: any) => {
      const h = Math.max(0, e?.endCoordinates?.height ?? 0);
      if (h > 0) {
        fallbackKeyboardHeight.value = h;
      }
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
      Keyboard.addListener('keyboardWillChangeFrame', onFrame),
      Keyboard.addListener('keyboardDidChangeFrame', onFrame),
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
  const queryClient = useQueryClient();
  const { userId, profile, privacy, globalOnlineIds } = useSession();

  const membersQuery = useMembers(conversationId);
  const conversationsQuery = useConversations();
  const contactsMapQuery = useContactsMap(userId);
  const messagesQuery = useMessages(conversationId);
  const loadOlder = useOlderMessages(conversationId);
  const send = useSendMessage(conversationId, userId ?? '');
  const sendMedia = useSendMediaMessage(conversationId, userId ?? '');
  const edit = useEditMessage(conversationId);
  const remove = useDeleteMessage(conversationId);
  const muteConversation = useMuteConversation(userId ?? '');
  const startCall = useStartCall();

  const { typingIds, onlineIds, notifyTyping } = useChatRealtime(
    conversationId,
    userId ?? 'guest',
    privacy.showOnline,
  );

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    uri: string;
    caption?: string | null;
  } | null>(null);
  const [savingLightboxImage, setSavingLightboxImage] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function handleSaveLightboxImage() {
    if (!lightboxImage || savingLightboxImage) return;
    setSavingLightboxImage(true);
    try {
      const res = await saveImageToGallery(lightboxImage.uri);
      Alert.alert(res.success ? 'Listo' : 'Aviso', res.message);
    } catch {
      Alert.alert('Error', 'No pudimos guardar la imagen.');
    } finally {
      setSavingLightboxImage(false);
    }
  }

  async function handleShareLightboxImage() {
    if (!lightboxImage) return;
    await shareLocalOrRemoteMedia(lightboxImage.uri);
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setActiveConversationId(conversationId);
    return () => setActiveConversationId(null);
  }, [conversationId]);

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const otherMembers = members.filter((member) => member.user_id !== userId);
  const other = otherMembers[0];

  const messages = useMemo<ChatMessage[]>(
    () => (messagesQuery.data?.pages.flat() ?? []) as ChatMessage[],
    [messagesQuery.data],
  );

  const chronological = useMemo(() => [...messages].reverse(), [messages]);

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);

  const rows = useMemo(() => {
    const output: Row[] = [];
    let previous: string | null = null;

    for (const message of chronological) {
      if (!previous || !isSameMessageDay(previous, message.created_at)) {
        output.push({
          type: 'day',
          date: message.created_at,
          key: `day-${message.created_at.slice(0, 10)}`,
        });
        previous = message.created_at;
      }
      output.push({ type: 'message', message, key: message.id });
    }

    return output.reverse();
  }, [chronological]);

  const readTimes = otherMembers
    .map((member) =>
      member.last_read_at ? new Date(member.last_read_at).getTime() : Number.NaN,
    )
    .filter((time) => Number.isFinite(time));
  const minOtherRead = readTimes.length ? Math.min(...readTimes) : 0;

  // Marcar como leído al abrir y cuando entra un mensaje nuevo
  useEffect(() => {
    if (!userId || !conversationId) return;
    markRead(conversationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      })
      .catch(() => {});
  }, [conversationId, userId, messages.length, queryClient]);

  const conversation = conversationsQuery.data?.find((item) => item.id === conversationId);
  const isGroup =
    conversation?.type === 'group' || otherMembers.length > 1 || members.length > 2;
  const contactsMap = useMemo(() => contactsMapQuery.data ?? {}, [contactsMapQuery.data]);
  const otherAlias = other?.user_id ? contactsMap[other.user_id] : null;
  const title = isGroup
    ? (conversation?.name ?? 'Grupo')
    : (otherAlias || other?.profile?.display_name || conversation?.other_display_name || 'Conversación');
  const myMember = members.find((member) => member.user_id === userId);
  const isMuted = isMutedUntil(myMember?.muted_until ?? conversation?.muted_until);

  const isOnline =
    !isGroup &&
    privacy.showOnline &&
    other?.profile?.show_online !== false &&
    (Boolean(
      other && (onlineIds.includes(other.user_id) || globalOnlineIds.includes(other.user_id)),
    ) ||
      (other?.profile?.last_seen_at
        ? now - new Date(other.profile.last_seen_at).getTime() < 60_000
        : false));

  const groupOnlineCount = useMemo(() => {
    if (!isGroup || !privacy.showOnline) return 0;
    const activeSet = new Set([...onlineIds, ...globalOnlineIds]);
    let count = 0;
    for (const member of members) {
      if (activeSet.has(member.user_id)) count += 1;
    }
    return count;
  }, [isGroup, privacy.showOnline, onlineIds, globalOnlineIds, members]);

  const typingSubtitle = useMemo(() => {
    if (typingIds.length === 0) return null;
    if (!isGroup) return 'escribiendo…';
    if (typingIds.length === 1) {
      const typer = members.find((m) => m.user_id === typingIds[0]);
      const typerName =
        (typer?.user_id ? contactsMap[typer.user_id] : null) ??
        typer?.profile?.display_name ??
        'Alguien';
      return `${typerName} está escribiendo…`;
    }
    return `${typingIds.length} personas escribiendo…`;
  }, [typingIds, isGroup, members, contactsMap]);

  const subtitle =
    typingSubtitle ??
    (isGroup
      ? groupOnlineCount > 0
        ? `${members.length || conversation?.member_count || 1} participantes · ${groupOnlineCount} en línea`
        : `${members.length || conversation?.member_count || 1} participantes`
      : !privacy.showOnline || other?.profile?.show_online === false
        ? (other?.profile?.username ? `@${other.profile.username}` : 'privado')
        : isOnline
          ? 'en línea'
          : relativeLastSeen(other?.profile?.last_seen_at));

  const sheetOptions: SheetOption[] = [];
  if (selected && selected.kind !== 'system' && !selected.deleted_at && !selected.failed) {
    sheetOptions.push({
      label: 'Responder',
      icon: 'arrow-undo-outline',
      onPress: () => {
        setEditingMessage(null);
        setReplyTo(selected);
      },
    });
  }
  if (
    selected &&
    selected.sender_id === userId &&
    !selected.deleted_at &&
    !selected.failed &&
    selected.kind === 'text'
  ) {
    sheetOptions.push({
      label: 'Editar mensaje',
      icon: 'create-outline',
      onPress: () => {
        setReplyTo(null);
        setEditingMessage(selected);
      },
    });
  }
  if (selected && selected.kind === 'image' && selected.media_path && !selected.deleted_at) {
    sheetOptions.push({
      label: 'Guardar en la galería',
      icon: 'download-outline',
      onPress: async () => {
        const url = await signedMediaUrl(selected.media_path);
        if (url) {
          const res = await saveImageToGallery(url);
          Alert.alert(res.success ? 'Listo' : 'Aviso', res.message);
        }
      },
    });
    sheetOptions.push({
      label: 'Compartir imagen',
      icon: 'share-social-outline',
      onPress: async () => {
        const url = await signedMediaUrl(selected.media_path);
        if (url) await shareLocalOrRemoteMedia(url);
      },
    });
  }

  if (selected && selected.kind === 'file' && selected.media_path && !selected.deleted_at) {
    sheetOptions.push({
      label: 'Guardar archivo en el dispositivo',
      icon: 'download-outline',
      onPress: async () => {
        const url = await signedMediaUrl(selected.media_path);
        const meta = (selected.media_meta ?? {}) as Record<string, unknown>;
        const name = typeof meta.name === 'string' ? meta.name : 'archivo';
        const mime = typeof meta.mime_type === 'string' ? meta.mime_type : undefined;
        if (url) {
          const res = await saveDocumentToDevice(url, name, mime);
          if (!res.success) Alert.alert('Aviso', res.message);
        }
      },
    });
    sheetOptions.push({
      label: 'Compartir archivo',
      icon: 'share-social-outline',
      onPress: async () => {
        const url = await signedMediaUrl(selected.media_path);
        const meta = (selected.media_meta ?? {}) as Record<string, unknown>;
        const name = typeof meta.name === 'string' ? meta.name : 'archivo';
        const mime = typeof meta.mime_type === 'string' ? meta.mime_type : undefined;
        if (url) await shareLocalOrRemoteMedia(url, name, mime);
      },
    });
  }

  if (selected && selected.kind !== 'system' && selected.sender_id === userId && !selected.deleted_at) {
    sheetOptions.push({
      label: 'Eliminar mensaje',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => remove.mutate(selected.id),
    });
  }

  const headerOptions: SheetOption[] = [];
  if (isGroup) {
    headerOptions.push({
      label: 'Ver información del grupo',
      icon: 'people-outline',
      onPress: () => router.push(`/group/${conversationId}`),
    });
  } else if (other?.user_id) {
    headerOptions.push({
      label: 'Ver información del contacto',
      icon: 'person-circle-outline',
      onPress: () =>
        router.push({
          pathname: '/contact/[id]',
          params: { id: other.user_id, conversationId },
        }),
    });
  }
  if (isMuted) {
    headerOptions.push({
      label: 'Activar notificaciones',
      icon: 'notifications-outline',
      onPress: () =>
        muteConversation.mutate({ conversationId, mutedUntil: mutePresetIso('off') }),
    });
  } else {
    headerOptions.push(
      {
        label: 'Silenciar por 8 horas',
        icon: 'notifications-off-outline',
        onPress: () =>
          muteConversation.mutate({ conversationId, mutedUntil: mutePresetIso('8h') }),
      },
      {
        label: 'Silenciar por 1 semana',
        icon: 'notifications-off-outline',
        onPress: () =>
          muteConversation.mutate({ conversationId, mutedUntil: mutePresetIso('1w') }),
      },
      {
        label: 'Silenciar siempre',
        icon: 'notifications-off-outline',
        onPress: () =>
          muteConversation.mutate({ conversationId, mutedUntil: mutePresetIso('forever') }),
      },
    );
  }

  function handleSend(body: string, replyToId?: string | null) {
    if (!userId) return;
    send.mutate({ id: Crypto.randomUUID(), body, replyToId: replyToId ?? null });
  }

  function handleSendMedia(
    media: PickedMedia,
    caption?: string | null,
    replyToId?: string | null,
  ) {
    if (!userId) return;
    sendMedia.mutate({
      id: Crypto.randomUUID(),
      media,
      caption: caption ?? null,
      replyToId: replyToId ?? null,
    });
  }

  function handleEdit(messageId: string, body: string) {
    edit.mutate({ id: messageId, body });
  }

  function handleRetry(message: ChatMessage) {
    const localMedia = message.media_meta?.localMedia as PickedMedia | undefined;
    if (message.kind !== 'text' && localMedia) {
      sendMedia.mutate({
        id: message.id,
        media: localMedia,
        caption: message.body,
        replyToId: message.reply_to_id,
      });
      return;
    }
    if (!message.body) return;
    send.mutate({ id: message.id, body: message.body, replyToId: message.reply_to_id });
  }

  function openHeaderInfo() {
    if (isGroup) {
      router.push(`/group/${conversationId}`);
      return;
    }
    if (other?.user_id) {
      router.push({
        pathname: '/contact/[id]',
        params: { id: other.user_id, conversationId },
      });
    }
  }

  function handleStartCall(kind: 'voice' | 'video') {
    if (!userId || startCall.isPending) return;
    startCall.mutate({
      conversationId,
      callerId: userId,
      calleeId: isGroup ? null : (other?.user_id ?? null),
      kind,
      callerProfile: profile
        ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_path: profile.avatar_path,
          }
        : null,
      calleeProfile: other?.profile
        ? {
            id: other.profile.id,
            username: other.profile.username,
            display_name: other.profile.display_name,
            avatar_path: other.profile.avatar_path,
          }
        : null,
      conversationMeta: {
        id: conversationId,
        type: isGroup ? 'group' : 'direct',
        name: conversation?.name ?? null,
        avatar_path: conversation?.avatar_path ?? null,
      },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bgElevated }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 8,
            paddingBottom: 10,
            paddingTop: 4,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
          <Pressable
            hitSlop={10}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}
            style={{ padding: 6 }}>
            <Icon name="chevron-back" size={26} color={colors.text} />
          </Pressable>

          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            onPress={openHeaderInfo}>
            <Avatar
              name={title}
              uri={isGroup ? conversation?.avatar_path : other?.profile?.avatar_path}
              size={38}
              online={isOnline}
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16, flexShrink: 1 }}>
                  {title}
                </AppText>
                {isMuted ? (
                  <Icon name="notifications-off-outline" size={14} color={colors.textFaint} />
                ) : null}
              </View>
              <AppText
                variant="micro"
                numberOfLines={1}
                color={typingIds.length > 0 ? colors.primary : colors.textMuted}>
                {subtitle}
              </AppText>
            </View>
          </Pressable>

          <Pressable
            hitSlop={8}
            style={{ padding: 7 }}
            onPress={() => handleStartCall('video')}>
            <Icon name="videocam-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={{ padding: 7 }}
            onPress={() => handleStartCall('voice')}>
            <Icon name="call-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={{ padding: 8 }}
            onPress={() => setHeaderMenuOpen(true)}>
            <Icon name="ellipsis-vertical" size={20} color={colors.text} />
          </Pressable>
        </View>
      </SafeAreaView>

      <Animated.View style={[{ flex: 1 }, animatedContainerStyle]}>
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={rows}
            inverted
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.key}
            contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
            onEndReached={() => {
              if (!loadOlder.isPending && (messagesQuery.data?.pages.length ?? 1) > 0) {
                loadOlder.mutate();
              }
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadOlder.isPending ? (
                <View style={{ paddingVertical: 14 }}>
                  <ActivityIndicator color={colors.primary} size="small" />
                </View>
              ) : undefined
            }
            renderItem={({ item }) => {
              if (item.type === 'day') return <DaySeparator date={item.date} />;

              const message = item.message;
              const isMine = message.sender_id === userId;
              const senderMember = message.sender_id
                ? members.find((member) => member.user_id === message.sender_id)
                : null;
              const senderName =
                message.sender_id === userId
                  ? 'Tú'
                  : (message.sender_id ? contactsMap[message.sender_id] : null) ??
                    senderMember?.profile?.display_name ??
                    null;
              const reply = message.reply_to_id ? messagesById.get(message.reply_to_id) : null;
              const repliedMember = reply?.sender_id
                ? members.find((member) => member.user_id === reply.sender_id)
                : null;
              const repliedName =
                reply?.sender_id === userId
                  ? 'Tú'
                  : (reply?.sender_id ? contactsMap[reply.sender_id] : null) ??
                    repliedMember?.profile?.display_name ??
                    null;

              const canShowReadReceipts =
                isGroup || (privacy.readReceipts && other?.profile?.read_receipts !== false);

              return (
                <MessageBubble
                  message={message}
                  isMine={isMine}
                  readByOthers={
                    canShowReadReceipts && minOtherRead >= new Date(message.created_at).getTime()
                  }
                  showSender={isGroup}
                  senderName={senderName}
                  senderAvatar={senderMember?.profile?.avatar_path}
                  onPressSender={
                    message.sender_id && message.sender_id !== userId
                      ? () =>
                          router.push({
                            pathname: '/contact/[id]',
                            params: { id: message.sender_id as string },
                          })
                      : undefined
                  }
                  onPressImage={(uri, caption) => setLightboxImage({ uri, caption })}
                  replyTo={reply ?? null}
                  repliedName={repliedName}
                  onLongPress={
                    message.kind === 'system' ? undefined : () => setSelected(message)
                  }
                  onRetry={() => handleRetry(message)}
                />
              );
            }}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <AppText variant="title" align="center">
                  Di hola 👋
                </AppText>
                <AppText color={colors.textMuted} align="center" style={{ marginTop: 6 }}>
                  Este es el principio de la conversación.
                </AppText>
              </View>
            }
          />
        )}

        <Composer
          key={editingMessage?.id ?? 'new'}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          onEdit={handleEdit}
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onTyping={notifyTyping}
          bottomInset={0}
        />
      </Animated.View>

      <ActionSheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        options={sheetOptions}
      />

      <ActionSheet
        visible={headerMenuOpen}
        onClose={() => setHeaderMenuOpen(false)}
        title={title}
        options={headerOptions}
      />

      <Modal
        visible={Boolean(lightboxImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxImage(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(6, 5, 12, 0.96)',
            justifyContent: 'center',
          }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}>
              <Pressable
                onPress={handleShareLightboxImage}
                hitSlop={10}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="share-outline" size={22} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={handleSaveLightboxImage}
                disabled={savingLightboxImage}
                hitSlop={10}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {savingLightboxImage ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="download-outline" size={22} color="#FFFFFF" />
                )}
              </Pressable>

              <Pressable
                onPress={() => setLightboxImage(null)}
                hitSlop={10}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {lightboxImage ? (
                <Image
                  source={{ uri: lightboxImage.uri }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              ) : null}
            </View>

            {lightboxImage?.caption ? (
              <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
                <AppText style={{ color: '#FFFFFF', fontSize: 16 }} align="center">
                  {lightboxImage.caption}
                </AppText>
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
