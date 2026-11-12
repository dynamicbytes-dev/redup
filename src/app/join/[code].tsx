import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import { getServerPreviewByCode, joinServerByCode } from '@/features/servers/api';
import type { ServerPreview } from '@/lib/types';
import { useTheme } from '@/theme';

export default function JoinServerScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = String(code ?? '');

  const { colors } = useTheme();
  const { session, loading: sessionLoading } = useSession();

  const [preview, setPreview] = useState<ServerPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!inviteCode) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getServerPreviewByCode(inviteCode);
        if (!active) return;
        if (!data) {
          setError('El enlace de invitación no es válido o ha expirado.');
        } else {
          setPreview(data);
        }
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Error al cargar la invitación.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [inviteCode]);

  async function handleAccept() {
    if (!session) {
      // Si no ha iniciado sesión, redirigir a login
      Alert.alert(
        'Inicia sesión',
        'Debes iniciar sesión en Redup para unirte a este servidor.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Iniciar sesión', onPress: () => router.push('/login') },
        ],
      );
      return;
    }

    setJoining(true);
    try {
      const res = await joinServerByCode(inviteCode);
      if (res.channel_id) {
        router.replace({
          pathname: '/server/[id]/channel/[channelId]',
          params: { id: res.server_id, channelId: res.channel_id },
        });
      } else {
        router.replace('/(app)/(tabs)/servers');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No pudimos unirte al servidor.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}>
        <Pressable
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}>
          <Icon name="close" size={24} color={colors.text} />
        </Pressable>

        <AppText variant="title" style={{ fontSize: 16 }}>
          Invitación a Servidor
        </AppText>

        <View style={{ width: 24 }} />
      </View>

      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 28,
          gap: 18,
        }}>
        {loading || sessionLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : error ? (
          <View style={{ width: '100%', gap: 14, alignItems: 'center' }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="alert-circle-outline" size={38} color={colors.textMuted} />
            </View>

            <ErrorBanner message={error} />

            <Button
              title="Volver"
              variant="secondary"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}
              style={{ width: '100%', marginTop: 8 }}
            />
          </View>
        ) : preview ? (
          <View
            style={{
              width: '100%',
              backgroundColor: colors.surfaceAlt,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 24,
              alignItems: 'center',
              gap: 14,
            }}>
            <Avatar name={preview.name} uri={preview.avatar_path} size={84} />

            <View style={{ alignItems: 'center', gap: 4 }}>
              <AppText variant="caption" color={colors.textMuted} align="center">
                Te han invitado a unirte a
              </AppText>
              <AppText variant="title" align="center" style={{ fontSize: 22 }}>
                {preview.name}
              </AppText>
              <AppText variant="caption" color={colors.textMuted} align="center">
                Creado por {preview.owner_name} · {preview.member_count} miembro
                {preview.member_count === 1 ? '' : 's'}
              </AppText>
            </View>

            {preview.description ? (
              <AppText
                variant="body"
                color={colors.text}
                align="center"
                style={{ lineHeight: 22, marginTop: 4 }}>
                {preview.description}
              </AppText>
            ) : null}

            <View style={{ width: '100%', gap: 10, marginTop: 12 }}>
              <Button
                title={preview.already_member ? 'Ya eres miembro (Abrir servidor)' : 'Aceptar invitación'}
                size="lg"
                icon="checkmark-circle-outline"
                loading={joining}
                onPress={handleAccept}
              />

              <Button
                title="No gracias"
                variant="secondary"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/chats'))}
              />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
