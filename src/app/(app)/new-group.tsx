import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import {
  useContactsMap,
  useConversations,
  useCreateGroup,
  useUserSearch,
} from '@/features/chats/hooks';
import { pickAvatarImage } from '@/features/profile/api';
import type { UserSearchResult } from '@/lib/types';
import { useTheme } from '@/theme';

export default function NewGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();

  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const conversationsQuery = useConversations();
  const contactsMapQuery = useContactsMap(userId);
  const search = useUserSearch(debounced);
  const createGroup = useCreateGroup(userId ?? '');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 260);
    return () => clearTimeout(timer);
  }, [term]);

  const contactsMap = useMemo(() => contactsMapQuery.data ?? {}, [contactsMapQuery.data]);

  // Personas con las que ya conversas para elegir sin tener que buscar
  const suggestedUsers = useMemo<UserSearchResult[]>(() => {
    const list: UserSearchResult[] = [];
    const seen = new Set<string>();
    for (const conv of conversationsQuery.data ?? []) {
      if (conv.type === 'direct' && conv.other_user_id && !seen.has(conv.other_user_id)) {
        seen.add(conv.other_user_id);
        list.push({
          id: conv.other_user_id,
          username: conv.other_username ?? 'usuario',
          display_name:
            contactsMap[conv.other_user_id] || conv.other_display_name || 'Usuario',
          avatar_path: conv.other_avatar_path,
          about: null,
        });
      }
    }
    return list;
  }, [conversationsQuery.data, contactsMap]);

  const selectedIds = useMemo(
    () => new Set(selectedUsers.map((u) => u.id)),
    [selectedUsers],
  );

  const displayedUsers =
    debounced.trim().length >= 2 ? (search.data ?? []) : suggestedUsers;

  async function choosePhoto() {
    setError(null);
    try {
      const uri = await pickAvatarImage();
      if (uri) setAvatarUri(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir tus fotos.');
    }
  }

  function toggleUser(user: UserSearchResult) {
    setError(null);
    setSelectedUsers((prev) =>
      prev.some((item) => item.id === user.id)
        ? prev.filter((item) => item.id !== user.id)
        : [...prev, user],
    );
  }

  function handleCreate() {
    setError(null);
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Escribe un nombre para el grupo.');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Añade al menos a 1 persona al grupo.');
      return;
    }

    createGroup.mutate(
      {
        name: cleanName,
        memberIds: selectedUsers.map((u) => u.id),
        localAvatarUri: avatarUri,
      },
      {
        onSuccess: (conversationId) => {
          router.replace(`/chat/${conversationId}`);
        },
        onError: (e) => {
          setError(e instanceof Error ? e.message : 'No pudimos crear el grupo.');
        },
      },
    );
  }

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
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" style={{ fontSize: 19 }}>
            Nuevo grupo
          </AppText>
          <AppText variant="micro" color={colors.textMuted}>
            {selectedUsers.length === 0
              ? 'Elige nombre y participantes'
              : `${selectedUsers.length} participante${selectedUsers.length === 1 ? '' : 's'} seleccionado${selectedUsers.length === 1 ? '' : 's'}`}
          </AppText>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={choosePhoto} hitSlop={6}>
            <Avatar name={name.trim() || 'Grupo'} uri={avatarUri} size={60} />
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.bg,
              }}>
              <Icon name="camera" size={12} color="#FFFFFF" />
            </View>
          </Pressable>

          <View style={{ flex: 1 }}>
            <TextField
              icon="people-outline"
              placeholder="Nombre del grupo (ej. Familia, Equipo…)"
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
          </View>
        </View>

        <ErrorBanner message={error} />

        {selectedUsers.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {selectedUsers.map((user) => {
              const display = contactsMap[user.id] || user.display_name;
              return (
                <Pressable
                  key={user.id}
                  onPress={() => toggleUser(user)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingLeft: 6,
                    paddingRight: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: colors.primarySoft,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}>
                  <Avatar name={display} uri={user.avatar_path} size={24} />
                  <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                    {display}
                  </AppText>
                  <Icon name="close-circle" size={16} color={colors.primary} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <TextField
          icon="search-outline"
          placeholder="Buscar personas por usuario o nombre"
          autoCapitalize="none"
          autoCorrect={false}
          value={term}
          onChangeText={setTerm}
        />
      </View>

      <FlatList
        data={displayedUsers}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 20, flexGrow: 1 }}
        ListHeaderComponent={
          displayedUsers.length > 0 ? (
            <AppText
              variant="label"
              color={colors.textFaint}
              style={{
                paddingHorizontal: 20,
                paddingTop: 6,
                paddingBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.7,
              }}>
              {debounced.trim().length >= 2 ? 'Resultados' : 'Contactos recientes'}
            </AppText>
          ) : undefined
        }
        renderItem={({ item }) => {
          const checked = selectedIds.has(item.id);
          const display = contactsMap[item.id] || item.display_name;
          return (
            <Pressable
              onPress={() => toggleUser(item)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
                backgroundColor: pressed ? colors.surface : 'transparent',
              })}>
              <Avatar name={display} uri={item.avatar_path} size={46} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
                  {display}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  @{item.username}
                </AppText>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: checked ? colors.primary : 'transparent',
                  borderWidth: 2,
                  borderColor: checked ? colors.primary : colors.border,
                }}>
                {checked ? <Icon name="checkmark" size={15} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          debounced.trim().length < 2 ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
              <AppText color={colors.textMuted}>
                Escribe al menos 2 letras para buscar personas y añadirlas al grupo.
              </AppText>
            </View>
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

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
        }}>
        <Button
          title={
            selectedUsers.length > 0
              ? `Crear grupo (${selectedUsers.length + 1})`
              : 'Crear grupo'
          }
          size="lg"
          onPress={handleCreate}
          loading={createGroup.isPending}
          disabled={createGroup.isPending || !name.trim() || selectedUsers.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}
