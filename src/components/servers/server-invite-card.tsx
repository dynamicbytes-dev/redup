import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { getServerPreviewByCode } from '@/features/servers/api';
import type { ServerPreview } from '@/lib/types';
import { useTheme } from '@/theme';

type Props = {
  inviteCode: string;
  isMine?: boolean;
};

export function ServerInviteCard({ inviteCode, isMine = false }: Props) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<ServerPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setFailed(false);
        const data = await getServerPreviewByCode(inviteCode);
        if (!active) return;
        if (data) {
          setPreview(data);
        } else {
          setFailed(true);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (inviteCode) {
      load();
    }

    return () => {
      active = false;
    };
  }, [inviteCode]);

  function handlePress() {
    // Navegación 100% nativa interna sin abrir navegador externo
    router.push({
      pathname: '/join/[code]',
      params: { code: inviteCode },
    });
  }

  // Estilos adaptados si se muestra en una burbuja propia o de terceros
  const cardBg = isMine ? 'rgba(0,0,0,0.22)' : colors.surfaceAlt;
  const cardBorder = isMine ? 'rgba(255,255,255,0.18)' : colors.border;
  const titleColor = isMine ? '#FFFFFF' : colors.text;
  const subtitleColor = isMine ? 'rgba(255,255,255,0.75)' : colors.textMuted;
  const buttonBg = isMine ? '#FFFFFF' : colors.primary;
  const buttonTextColor = isMine ? colors.primary : '#FFFFFF';

  if (loading) {
    return (
      <View
        style={{
          marginTop: 6,
          padding: 12,
          borderRadius: 14,
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: cardBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minWidth: 220,
        }}>
        <ActivityIndicator size="small" color={isMine ? '#FFFFFF' : colors.primary} />
        <AppText variant="caption" style={{ color: subtitleColor }}>
          Cargando servidor…
        </AppText>
      </View>
    );
  }

  if (failed || !preview) {
    return (
      <View
        style={{
          marginTop: 6,
          padding: 12,
          borderRadius: 14,
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: cardBorder,
          gap: 4,
          minWidth: 220,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="alert-circle-outline" size={16} color={isMine ? '#FFFFFF' : colors.danger} />
          <AppText variant="caption" style={{ color: titleColor, fontWeight: '700' }}>
            Invitación de servidor
          </AppText>
        </View>
        <AppText variant="micro" style={{ color: subtitleColor }}>
          Invitación expirada o no encontrada ({inviteCode})
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        marginTop: 6,
        padding: 12,
        borderRadius: 14,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
        gap: 10,
        minWidth: 240,
        maxWidth: 320,
        opacity: pressed ? 0.9 : 1,
      })}>
      {/* Encabezado de la invitación */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="planet-outline" size={15} color={isMine ? '#FFFFFF' : colors.primary} />
        <AppText
          variant="micro"
          style={{
            color: isMine ? 'rgba(255,255,255,0.85)' : colors.primary,
            fontWeight: '800',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
          Invitación a Servidor
        </AppText>
      </View>

      {/* Info del Servidor */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar
          name={preview.name}
          uri={preview.avatar_path}
          size={44}
        />

        <View style={{ flex: 1 }}>
          <AppText
            variant="bodyStrong"
            numberOfLines={1}
            style={{ color: titleColor, fontSize: 15 }}>
            {preview.name}
          </AppText>
          <AppText
            variant="micro"
            numberOfLines={1}
            style={{ color: subtitleColor, marginTop: 1 }}>
            👥 {preview.member_count} miembro{preview.member_count === 1 ? '' : 's'} · Por {preview.owner_name}
          </AppText>
        </View>
      </View>

      {preview.description ? (
        <AppText
          variant="caption"
          numberOfLines={2}
          style={{ color: subtitleColor, lineHeight: 18 }}>
          {preview.description}
        </AppText>
      ) : null}

      {/* Botón interactivo para unirse o abrir directamente dentro de la app */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: buttonBg,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 10,
          marginTop: 2,
        }}>
        <Icon
          name={preview.already_member ? 'enter-outline' : 'add-circle-outline'}
          size={16}
          color={buttonTextColor}
        />
        <AppText
          style={{
            color: buttonTextColor,
            fontSize: 13.5,
            fontWeight: '700',
          }}>
          {preview.already_member ? 'Abrir servidor' : 'Unirse al servidor'}
        </AppText>
      </View>
    </Pressable>
  );
}

