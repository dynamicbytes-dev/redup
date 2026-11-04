import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, FullScreenLoader, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { ListItem } from '@/components/ui/list-item';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/features/auth/session';
import {
  useAddGroupMembers,
  useChangeGroupAvatar,
  useContactsMap,
  useConversations,
  useLeaveGroup,
  useMembers,
  useMuteConversation,
  useRemoveGroupMember,
  useUpdateGroupDetails,
  useUpdateGroupMemberRole,
  useUserSearch,
} from '@/features/chats/hooks';
import { pickAvatarImage } from '@/features/profile/api';
import { formatMutedUntil, isMutedUntil, mutePresetIso } from '@/lib/format';
import type { ConversationMember, ConversationOverview, UserSearchResult } from '@/lib/types';
import { useTheme } from '@/theme';

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id ?? '');

  const conversationsQuery = useConversations();
  const membersQuery = useMembers(conversationId);

  const conversation = conversationsQuery.data?.find((c) => c.id === conversationId);
  const members = membersQuery.data;

  if (membersQuery.isLoading || !members) {
    return <FullScreenLoader />;
  }

  return (
    <GroupInfoEditor
      key={`${conversationId}:${conversation?.name ?? ''}`}
      conversationId={conversationId}
      conversation={conversation}
      members={members}
    />
  );
}

function GroupInfoEditor({
  conversationId,
  conversation,
  members,
}: {
  conversationId: string;
  conversation?: ConversationOverview;
  members: ConversationMember[];
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, profile } = useSession();

  const contactsMapQuery = useContactsMap(userId);
  const updateDetails = useUpdateGroupDetails(conversationId, userId ?? '');
  const changeAvatar = useChangeGroupAvatar(conversationId, userId ?? '');
  const addMembers = useAddGroupMembers(conversationId, userId ?? '');
  const updateRole = useUpdateGroupMemberRole(conversationId, userId ?? '');
  const removeMember = useRemoveGroupMember(conversationId, userId ?? '');
  const leaveGroup = useLeaveGroup(conversationId);
  const muteConversation = useMuteConversation(userId ?? '');

  const [groupName, setGroupName] = useState(conversation?.name ?? 'Grupo');
  const [selectedMember, setSelectedMember] = useState<ConversationMember | null>(null);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactsMap = useMemo(() => contactsMapQuery.data ?? {}, [contactsMapQuery.data]);
  const myMember = members.find((m) => m.user_id === userId);
  const isAdmin = myMember?.role === 'admin' || conversation?.my_role === 'admin';
  const mutedUntil = myMember?.muted_until ?? conversation?.muted_until ?? null;
  const isMuted = isMutedUntil(mutedUntil);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      const nameA = a.profile?.display_name ?? '';
      const nameB = b.profile?.display_name ?? '';
      return nameA.localeCompare(nameB);
    });
  }, [members]);

  const nameChanged = groupName.trim() && groupName.trim() !== (conversation?.name ?? '');

  async function handleChangePhoto() {
    if (!isAdmin) return;
    setError(null);
    try {
      const uri = await pickAvatarImage();
      if (!uri) return;
      changeAvatar.mutate(
        { localUri: uri, previousPath: conversation?.avatar_path },
        {
          onError: (e) =>
            setError(e instanceof Error ? e.message : 'No pudimos actualizar la foto del grupo.'),
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos abrir tus fotos.');
    }
  }

  function handleSaveName() {
    const clean = groupName.trim();
    if (!clean) return;
    setError(null);
    updateDetails.mutate(
      {
        name: clean,
        systemText: `Cambió el nombre del grupo a “${clean}”`,
      },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : 'No pudimos renombrar el grupo.'),
      },
    );
  }

  function confirmLeaveGroup() {
    if (!userId) return;
    Alert.alert(
      'Salir del grupo',
      `¿Seguro que quieres salir de “${conversation?.name ?? 'este grupo'}”?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () =>
            leaveGroup.mutate(
              {
                userId,
                displayName: profile?.display_name ?? 'Alguien',
                members,
              },
              {
                onSuccess: () => router.replace('/chats'),
                onError: (e) =>
                  setError(e instanceof Error ? e.message : 'No pudimos salir del grupo.'),
              },
            ),
        },
      ],
    );
  }

  const memberSheetOptions: SheetOption[] = [];
  if (selectedMember && selectedMember.user_id !== userId) {
    const targetId = selectedMember.user_id;
    const targetName =
      contactsMap[targetId] || selectedMember.profile?.display_name || 'Participante';

    memberSheetOptions.push({
      label: 'Ver información del contacto',
      icon: 'person-circle-outline',
      onPress: () => router.push({ pathname: '/contact/[id]', params: { id: targetId } }),
    });

    if (isAdmin) {
      if (selectedMember.role === 'admin') {
        memberSheetOptions.push({
          label: 'Quitar como administrador',
          icon: 'shield-outline',
          onPress: () =>
            updateRole.mutate(
              { targetUserId: targetId, targetName, role: 'member' },
              {
                onError: (e) =>
                  setError(e instanceof Error ? e.message : 'No pudimos cambiar el rol.'),
              },
            ),
        });
      } else {
        memberSheetOptions.push({
          label: 'Hacer administrador del grupo',
          icon: 'shield-checkmark-outline',
          onPress: () =>
            updateRole.mutate(
              { targetUserId: targetId, targetName, role: 'admin' },
              {
                onError: (e) =>
                  setError(e instanceof Error ? e.message : 'No pudimos cambiar el rol.'),
              },
            ),
        });
      }

      memberSheetOptions.push({
        label: `Eliminar a ${targetName} del grupo`,
        icon: 'person-remove-outline',
        destructive: true,
        onPress: () =>
          removeMember.mutate(
            { targetUserId: targetId, targetName },
            {
              onError: (e) =>
                setError(e instanceof Error ? e.message : 'No pudimos eliminar al participante.'),
            },
          ),
      });
    }
  }

  const muteOptions: SheetOption[] = isMuted
    ? [
        {
          label: 'Activar notificaciones',
          icon: 'notifications-outline',
          onPress: () =>
            muteConversation.mutate({ conversationId, mutedUntil: mutePresetIso('off') }),
        },
      ]
    : [
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
      ];

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
          Info. del grupo
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 36, gap: 20 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Pressable onPress={handleChangePhoto} disabled={!isAdmin || changeAvatar.isPending}>
            <Avatar
              name={conversation?.name ?? 'Grupo'}
              uri={conversation?.avatar_path}
              size={104}
            />
            {isAdmin ? (
              <View
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: colors.bg,
                }}>
                {changeAvatar.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Icon name="camera" size={16} color="#FFFFFF" />
                )}
              </View>
            ) : null}
          </Pressable>

          <AppText variant="title" style={{ marginTop: 4, fontSize: 22 }} align="center">
            {conversation?.name ?? 'Grupo'}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Grupo · {members.length} participante{members.length === 1 ? '' : 's'}
          </AppText>
        </View>

        <ErrorBanner message={error} />

        {isAdmin ? (
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
              label="Nombre del grupo"
              icon="people-outline"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={60}
            />
            {nameChanged ? (
              <Button
                title="Guardar nombre"
                size="md"
                onPress={handleSaveName}
                loading={updateDetails.isPending}
                disabled={updateDetails.isPending}
              />
            ) : null}
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
            icon={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
            title="Notificaciones"
            subtitle={formatMutedUntil(mutedUntil)}
            onPress={() => setMuteSheetOpen(true)}
            last
          />
        </View>

        <View style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 4,
            }}>
            <AppText
              variant="label"
              color={colors.textFaint}
              style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {members.length} participante{members.length === 1 ? '' : 's'}
            </AppText>

            {isAdmin ? (
              <Pressable
                onPress={() => setAddModalOpen(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="person-add-outline" size={16} color={colors.primary} />
                <AppText variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
                  Añadir
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            {sortedMembers.map((member, index) => {
              const isMe = member.user_id === userId;
              const alias = contactsMap[member.user_id];
              const displayName = isMe
                ? `${member.profile?.display_name ?? 'Tú'} (Tú)`
                : (alias || member.profile?.display_name || 'Usuario');
              const username = member.profile?.username ?? 'usuario';
              const last = index === sortedMembers.length - 1;

              return (
                <Pressable
                  key={member.user_id}
                  disabled={isMe}
                  onPress={() => {
                    if (isAdmin) {
                      setSelectedMember(member);
                    } else {
                      router.push({ pathname: '/contact/[id]', params: { id: member.user_id } });
                    }
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                    borderBottomWidth: last ? 0 : 1,
                    borderBottomColor: colors.border,
                  })}>
                  <Avatar
                    name={member.profile?.display_name ?? displayName}
                    uri={member.profile?.avatar_path}
                    size={44}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {displayName}
                    </AppText>
                    <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                      @{username}
                    </AppText>
                  </View>

                  {member.role === 'admin' ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: colors.primarySoft,
                      }}>
                      <AppText
                        variant="micro"
                        color={colors.primary}
                        style={{ fontWeight: '700' }}>
                        Admin
                      </AppText>
                    </View>
                  ) : null}

                  {!isMe ? (
                    <Icon name="chevron-forward" size={18} color={colors.textFaint} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}>
          <ListItem
            icon="exit-outline"
            title="Salir del grupo"
            destructive
            onPress={confirmLeaveGroup}
            last
          />
        </View>
      </ScrollView>

      <ActionSheet
        visible={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        title={
          selectedMember
            ? (contactsMap[selectedMember.user_id] ||
              selectedMember.profile?.display_name ||
              'Participante')
            : undefined
        }
        options={memberSheetOptions}
      />

      <ActionSheet
        visible={muteSheetOpen}
        onClose={() => setMuteSheetOpen(false)}
        title="Notificaciones del grupo"
        options={muteOptions}
      />

      <AddMembersModal
        visible={addModalOpen}
        existingIds={members.map((m) => m.user_id)}
        contactsMap={contactsMap}
        loading={addMembers.isPending}
        onClose={() => setAddModalOpen(false)}
        onAdd={(users) => {
          addMembers.mutate(users, {
            onSuccess: () => setAddModalOpen(false),
            onError: (e) => {
              setAddModalOpen(false);
              setError(
                e instanceof Error ? e.message : 'No pudimos añadir a los participantes.',
              );
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

function AddMembersModal({
  visible,
  existingIds,
  contactsMap,
  loading,
  onClose,
  onAdd,
}: {
  visible: boolean;
  existingIds: string[];
  contactsMap: Record<string, string>;
  loading: boolean;
  onClose: () => void;
  onAdd: (users: { id: string; displayName: string }[]) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 260);
    return () => clearTimeout(timer);
  }, [term]);

  const search = useUserSearch(debounced);
  const existingSet = useMemo(() => new Set(existingIds), [existingIds]);
  const selectedSet = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const candidates = useMemo(
    () => (search.data ?? []).filter((user) => !existingSet.has(user.id)),
    [search.data, existingSet],
  );

  function toggle(user: UserSearchResult) {
    setSelected((prev) =>
      prev.some((item) => item.id === user.id)
        ? prev.filter((item) => item.id !== user.id)
        : [...prev, user],
    );
  }

  function handleClose() {
    setTerm('');
    setDebounced('');
    setSelected([]);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}>
          <Pressable hitSlop={10} onPress={handleClose} style={{ padding: 4 }}>
            <Icon name="close" size={26} color={colors.text} />
          </Pressable>
          <AppText variant="subtitle" style={{ fontSize: 19 }}>
            Añadir participantes
          </AppText>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <TextField
            icon="search-outline"
            placeholder="Busca por usuario o nombre"
            autoCapitalize="none"
            autoCorrect={false}
            value={term}
            onChangeText={setTerm}
            autoFocus
          />
        </View>

        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
          renderItem={({ item }) => {
            const checked = selectedSet.has(item.id);
            const display = contactsMap[item.id] || item.display_name;
            return (
              <Pressable
                onPress={() => toggle(item)}
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
              <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                <AppText color={colors.textMuted}>
                  Escribe al menos 2 letras para buscar personas que aún no estén en el grupo.
                </AppText>
              </View>
            ) : search.isLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
            ) : (
              <EmptyState
                icon="person-outline"
                title="Sin resultados disponibles"
                description="No encontramos usuarios nuevos con esa búsqueda."
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
              selected.length > 0
                ? `Añadir (${selected.length})`
                : 'Selecciona participantes'
            }
            size="lg"
            loading={loading}
            disabled={loading || selected.length === 0}
            onPress={() =>
              onAdd(
                selected.map((u) => ({
                  id: u.id,
                  displayName: contactsMap[u.id] || u.display_name,
                })),
              )
            }
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
