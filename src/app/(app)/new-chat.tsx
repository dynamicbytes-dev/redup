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
import { useStartDirectChat, useUserSearch } from '@/features/chats/hooks';
import type { UserSearchResult } from '@/lib/types';
import { useTheme } from '@/theme';

export default function NewChatScreen() {
  const { colors } = useTheme();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const start = useStartDirectChat();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 280);
    return () => clearTimeout(timer);
  }, [term]);

  const search = useUserSearch(debounced);

  function open(user: UserSearchResult) {
    setErrorMessage(null);
    start.mutate(user.id, {
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
          placeholder="Busca por usuario o nombre"
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
        data={search.data ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        ListHeaderComponent={
          debounced.trim().length >= 2 && (search.data?.length ?? 0) > 0 ? (
            <AppText
              variant="micro"
              color={colors.textFaint}
              style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 }}>
              {search.data?.length} resultado{(search.data?.length ?? 0) === 1 ? '' : 's'}
            </AppText>
          ) : undefined
        }
        renderItem={({ item }) => {
          const busy = start.isPending && start.variables === item.id;
          return (
            <Pressable
              onPress={() => open(item)}
              disabled={start.isPending}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
                backgroundColor: pressed ? colors.surface : 'transparent',
              })}>
              <Avatar name={item.display_name} uri={item.avatar_path} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontSize: 16 }}>
                  {item.display_name}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  @{item.username}
                  {item.about ? ` · ${item.about}` : ''}
                </AppText>
              </View>
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Icon name="chatbubble-outline" size={20} color={colors.primary} />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          debounced.trim().length < 2 ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <AppText color={colors.textMuted}>
                Escribe al menos 2 letras para buscar personas por su nombre o @usuario.
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
    </SafeAreaView>
  );
}
