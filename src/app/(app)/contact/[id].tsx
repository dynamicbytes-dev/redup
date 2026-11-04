import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, FullScreenLoader, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { ListItem } from '@/components/ui/list-item';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import {
  useContactDetail,
  useConversations,
  useMuteConversation,
  useSaveContactAlias,
  useToggleBlockUser,
} from '@/features/chats/hooks';
import { formatMutedUntil, isMutedUntil, mutePresetIso, relativeLastSeen } from '@/lib/format';
import type { ContactDetail } from '@/lib/types';
import { useTheme } from '@/theme';

export default function ContactScreen() {
  const { id, conversationId } = useLocalSearchParams<{ id: string; conversationId?: string }>();
  const otherUserId = String(id ?? '');
  const { userId } = useSession();

  const detailQuery = useContactDetail(userId, otherUserId);

  if (detailQuery.isLoading || !detailQuery.data) {
    return <FullScreenLoader />;
  }

  return (
    <ContactDetailView
      key={`${otherUserId}:${detailQuery.data.alias ?? ''}`}
      detail={detailQuery.data}
      otherUserId={otherUserId}
      conversationId={conversationId ? String(conversationId) : undefined}
    />
  );
}

function ContactDetailView({
  detail,
  otherUserId,
  conversationId,
}: {
  detail: ContactDetail;
  otherUserId: string;
  conversationId?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, privacy, globalOnlineIds } = useSession();

  const conversationsQuery = useConversations();
  const saveAlias = useSaveContactAlias(userId ?? '', otherUserId);
  const toggleBlock = useToggleBlockUser(userId ?? '', otherUserId);
  const muteConversation = useMuteConversation(userId ?? '');

  const [aliasInput, setAliasInput] = useState(detail.alias ?? '');
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { profile, alias, blocked } = detail;

  const matchedConversation = conversationsQuery.data?.find(
    (c) => (conversationId && c.id === conversationId) || c.other_user_id === otherUserId,
  );
  const activeConversationId = conversationId || matchedConversation?.id || null;
  const mutedUntil = matchedConversation?.muted_until ?? null;
  const isMuted = isMutedUntil(mutedUntil);

  const canSeeOnline = privacy.showOnline && profile.show_online !== false;
  const isOnline =
    canSeeOnline &&
    (globalOnlineIds.includes(otherUserId) ||
      (profile.last_seen_at
        ? now - new Date(profile.last_seen_at).getTime() < 70_000
        : false));

  const aliasChanged = aliasInput.trim() !== (alias ?? '');

  function handleSaveAlias() {
    setError(null);
    saveAlias.mutate(aliasInput.trim() || null, {
      onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos guardar el alias.'),
    });
  }

  function handleToggleBlock() {
    setError(null);
    if (blocked) {
      toggleBlock.mutate(false, {
        onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos desbloquear.'),
      });
      return;
    }

    Alert.alert(
      `¿Bloquear a ${alias || profile.display_name}?`,
      'Las personas bloqueadas no podrán iniciar nuevas conversaciones contigo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () =>
            toggleBlock.mutate(true, {
              onError: (e) => setError(e instanceof Error ? e.message : 'No pudimos bloquear.'),
            }),
        },
      ],
    );
  }

  const muteOptions: SheetOption[] = [];
  if (activeConversationId) {
    if (isMuted) {
      muteOptions.push({
        label: 'Activar notificaciones',
        icon: 'notifications-outline',
        onPress: () =>
          muteConversation.mutate({
            conversationId: activeConversationId,
            mutedUntil: mutePresetIso('off'),
          }),
      });
    } else {
      muteOptions.push(
        {
          label: 'Silenciar por 8 horas',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({
              conversationId: activeConversationId,
              mutedUntil: mutePresetIso('8h'),
            }),
        },
        {
          label: 'Silenciar por 1 semana',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({
              conversationId: activeConversationId,
              mutedUntil: mutePresetIso('1w'),
            }),
        },
        {
          label: 'Silenciar siempre',
          icon: 'notifications-off-outline',
          onPress: () =>
            muteConversation.mutate({
              conversationId: activeConversationId,
              mutedUntil: mutePresetIso('forever'),
            }),
        },
      );
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingBottom: 8,
        }}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ padding: 6 }}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <AppText variant="subtitle" style={{ fontSize: 19 }}>
          Info. del contacto
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 20 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Avatar
            name={alias || profile.display_name}
            uri={profile.avatar_path}
            size={104}
            online={isOnline}
          />
          <AppText variant="title" style={{ marginTop: 6, fontSize: 22 }} align="center">
            {alias || profile.display_name}
          </AppText>
          {alias ? (
            <AppText variant="caption" color={colors.textMuted}>
              Nombre público: {profile.display_name}
            </AppText>
          ) : null}
          <AppText color={colors.textMuted}>@{profile.username}</AppText>
          {canSeeOnline ? (
            <AppText variant="micro" color={isOnline ? colors.primary : colors.textFaint}>
              {isOnline ? 'en línea' : relativeLastSeen(profile.last_seen_at)}
            </AppText>
          ) : null}
        </View>

        <ErrorBanner message={error} />

        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            gap: 6,
          }}>
          <AppText variant="label" color={colors.textFaint} style={{ textTransform: 'uppercase' }}>
            Estado
          </AppText>
          <AppText style={{ fontSize: 15.5 }}>
            {profile.about?.trim() || '¡Hola! Estoy usando Redup.'}
          </AppText>
        </View>

        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            gap: 12,
          }}>
          <TextField
            label="Alias en tus contactos"
            icon="bookmark-outline"
            placeholder={profile.display_name}
            value={aliasInput}
            onChangeText={setAliasInput}
            maxLength={60}
          />
          <AppText variant="micro" color={colors.textFaint}>
            Solo tú ves este nombre en tus conversaciones.
          </AppText>

          {aliasChanged ? (
            <Button
              title={aliasInput.trim() ? 'Guardar alias' : 'Restaurar nombre original'}
              size="md"
              onPress={handleSaveAlias}
              loading={saveAlias.isPending}
              disabled={saveAlias.isPending}
            />
          ) : null}
        </View>

        {activeConversationId ? (
          <View
            style={{
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <ListItem
              icon={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
              title="Notificaciones"
              subtitle={formatMutedUntil(mutedUntil)}
              onPress={() => setMuteSheetOpen(true)}
              last
            />
          </View>
        ) : null}

        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}>
          <ListItem
            icon={blocked ? 'lock-open-outline' : 'ban-outline'}
            title={blocked ? `Desbloquear a @${profile.username}` : `Bloquear a @${profile.username}`}
            subtitle={
              blocked
                ? 'Actualmente tienes bloqueado a este usuario'
                : 'Impedir que te abra nuevas conversaciones'
            }
            destructive={!blocked}
            onPress={handleToggleBlock}
            last
          />
        </View>
      </ScrollView>

      <ActionSheet
        visible={muteSheetOpen}
        onClose={() => setMuteSheetOpen(false)}
        title="Notificaciones del chat"
        options={muteOptions}
      />
    </SafeAreaView>
  );
}
