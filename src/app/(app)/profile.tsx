import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreenLoader } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { isUsernameAvailable, normalizeUsername, validateUsername } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { pickAvatarImage, updateProfile, uploadAvatar } from '@/features/profile/api';
import type { Profile } from '@/lib/types';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const { profile } = useSession();

  if (!profile) return <FullScreenLoader />;

  return <ProfileEditor profile={profile} />;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, refreshProfile } = useSession();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [about, setAbout] = useState(profile.about ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function changeAvatar() {
    if (!userId) return;
    setError(null);
    try {
      const uri = await pickAvatarImage();
      if (!uri) return;
      setUploading(true);
      await uploadAvatar(userId, uri, profile.avatar_path);
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cambiar la foto.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!userId) return;
    setError(null);

    if (!displayName.trim()) return setError('Escribe tu nombre.');

    const normalized = normalizeUsername(username);
    const problem = validateUsername(normalized);
    if (problem) return setError(problem);

    setBusy(true);
    try {
      if (normalized !== profile.username) {
        const available = await isUsernameAvailable(normalized);
        if (!available) {
          setError('Ese nombre de usuario ya está en uso.');
          return;
        }
      }

      await updateProfile(userId, {
        display_name: displayName,
        username: normalized,
        about,
      });
      await refreshProfile();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar los cambios.');
    } finally {
      setBusy(false);
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
          Tu perfil
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 18 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Pressable onPress={changeAvatar} disabled={uploading}>
            <Avatar name={displayName || profile.display_name} uri={profile.avatar_path} size={110} />
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: colors.bg,
              }}>
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Icon name="camera" size={17} color="#FFFFFF" />
              )}
            </View>
          </Pressable>

          <Pressable onPress={changeAvatar} disabled={uploading}>
            <AppText variant="bodyStrong" color={colors.primary}>
              {uploading ? 'Subiendo…' : 'Cambiar foto'}
            </AppText>
          </Pressable>
        </View>

        <ErrorBanner message={error} />

        <TextField
          label="Nombre"
          icon="happy-outline"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={60}
        />

        <TextField
          label="Nombre de usuario"
          icon="at-outline"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          maxLength={20}
        />

        <TextField
          label="Estado"
          icon="chatbubble-ellipses-outline"
          placeholder="Disponible"
          value={about}
          onChangeText={setAbout}
          maxLength={139}
        />

        <AppText variant="micro" color={colors.textFaint}>
          Así te ven los demás: {displayName.trim() || 'Sin nombre'} · @
          {normalizeUsername(username) || 'usuario'}
        </AppText>

        <Button title="Guardar cambios" size="lg" onPress={save} loading={busy} disabled={busy} />

        <Pressable
          onPress={() =>
            Alert.alert(
              'Privacidad',
              'En este prototipo los mensajes se guardan en tu Supabase y no están cifrados de extremo a extremo.',
            )
          }
          style={{ alignItems: 'center', marginTop: 4 }}>
          <AppText variant="caption" color={colors.textMuted}>
            Cómo se guardan tus datos
          </AppText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
