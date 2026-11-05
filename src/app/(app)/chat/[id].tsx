import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  View,
} from 'react-native';
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
import type { ChatMessage } from '@/lib/types';
import { useKeyboardHeight } from '@/lib/use-keyboard';
import { useTheme } from '@/theme';

type Row =
  | { type: 'message'; message: ChatMessage; key: string }
  | { type: 'day'; date: string; key: string };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id ?? '');

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
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
  const [now, setNow] = useState(() => Date.now());

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

      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={rows}
            inverted
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
          bottomInset={keyboardHeight > 0 ? 6 : insets.bottom}
        />
      </View>

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
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}>
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
