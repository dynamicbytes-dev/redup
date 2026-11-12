import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { Wordmark } from '@/components/brand/logo';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { ListItem } from '@/components/ui/list-item';
import { Screen } from '@/components/ui/screen';
import { deleteAccount, signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { useConversations } from '@/features/chats/hooks';
import { usePushSettings } from '@/features/notifications/use-notifications';
import { useTheme, type ThemeMode } from '@/theme';

const MODES: { key: ThemeMode; label: string; icon: 'moon' | 'sunny' | 'phone-portrait' }[] = [
  { key: 'dark', label: 'Oscuro', icon: 'moon' },
  { key: 'light', label: 'Claro', icon: 'sunny' },
  { key: 'system', label: 'Sistema', icon: 'phone-portrait' },
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { profile, userId } = useSession();
  const { data: conversations = [] } = useConversations();
  const push = usePushSettings();

  function confirmSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de Akatsuki Chat?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      '¿Eliminar tu cuenta definitivamente?',
      'Esta acción es IRREVERSIBLE. Se borrarán de inmediato todos tus mensajes, contactos, fotos y perfil de acuerdo con la política de privacidad.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmación requerida',
              '¿Confirmas la eliminación permanente de tu cuenta y todos sus datos asociados?',
              [
                { text: 'Volver', style: 'cancel' },
                {
                  text: 'Eliminar mi cuenta ahora',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Error al eliminar cuenta.';
                      Alert.alert('Error', msg);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleTestNotification() {
    const firstConvId = conversations[0]?.id ?? null;
    const ok = await push.sendTestNotification(firstConvId);
    if (!ok) {
      Alert.alert(
        'Permiso denegado',
        'Activa los permisos de notificaciones de Redup en los ajustes del sistema.',
      );
    }
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
          <Wordmark size={27} color={colors.text} />
        </View>

        <Pressable
          onPress={() => router.push('/profile')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            marginHorizontal: 16,
            padding: 16,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Avatar name={profile?.display_name} uri={profile?.avatar_path} size={62} />
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle" style={{ fontSize: 19 }} numberOfLines={1}>
              {profile?.display_name ?? 'Tu perfil'}
            </AppText>
            <AppText color={colors.textMuted}>@{profile?.username ?? '…'}</AppText>
            {profile?.about ? (
              <AppText variant="caption" color={colors.textFaint} numberOfLines={1}>
                {profile.about}
              </AppText>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>

        <Section title="Apariencia">
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginHorizontal: 16,
              marginBottom: 4,
            }}>
            {MODES.map((option) => {
              const active = mode === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setMode(option.key)}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 14,
                    backgroundColor: active ? colors.primarySoft : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}>
                  <Icon
                    name={option.icon}
                    size={15}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <AppText
                    variant="caption"
                    color={active ? colors.primary : colors.textMuted}
                    style={{ fontWeight: active ? '700' : '500' }}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Notificaciones">
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <ListItem
              icon="notifications-outline"
              title="Notificaciones push"
              subtitle={
                !push.permissionGranted
                  ? 'Permiso desactivado en el dispositivo'
                  : push.enabled
                    ? push.token
                      ? 'Activas en este dispositivo'
                      : 'Activando registro…'
                    : 'Pausadas en este dispositivo'
              }
              right={
                <Switch
                  value={push.enabled && push.permissionGranted}
                  disabled={push.busy}
                  onValueChange={(val) => push.togglePush(val)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            <ListItem
              icon="paper-plane-outline"
              title="Enviar notificación de prueba"
              subtitle="Verifica alertas y navegación al tocar"
              onPress={handleTestNotification}
              last
            />
          </View>
        </Section>

        <Section title="Cuenta">
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <ListItem
              icon="person-outline"
              title="Editar perfil"
              subtitle="Nombre, usuario y foto"
              onPress={() => router.push('/profile')}
            />
            <ListItem
              icon="lock-closed-outline"
              title="Privacidad y bloqueos"
              subtitle="En línea, confirmaciones de lectura y bloqueados"
              onPress={() => router.push('/privacy')}
            />
            <ListItem
              icon="at-outline"
              title="Tu identificador"
              subtitle={`@${profile?.username ?? ''}`}
              value={userId ? `${userId.slice(0, 8)}…` : ''}
            />
            <ListItem
              icon="trash-outline"
              title="Eliminar mi cuenta"
              subtitle="Borrar definitivamente tus datos personales"
              destructive
              onPress={confirmDeleteAccount}
              last
            />
          </View>
        </Section>

        <Section title="Legal y Comunidad">
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <ListItem
              icon="document-text-outline"
              title="Términos y Privacidad"
              subtitle="Política de privacidad y condiciones de uso"
              onPress={() => router.push('/legal')}
            />
            <ListItem
              icon="shield-checkmark-outline"
              title="Normas de la Comunidad (UGC)"
              subtitle="Tolerancia cero a contenido abusivo y moderación"
              onPress={() => router.push('/legal')}
            />
            <ListItem
              icon="mail-outline"
              title="Soporte y contacto"
              subtitle="soporte@redup.app"
              onPress={() => {
                Alert.alert(
                  'Contacto de Soporte',
                  'Para asistencia técnica, consultas de privacidad o reportes urgentes de moderación, escríbenos a soporte@redup.app',
                  [{ text: 'Entendido' }],
                );
              }}
              last
            />
          </View>
        </Section>

        <Section title="Sesión">
          <View
            style={{
              marginHorizontal: 16,
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}>
            <ListItem
              icon="log-out-outline"
              title="Cerrar sesión"
              destructive
              onPress={confirmSignOut}
              last
            />
          </View>
        </Section>

        <View style={{ alignItems: 'center', marginTop: 26, gap: 4 }}>
          <AppText variant="micro" color={colors.textFaint}>
            Akatsuki Chat 1.0.0
          </AppText>
          <AppText variant="micro" color={colors.textFaint}>
            Sharingan & Akatsuki Edition
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 22, gap: 10 }}>
      <AppText
        variant="label"
        color={colors.textFaint}
        style={{ paddingHorizontal: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </AppText>
      {children}
    </View>
  );
}
