import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';

import { Wordmark } from '@/components/brand/logo';
import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import { useContactsMap, useStartDirectChat, useUserSearch } from '@/features/chats/hooks';
import {
  useFriendRequests,
  useRemoveFriendOrRequest,
  useRespondFriendRequest,
  useSendFriendRequest,
} from '@/features/friends/hooks';
import { formatListTime } from '@/lib/format';
import type { FriendRequestItem, UserSearchResult } from '@/lib/types';
import { useTheme } from '@/theme';

type TabFilter = 'incoming' | 'friends' | 'outgoing';

export default function FriendsScreen() {
  const { colors } = useTheme();
  const { userId } = useSession();

  const friendsQuery = useFriendRequests(userId);
  const contactsMapQuery = useContactsMap(userId);

  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriendOrRequest();
  const startChat = useStartDirectChat();

  const [activeTab, setActiveTab] = useState<TabFilter>('incoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FriendRequestItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm), 260);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const userSearch = useUserSearch(debouncedTerm);
  const contactsMap = contactsMapQuery.data ?? {};
  const isSearching = debouncedTerm.trim().length >= 2;

  async function onRefresh() {
    setRefreshing(true);
    await friendsQuery.refetch();
    setRefreshing(false);
  }

  function handleOpenChat(otherUserId: string) {
    setErrorMessage(null);
    startChat.mutate(otherUserId, {
      onSuccess: (conversationId) => {
        router.push(`/chat/${conversationId}`);
      },
      onError: (err) => {
        setErrorMessage(
          err instanceof Error ? err.message : 'No pudimos abrir la conversación.',
        );
      },
    });
  }

  function handleSendRequest(targetUserId: string) {
    setErrorMessage(null);
    sendRequest.mutate(targetUserId, {
      onError: (err) => {
        setErrorMessage(
          err instanceof Error ? err.message : 'No pudimos enviar la solicitud.',
        );
      },
    });
  }

  function handleRespond(requestId: string, accept: boolean, otherUserId?: string) {
    setErrorMessage(null);
    respondRequest.mutate(
      { requestId, accept },
      {
        onSuccess: () => {
          if (accept && otherUserId) {
            setActiveTab('friends');
          }
        },
        onError: (err) => {
          setErrorMessage(
            err instanceof Error ? err.message : 'No pudimos procesar la solicitud.',
          );
        },
      },
    );
  }

  const sheetOptions: SheetOption[] = selectedItem
    ? [
        ...(selectedItem.status === 'accepted'
          ? [
              {
                label: 'Enviar mensaje',
                icon: 'chatbubble-outline' as const,
                onPress: () => handleOpenChat(selectedItem.other.id),
              },
            ]
          : []),
        {
          label:
            selectedItem.status === 'accepted'
              ? 'Eliminar de mis amigos'
              : 'Cancelar solicitud',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () => {
            removeFriend.mutate(selectedItem.id);
          },
        },
      ]
    : [];

  const activeList =
    activeTab === 'incoming'
      ? friendsQuery.incoming
      : activeTab === 'friends'
        ? friendsQuery.friends
        : friendsQuery.outgoing;

  return (
    <Screen edges={['top']}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <Wordmark size={27} color={colors.text} />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 20,
            backgroundColor: colors.primarySoft,
          }}>
          <Icon name="people" size={16} color={colors.primary} />
          <AppText variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
            {friendsQuery.friends.length} amigo{friendsQuery.friends.length === 1 ? '' : 's'}
          </AppText>
        </View>
      </View>

      {/* Buscador de personas para agregar amigos */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
        <TextField
          icon="person-add-outline"
          placeholder="Buscar por @usuario o nombre para agregar..."
          autoCapitalize="none"
          autoCorrect={false}
          value={searchTerm}
          onChangeText={setSearchTerm}
          right={
            searchTerm.length > 0 ? (
              <Pressable hitSlop={8} onPress={() => setSearchTerm('')}>
                <Icon name="close-circle" size={18} color={colors.textFaint} />
              </Pressable>
            ) : undefined
          }
        />

        <ErrorBanner message={errorMessage} />

        {/* Pestañas de filtro cuando no se está buscando */}
        {!isSearching ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingTop: 2,
            }}>
            <Pressable
              onPress={() => setActiveTab('incoming')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor:
                  activeTab === 'incoming' ? colors.primary : colors.surfaceAlt,
              }}>
              <AppText
                variant="caption"
                color={activeTab === 'incoming' ? colors.onPrimary : colors.textMuted}
                style={{ fontWeight: '700' }}>
                Solicitudes
              </AppText>
              {friendsQuery.incoming.length > 0 ? (
                <View
                  style={{
                    minWidth: 19,
                    height: 19,
                    borderRadius: 10,
                    paddingHorizontal: 5,
                    backgroundColor:
                      activeTab === 'incoming' ? colors.onPrimary : colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <AppText
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: activeTab === 'incoming' ? colors.primary : '#FFFFFF',
                    }}>
                    {friendsQuery.incoming.length}
                  </AppText>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('friends')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor:
                  activeTab === 'friends' ? colors.primary : colors.surfaceAlt,
              }}>
              <AppText
                variant="caption"
                color={activeTab === 'friends' ? colors.onPrimary : colors.textMuted}
                style={{ fontWeight: '700' }}>
                Mis amigos ({friendsQuery.friends.length})
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('outgoing')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor:
                  activeTab === 'outgoing' ? colors.primary : colors.surfaceAlt,
              }}>
              <AppText
                variant="caption"
                color={activeTab === 'outgoing' ? colors.onPrimary : colors.textMuted}
                style={{ fontWeight: '700' }}>
                Enviadas ({friendsQuery.outgoing.length})
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Resultados de búsqueda global */}
      {isSearching ? (
        <FlatList
          data={userSearch.data ?? []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          ListHeaderComponent={
            <AppText
              variant="micro"
              color={colors.textFaint}
              style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              Resultados para “{debouncedTerm.trim()}”
            </AppText>
          }
          renderItem={({ item }: { item: UserSearchResult }) => {
            const relation = friendsQuery.byUserId.get(item.id);
            const isSending =
              sendRequest.isPending && sendRequest.variables === item.id;
            const isResponding =
              respondRequest.isPending &&
              respondRequest.variables?.requestId === relation?.id;
            const isOpeningChat =
              startChat.isPending && startChat.variables === item.id;

            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 11,
                }}>
                <Avatar name={item.display_name} uri={item.avatar_path} size={50} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
                    {contactsMap[item.id] ?? item.display_name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    @{item.username}
                    {item.about ? ` · ${item.about}` : ''}
                  </AppText>
                </View>

                {relation?.status === 'accepted' ? (
                  <Pressable
                    onPress={() => handleOpenChat(item.id)}
                    disabled={isOpeningChat}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.surfaceAlt : colors.primarySoft,
                    })}>
                    {isOpeningChat ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Icon name="chatbubble-outline" size={16} color={colors.primary} />
                        <AppText
                          variant="caption"
                          color={colors.primary}
                          style={{ fontWeight: '700' }}>
                          Conversar
                        </AppText>
                      </>
                    )}
                  </Pressable>
                ) : relation?.status === 'pending' && relation.direction === 'incoming' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable
                      onPress={() => handleRespond(relation.id, true, item.id)}
                      disabled={isResponding}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: colors.primary,
                      }}>
                      <AppText
                        variant="caption"
                        color={colors.onPrimary}
                        style={{ fontWeight: '700' }}>
                        Aceptar
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRespond(relation.id, false)}
                      disabled={isResponding}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: colors.surfaceAlt,
                      }}>
                      <Icon name="close" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                ) : relation?.status === 'pending' && relation.direction === 'outgoing' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 12,
                      backgroundColor: colors.surfaceAlt,
                    }}>
                    <Icon name="time-outline" size={15} color={colors.textMuted} />
                    <AppText variant="caption" color={colors.textMuted} style={{ fontWeight: '600' }}>
                      Pendiente
                    </AppText>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleSendRequest(item.id)}
                    disabled={isSending}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: colors.primary,
                      opacity: pressed || isSending ? 0.85 : 1,
                    })}>
                    {isSending ? (
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
              </View>
            );
          }}
          ListEmptyComponent={
            userSearch.isLoading ? (
              <ActivityIndicator style={{ marginTop: 36 }} color={colors.primary} />
            ) : (
              <EmptyState
                icon="search-outline"
                title="Sin resultados"
                description={`No encontramos ningún usuario con “${debouncedTerm.trim()}”.`}
              />
            )
          }
        />
      ) : (
        /* Lista de Solicitudes / Amigos / Enviadas */
        <FlatList
          data={activeList}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          renderItem={({ item }) => {
            const displayName = contactsMap[item.other.id] ?? item.other.display_name;
            const isResponding =
              respondRequest.isPending && respondRequest.variables?.requestId === item.id;
            const isRemoving =
              removeFriend.isPending && removeFriend.variables === item.id;
            const isOpeningChat =
              startChat.isPending && startChat.variables === item.other.id;

            return (
              <Pressable
                onPress={() => {
                  if (item.status === 'accepted') {
                    handleOpenChat(item.other.id);
                  }
                }}
                onLongPress={() => setSelectedItem(item)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor:
                    pressed && item.status === 'accepted' ? colors.surfaceAlt : 'transparent',
                })}>
                <Avatar name={displayName} uri={item.other.avatar_path} size={52} />

                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16 }}>
                      {displayName}
                    </AppText>
                  </View>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    @{item.other.username}
                    {item.other.about ? ` · ${item.other.about}` : ''}
                  </AppText>
                  <AppText variant="micro" color={colors.textFaint}>
                    {item.status === 'accepted'
                      ? `Amigos desde ${formatListTime(item.updated_at)}`
                      : item.direction === 'incoming'
                        ? `Te envió solicitud · ${formatListTime(item.created_at)}`
                        : `Enviada · ${formatListTime(item.created_at)}`}
                  </AppText>
                </View>

                {/* Controles según pestaña */}
                {activeTab === 'incoming' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() => handleRespond(item.id, true, item.other.id)}
                      disabled={isResponding}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 12,
                        backgroundColor: colors.primary,
                        opacity: pressed || isResponding ? 0.8 : 1,
                      })}>
                      {isResponding && respondRequest.variables?.accept ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <>
                          <Icon name="checkmark" size={16} color={colors.onPrimary} />
                          <AppText
                            variant="caption"
                            color={colors.onPrimary}
                            style={{ fontWeight: '700' }}>
                            Aceptar
                          </AppText>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => handleRespond(item.id, false)}
                      disabled={isResponding}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 12,
                        backgroundColor: pressed ? colors.surfaceStrong : colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: colors.border,
                      })}>
                      <AppText
                        variant="caption"
                        color={colors.danger}
                        style={{ fontWeight: '700' }}>
                        Rechazar
                      </AppText>
                    </Pressable>
                  </View>
                ) : activeTab === 'friends' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable
                      onPress={() => handleOpenChat(item.other.id)}
                      disabled={isOpeningChat}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: pressed ? colors.surfaceAlt : colors.primarySoft,
                      })}>
                      {isOpeningChat ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Icon name="chatbubble-outline" size={16} color={colors.primary} />
                          <AppText
                            variant="caption"
                            color={colors.primary}
                            style={{ fontWeight: '700' }}>
                            Conversar
                          </AppText>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      hitSlop={8}
                      onPress={() => setSelectedItem(item)}
                      style={{ padding: 6 }}>
                      <Icon name="ellipsis-vertical" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => removeFriend.mutate(item.id)}
                    disabled={isRemoving}
                    style={({ pressed }) => ({
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: pressed ? colors.surfaceStrong : colors.surfaceAlt,
                      borderWidth: 1,
                      borderColor: colors.border,
                    })}>
                    {isRemoving ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <AppText
                        variant="caption"
                        color={colors.textMuted}
                        style={{ fontWeight: '700' }}>
                        Cancelar
                      </AppText>
                    )}
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            friendsQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : activeTab === 'incoming' ? (
              <EmptyState
                icon="mail-unread-outline"
                title="No tienes solicitudes pendientes"
                description="Cuando alguien quiera conversar contigo, su solicitud aparecerá aquí para que puedas aceptarla o rechazarla."
              />
            ) : activeTab === 'friends' ? (
              <EmptyState
                icon="people-outline"
                title="Aún no tienes amigos agregados"
                description="Usa el buscador de arriba para encontrar personas por su @usuario y enviarles una solicitud de amistad."
              />
            ) : (
              <EmptyState
                icon="paper-plane-outline"
                title="Sin solicitudes enviadas"
                description="Las solicitudes que envíes y estén pendientes de respuesta aparecerán aquí."
              />
            )
          }
        />
      )}

      <ActionSheet
        visible={Boolean(selectedItem)}
        title={
          selectedItem
            ? `${contactsMap[selectedItem.other.id] ?? selectedItem.other.display_name} (@${selectedItem.other.username})`
            : undefined
        }
        options={sheetOptions}
        onClose={() => setSelectedItem(null)}
      />
    </Screen>
  );
}
