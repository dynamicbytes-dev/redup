import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Wordmark } from '@/components/brand/logo';
import { ConversationRow } from '@/components/chat/conversation-row';
import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/features/auth/session';
import { useContactsMap, useConversations, useMuteConversation } from '@/features/chats/hooks';
import { useChatListRealtime } from '@/features/chats/realtime';
import { isMutedUntil, mutePresetIso } from '@/lib/format';
import type { ConversationOverview } from '@/lib/types';
import { useTheme } from '@/theme';

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { profile, userId, privacy, globalOnlineIds } = useSession();
  const { data, isLoading, refetch, isRefetching, error } = useConversations();
  const contactsMapQuery = useContactsMap(userId);
  const muteConversation = useMuteConversation(userId ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ConversationOverview | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useChatListRealtime(Boolean(userId));

  const conversations = data ?? [];
  const contactsMap = contactsMapQuery.data ?? {};

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const sheetOptions: SheetOption[] = [];
  if (selected) {
    const muted = isMutedUntil(selected.muted_until);
    if (selected.type === 'group') {
      const convId = selected.id;
      sheetOptions.push({
        label: 'Ver información del grupo',
        icon: 'people-outline',
        onPress: () => router.push(`/group/${convId}`),
      });
    } else if (selected.type === 'direct' && selected.other_user_id) {
      const otherId = selected.other_user_id;
      const convId = selected.id;
      sheetOptions.push({
        label: 'Ver información del contacto',
        icon: 'person-circle-outline',
        onPress: () =>
          router.push({ pathname: '/contact/[id]', params: { id: otherId, conversationId: convId } }),
      });
    }
    if (muted) {
      const convId = selected.id;
      sheetOptions.push({
        label: 'Activar notificaciones',
        icon: 'notifications-outline',
        onPress: () =>
          muteConversation.mutate({ conversationId: convId, mutedUntil: mutePresetIso('off') }),
      });
    } else {
      const convId = selected.id;
      sheetOptions.push(
        {
          label: 'Silenciar por 8 horas',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({ conversationId: convId, mutedUntil: mutePresetIso('8h') }),
        },
        {
          label: 'Silenciar por 1 semana',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({ conversationId: convId, mutedUntil: mutePresetIso('1w') }),
        },
        {
          label: 'Silenciar siempre',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({ conversationId: convId, mutedUntil: mutePresetIso('forever') }),
        },
      );
    }
  }

  return (
    <Screen edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 10,
        }}>
        <Wordmark size={27} color={colors.text} />
        <View style={{ flex: 1 }} />
        <Pressable
          hitSlop={8}
          onPress={() => router.push('/new-chat')}
          style={{ marginRight: 14 }}>
          <Icon name="search-outline" size={23} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Avatar name={profile?.display_name} uri={profile?.avatar_path} size={33} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
          <AppText color={colors.textMuted}>No pudimos cargar tus chats.</AppText>
          <Pressable onPress={() => refetch()}>
            <AppText variant="bodyStrong" color={colors.primary}>
              Reintentar
            </AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const recentlyOnline = item.other_last_seen_at
              ? now - new Date(item.other_last_seen_at).getTime() < 2 * 60 * 1000
              : false;
            const online =
              privacy.showOnline &&
              item.type === 'direct' &&
              Boolean(
                (item.other_user_id && globalOnlineIds.includes(item.other_user_id)) ||
                  recentlyOnline,
              );

            return (
              <ConversationRow
                conversation={item}
                currentUserId={userId ?? ''}
                aliasOverride={item.other_user_id ? contactsMap[item.other_user_id] : null}
                onlineOverride={online}
                onPress={() => router.push(`/chat/${item.id}`)}
                onLongPress={() => setSelected(item)}
              />
            );
          }}
          contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 78 }} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, paddingTop: 40 }}>
              <EmptyState
                icon="chatbubbles-outline"
                title="Aquí empieza todo"
                description="Busca a alguien por su nombre de usuario y manda el primer mensaje."
              />
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Pressable
                  onPress={() => router.push('/new-chat')}
                  style={{
                    backgroundColor: colors.primarySoft,
                    paddingHorizontal: 22,
                    paddingVertical: 12,
                    borderRadius: 999,
                  }}>
                  <AppText variant="bodyStrong" color={colors.primary}>
                    Buscar personas
                  </AppText>
                </Pressable>
              </View>
            </View>
          }
        />
      )}

      <Pressable
        onPress={() => router.push('/new-chat')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 20,
          bottom: 22,
          width: 58,
          height: 58,
          borderRadius: 20,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        })}>
        <Icon name="create-outline" size={26} color="#FFFFFF" />
      </Pressable>

      <ActionSheet
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          selected
            ? selected.type === 'group'
              ? (selected.name ?? 'Grupo')
              : ((selected.other_user_id ? contactsMap[selected.other_user_id] : null) ??
                selected.other_display_name ??
                'Conversación')
            : undefined
        }
        options={sheetOptions}
      />
    </Screen>
  );
}
