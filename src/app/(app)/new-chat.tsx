import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import { useStartDirectChat, useUserSearch } from '@/features/chats/hooks';
import {
  useFriendRequests,
  useRespondFriendRequest,
  useSendFriendRequest,
} from '@/features/friends/hooks';
import type { UserSearchResult } from '@/lib/types';
import { useTheme } from '@/theme';

export default function NewChatScreen() {
  const { colors } = useTheme();
  const { userId } = useSession();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = useStartDirectChat();
  const friendsQuery = useFriendRequests(userId);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 280);
    return () => clearTimeout(timer);
  }, [term]);

  const search = useUserSearch(debounced);
  const isSearching = debounced.trim().length >= 2;

  function openChat(targetUserId: string) {
    setErrorMessage(null);
    start.mutate(targetUserId, {
      onSuccess: (conversationId) => {
        router.replace(`/chat/${conversationId}`);
      },
      onError: (error) => {
        setErrorMessage(
          error instanceof Error ? error.message : 'No pudimos abrir la conversación.',
        );
      },
    });
  }

  function requestFriendship(targetUserId: string) {
    setErrorMessage(null);
    sendRequest.mutate(targetUserId, {
      onError: (error) => {
        setErrorMessage(
          error instanceof Error ? error.message : 'No pudimos enviar la solicitud.',
        );
      },
    });
  }

  function acceptAndChat(requestId: string, targetUserId: string) {
    setErrorMessage(null);
    respondRequest.mutate(
      { requestId, accept: true },
      {
        onSuccess: () => {
          openChat(targetUserId);
        },
        onError: (error) => {
          setErrorMessage(
            error instanceof Error ? error.message : 'No pudimos aceptar la solicitud.',
          );
        },
      },
    );
  }

  const friendUsers: UserSearchResult[] = friendsQuery.friends.map((item) => ({
    id: item.other.id,
    username: item.other.username,
    display_name: item.other.display_name,
    avatar_path: item.other.avatar_path,
    about: item.other.about,
  }));

  const listData = isSearching ? (search.data ?? []) : friendUsers;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ padding: 4 }}>
          <Icon name="close" size={26} color={colors.text} />
        </Pressable>
        <AppText variant="subtitle" style={{ fontSize: 19 }}>
          Nueva conversación
        </AppText>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
        <TextField
          icon="search-outline"
          placeholder="Busca amigos o personas por @usuario"
          autoCapitalize="none"
          autoCorrect={false}
          value={term}
          onChangeText={setTerm}
          autoFocus
        />

        <Pressable
          onPress={() => router.replace('/new-group')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          })}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="people-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Nuevo grupo</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Crea una conversación con varias personas
            </AppText>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        <ErrorBanner message={errorMessage} />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        ListHeaderComponent={
          listData.length > 0 ? (
            <AppText
              variant="micro"
              color={colors.textFaint}
              style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 }}>
              {isSearching
                ? `${listData.length} resultado${listData.length === 1 ? '' : 's'}`
                : `Tus amigos (${listData.length})`}
            </AppText>
          ) : undefined
        }
        renderItem={({ item }) => {
          const relation = friendsQuery.byUserId.get(item.id);
          const isFriend = relation?.status === 'accepted';
          const busyChat = start.isPending && start.variables === item.id;
          const busySend = sendRequest.isPending && sendRequest.variables === item.id;
          const busyAccept =
            respondRequest.isPending && respondRequest.variables?.requestId === relation?.id;

          return (
            <Pressable
              onPress={() => {
                if (isFriend) openChat(item.id);
              }}
              disabled={!isFriend || start.isPending}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
                backgroundColor: pressed && isFriend ? colors.surface : 'transparent',
              })}>
              <Avatar name={item.display_name} uri={item.avatar_path} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
                  {item.display_name}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  @{item.username}
                  {item.about ? ` · ${item.about}` : ''}
                </AppText>
              </View>

              {isFriend ? (
                busyChat ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Pressable
                    onPress={() => openChat(item.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 12,
                      backgroundColor: colors.primarySoft,
                    }}>
                    <Icon name="chatbubble-outline" size={16} color={colors.primary} />
                    <AppText variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
                      Conversar
                    </AppText>
                  </Pressable>
                )
              ) : relation?.status === 'pending' && relation.direction === 'incoming' ? (
                <Pressable
                  onPress={() => acceptAndChat(relation.id, item.id)}
                  disabled={busyAccept}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 12,
                    backgroundColor: colors.primary,
                  }}>
                  {busyAccept ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Icon name="checkmark" size={15} color={colors.onPrimary} />
                      <AppText
                        variant="caption"
                        color={colors.onPrimary}
                        style={{ fontWeight: '700' }}>
                        Aceptar
                      </AppText>
                    </>
                  )}
                </Pressable>
              ) : relation?.status === 'pending' && relation.direction === 'outgoing' ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceAlt,
                  }}>
                  <Icon name="time-outline" size={14} color={colors.textMuted} />
                  <AppText variant="caption" color={colors.textMuted} style={{ fontWeight: '600' }}>
                    Pendiente
                  </AppText>
                </View>
              ) : (
                <Pressable
                  onPress={() => requestFriendship(item.id)}
                  disabled={busySend}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 12,
                    backgroundColor: colors.primary,
                  }}>
                  {busySend ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Icon name="person-add-outline" size={15} color={colors.onPrimary} />
                      <AppText
                        variant="caption"
                        color={colors.onPrimary}
                        style={{ fontWeight: '700' }}>
                        Solicitar
                      </AppText>
                    </>
                  )}
                </Pressable>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !isSearching ? (
            friendsQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
            ) : (
              <EmptyState
                icon="people-outline"
                title="Sin amigos agregados aún"
                description="Para conversar con alguien primero envíale una solicitud de amistad buscándolo arriba o desde la pestaña Amigos."
              />
            )
          ) : search.isLoading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
          ) : (
            <EmptyState
              icon="person-outline"
              title="Sin resultados"
              description={`No encontramos a nadie con “${debounced.trim()}”.`}
            />
          )
        }
      />
    </SafeAreaView>
  );
}
