import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import { setBlockedUser } from '@/features/chats/api';
import { useBlockedUsers, useContactsMap } from '@/features/chats/hooks';
import { queryKeys } from '@/lib/query-client';
import type { PrivacySettings } from '@/lib/types';
import { useTheme } from '@/theme';

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId, privacy, updatePrivacy } = useSession();

  const blockedQuery = useBlockedUsers(userId);
  const contactsMapQuery = useContactsMap(userId);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blockedUsers = blockedQuery.data ?? [];
  const contactsMap = contactsMapQuery.data ?? {};

  async function handlePrivacyChange(patch: Partial<PrivacySettings>) {
    setError(null);
    try {
      await updatePrivacy(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar tus ajustes.');
    }
  }

  async function handleUnblock(blockedId: string) {
    if (!userId) return;
    setError(null);
    setUnblockingId(blockedId);
    try {
      await setBlockedUser(userId, blockedId, false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.blocks });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contact(blockedId) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos desbloquear al usuario.');
    } finally {
      setUnblockingId(null);
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
          Privacidad y bloqueos
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 22 }}>
        <ErrorBanner message={error} />

        <View style={{ gap: 8 }}>
          <AppText
            variant="label"
            color={colors.textFaint}
            style={{ paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Visibilidad y actividad
          </AppText>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="pulse-outline" size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">En línea y última conexión</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {privacy.showOnline ? 'Visible para tus contactos' : 'Oculto para todos'}
                </AppText>
              </View>
              <Switch
                value={privacy.showOnline}
                onValueChange={(value) => {
                  Haptics.selectionAsync().catch(() => {});
                  handlePrivacyChange({ showOnline: value });
                }}
                trackColor={{ false: colors.surfaceStrong, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="checkmark-done-outline" size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">Confirmaciones de lectura</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {privacy.readReceipts ? 'Doble check leído activado' : 'Doble check desactivado'}
                </AppText>
              </View>
              <Switch
                value={privacy.readReceipts}
                onValueChange={(value) => {
                  Haptics.selectionAsync().catch(() => {});
                  handlePrivacyChange({ readReceipts: value });
                }}
                trackColor={{ false: colors.surfaceStrong, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <AppText variant="micro" color={colors.textFaint} style={{ paddingHorizontal: 4 }}>
            Si desactivas tu estado en línea o las confirmaciones de lectura, tampoco podrás ver los
            de las demás personas. En los grupos se muestran solo si cada persona las comparte.
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          <AppText
            variant="label"
            color={colors.textFaint}
            style={{ paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Usuarios bloqueados ({blockedUsers.length})
          </AppText>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            {blockedQuery.isLoading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : blockedUsers.length === 0 ? (
              <View style={{ padding: 18, gap: 4 }}>
                <AppText variant="bodyStrong">Sin usuarios bloqueados</AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  Puedes bloquear a cualquier persona desde la ficha de información de su contacto.
                </AppText>
              </View>
            ) : (
              blockedUsers.map((item, idx) => {
                const p = item.profile;
                const displayName =
                  contactsMap[item.blocked_id] || p?.display_name || 'Usuario bloqueado';
                const username = p?.username ?? 'usuario';
                const last = idx === blockedUsers.length - 1;
                const busy = unblockingId === item.blocked_id;

                return (
                  <View
                    key={item.blocked_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: last ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/contact/[id]',
                          params: { id: item.blocked_id },
                        })
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        flex: 1,
                      }}>
                      <Avatar name={displayName} uri={p?.avatar_path} size={44} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {displayName}
                        </AppText>
                        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                          @{username}
                        </AppText>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => handleUnblock(item.blocked_id)}
                      disabled={busy}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: pressed ? colors.surfaceAlt : colors.primarySoft,
                      })}>
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <AppText
                          variant="caption"
                          color={colors.primary}
                          style={{ fontWeight: '700' }}>
                          Desbloquear
                        </AppText>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

