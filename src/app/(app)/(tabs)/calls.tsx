import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand/logo';
import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/features/auth/session';
import { formatCallDuration } from '@/features/calls/api';
import { useCallLogs, useDeleteCallLog, useStartCall } from '@/features/calls/hooks';
import { useContactsMap, useConversations } from '@/features/chats/hooks';
import { formatListTime } from '@/lib/format';
import type { CallKind, CallLogItem, ConversationOverview } from '@/lib/types';
import { useTheme } from '@/theme';

export default function CallsScreen() {
  const { colors } = useTheme();
  const { userId, profile } = useSession();
  const callsQuery = useCallLogs(Boolean(userId));
  const conversationsQuery = useConversations();
  const contactsMapQuery = useContactsMap(userId);
  const startCall = useStartCall();
  const deleteCall = useDeleteCallLog();

  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallLogItem | null>(null);
  const [newCallOpen, setNewCallOpen] = useState(false);

  const calls = callsQuery.data ?? [];
  const conversations = conversationsQuery.data ?? [];
  const contactsMap = contactsMapQuery.data ?? {};

  const filteredCalls =
    filter === 'missed'
      ? calls.filter((c) => c.status === 'missed' || c.status === 'declined')
      : calls;

  async function onRefresh() {
    setRefreshing(true);
    await callsQuery.refetch();
    setRefreshing(false);
  }

  function resolveCallDisplay(item: CallLogItem) {
    const isGroup = item.conversation?.type === 'group';
    const isOutgoing = item.caller_id === userId;
    const other = isOutgoing ? item.callee : item.caller;

    const title = isGroup
      ? item.conversation?.name || 'Grupo'
      : (other?.id && contactsMap[other.id]) ||
        other?.display_name ||
        other?.username ||
        'Contacto';

    const avatarPath = isGroup
      ? item.conversation?.avatar_path ?? null
      : other?.avatar_path ?? null;

    const isMissed = item.status === 'missed' || item.status === 'declined';

    const statusLabel = isMissed
      ? item.status === 'declined'
        ? 'Rechazada'
        : isOutgoing
          ? 'Sin respuesta'
          : 'Perdida'
      : isOutgoing
        ? 'Saliente'
        : 'Entrante';

    const durationLabel =
      item.status === 'completed' && item.duration_sec > 0
        ? ` · ${formatCallDuration(item.duration_sec)}`
        : '';

    return {
      title,
      avatarPath,
      other,
      isGroup,
      isOutgoing,
      isMissed,
      subtitle: `${statusLabel}${durationLabel}`,
    };
  }

  function launchCallFromLog(item: CallLogItem, kind: CallKind) {
    if (!userId || startCall.isPending) return;
    const isOutgoing = item.caller_id === userId;
    const other = isOutgoing ? item.callee : item.caller;

    startCall.mutate({
      conversationId: item.conversation_id,
      callerId: userId,
      calleeId: other?.id ?? null,
      kind,
      callerProfile: profile
        ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_path: profile.avatar_path,
          }
        : null,
      calleeProfile: other ?? null,
      conversationMeta: item.conversation,
    });
  }

  function launchCallFromConversation(conv: ConversationOverview, kind: CallKind) {
    if (!userId || startCall.isPending) return;
    setNewCallOpen(false);

    startCall.mutate({
      conversationId: conv.id,
      callerId: userId,
      calleeId: conv.type === 'direct' ? conv.other_user_id : null,
      kind,
      callerProfile: profile
        ? {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_path: profile.avatar_path,
          }
        : null,
      calleeProfile:
        conv.type === 'direct' && conv.other_user_id
          ? {
              id: conv.other_user_id,
              username: conv.other_username ?? 'usuario',
              display_name: conv.other_display_name ?? 'Contacto',
              avatar_path: conv.other_avatar_path,
            }
          : null,
      conversationMeta: {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        avatar_path: conv.avatar_path,
      },
    });
  }

  const sheetOptions: SheetOption[] = [];
  if (selectedCall) {
    const target = selectedCall;
    sheetOptions.push(
      {
        label: 'Llamada de voz',
        icon: 'call-outline',
        onPress: () => launchCallFromLog(target, 'voice'),
      },
      {
        label: 'Videollamada',
        icon: 'videocam-outline',
        onPress: () => launchCallFromLog(target, 'video'),
      },
      {
        label: 'Ir al chat',
        icon: 'chatbubble-outline',
        onPress: () => router.push(`/chat/${target.conversation_id}`),
      },
      {
        label: 'Eliminar del registro',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => deleteCall.mutate(target.id),
      },
    );
  }

  return (
    <Screen edges={['top']}>
      {/* Cabecera */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 10,
        }}>
        <Wordmark size={27} color={colors.text} />

        <Pressable
          onPress={() => setNewCallOpen(true)}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {/* Filtros Todas / Perdidas */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 18,
          paddingBottom: 10,
        }}>
        {(
          [
            { key: 'all', label: 'Todas' },
            { key: 'missed', label: 'Perdidas' },
          ] as const
        ).map((tab) => {
          const active = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: active ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
              }}>
              <AppText
                variant="caption"
                color={active ? colors.onPrimary : colors.textMuted}
                style={{ fontWeight: '600' }}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {callsQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredCalls.length === 0 ? (
        <EmptyState
          icon="call-outline"
          title={filter === 'missed' ? 'Sin llamadas perdidas' : 'Sin llamadas recientes'}
          description="Inicia una llamada de voz o vídeo con tus contactos o grupos tocando el botón + arriba a la derecha."
        />
      ) : (
        <FlatList
          data={filteredCalls}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || callsQuery.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginLeft: 82,
              }}
            />
          )}
          renderItem={({ item }) => {
            const info = resolveCallDisplay(item);
            return (
              <Pressable
                onPress={() => launchCallFromLog(item, item.kind)}
                onLongPress={() => setSelectedCall(item)}
                delayLongPress={260}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}>
                <Avatar name={info.title} uri={info.avatarPath} size={50} />

                <View style={{ flex: 1, gap: 3 }}>
                  <AppText
                    variant="bodyStrong"
                    color={info.isMissed ? colors.danger : colors.text}
                    numberOfLines={1}>
                    {info.title}
                  </AppText>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon
                      name={
                        info.isMissed
                          ? 'alert-circle-outline'
                          : info.isOutgoing
                            ? 'arrow-up-outline'
                            : 'arrow-down-outline'
                      }
                      size={14}
                      color={
                        info.isMissed
                          ? colors.danger
                          : info.isOutgoing
                            ? colors.primary
                            : '#10B981'
                      }
                    />
                    <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                      {info.subtitle} · {formatListTime(item.started_at)}
                    </AppText>
                  </View>
                </View>

                <Pressable
                  onPress={() => launchCallFromLog(item, item.kind)}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.primarySoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon
                    name={item.kind === 'video' ? 'videocam-outline' : 'call-outline'}
                    size={19}
                    color={colors.primary}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      {/* Modal para iniciar nueva llamada desde cualquier conversación */}
      <Modal
        visible={newCallOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewCallOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
            <AppText variant="subtitle">Nueva llamada</AppText>
            <Pressable onPress={() => setNewCallOpen(false)} hitSlop={10}>
              <AppText variant="bodyStrong" color={colors.primary}>
                Cerrar
              </AppText>
            </Pressable>
          </View>

          {conversations.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Sin conversaciones"
              description="Inicia primero un chat desde la pestaña de Chats para poder llamar."
            />
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingVertical: 8 }}
              renderItem={({ item: conv }) => {
                const isGroup = conv.type === 'group';
                const title = isGroup
                  ? conv.name || 'Grupo'
                  : (conv.other_user_id && contactsMap[conv.other_user_id]) ||
                    conv.other_display_name ||
                    conv.other_username ||
                    'Contacto';
                const avatarUri = isGroup ? conv.avatar_path : conv.other_avatar_path;

                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 18,
                      paddingVertical: 11,
                    }}>
                    <Avatar name={title} uri={avatarUri} size={46} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {title}
                      </AppText>
                      <AppText variant="caption" color={colors.textMuted}>
                        {isGroup ? `${conv.member_count} participantes` : `@${conv.other_username ?? ''}`}
                      </AppText>
                    </View>

                    <Pressable
                      onPress={() => launchCallFromConversation(conv, 'voice')}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon name="call-outline" size={18} color={colors.primary} />
                    </Pressable>

                    <Pressable
                      onPress={() => launchCallFromConversation(conv, 'video')}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors.primarySoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon name="videocam-outline" size={19} color={colors.primary} />
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      <ActionSheet
        visible={Boolean(selectedCall)}
        onClose={() => setSelectedCall(null)}
        title={selectedCall ? resolveCallDisplay(selectedCall).title : 'Llamada'}
        options={sheetOptions}
      />
    </Screen>
  );
}
