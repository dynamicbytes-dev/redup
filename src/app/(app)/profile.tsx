import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { validateAboutText, validateDisplayName } from '@/lib/security';
import type { Profile } from '@/lib/types';
import { useKeyboardAutoScroll } from '@/lib/use-keyboard';
import { useTheme } from '@/theme';

type UsernameStatus = 'same' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function ProfileScreen() {
  const { profile } = useSession();

  if (!profile) return <FullScreenLoader />;

  return <ProfileEditor profile={profile} />;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { scrollRef, keyboardHeight, onScroll, onTouchEndCapture } = useKeyboardAutoScroll();
  const { userId, refreshProfile } = useSession();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('same');
  const [about, setAbout] = useState(profile.about ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Verificación en tiempo real de unicidad del nombre de usuario al editar perfil
  useEffect(() => {
    const clean = normalizeUsername(username);
    if (clean === profile.username.toLowerCase()) {
      return;
    }
    if (validateUsername(clean)) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setUsernameStatus('checking');
      try {
        const available = await isUsernameAvailable(clean);
        if (!cancelled) {
          setUsernameStatus(available ? 'ok' : 'taken');
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus('same');
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, profile.username]);

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

    const nameProblem = validateDisplayName(displayName);
    if (nameProblem) return setError(nameProblem);

    const normalized = normalizeUsername(username);
    const problem = validateUsername(normalized);
    if (problem) return setError(problem);

    const aboutProblem = validateAboutText(about);
    if (aboutProblem) return setError(aboutProblem);

    if (usernameStatus === 'taken') {
      return setError(
        'Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.',
      );
    }

    setBusy(true);
    try {
      if (normalized !== profile.username.toLowerCase()) {
        const available = await isUsernameAvailable(normalized);
        if (!available) {
          setUsernameStatus('taken');
          setError(
            'Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.',
          );
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

  const usernameFieldError =
    usernameStatus === 'taken'
      ? 'Ese nombre de usuario ya está en uso. Elige otro.'
      : usernameStatus === 'invalid'
        ? validateUsername(username)
        : null;

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
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onTouchEndCapture={onTouchEndCapture}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + keyboardHeight + 48,
          gap: 18,
        }}
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
          label="Nombre de usuario (único)"
          icon="at-outline"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(value) => {
            const clean = value.toLowerCase().replace(/\s+/g, '');
            setUsername(clean);
            if (clean === profile.username.toLowerCase()) {
              setUsernameStatus('same');
            } else if (validateUsername(clean)) {
              setUsernameStatus('invalid');
            } else {
              setUsernameStatus('checking');
            }
          }}
          maxLength={20}
          error={usernameFieldError}
          right={
            usernameStatus === 'checking' ? (
              <Icon name="ellipsis-horizontal" size={18} color={colors.textFaint} />
            ) : usernameStatus === 'ok' ? (
              <Icon name="checkmark-circle" size={20} color="#2BD67B" />
            ) : usernameStatus === 'taken' ? (
              <Icon name="close-circle" size={20} color={colors.danger} />
            ) : null
          }
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

        <Button
          title="Guardar cambios"
          size="lg"
          onPress={save}
          loading={busy}
          disabled={
            busy ||
            usernameStatus === 'taken' ||
            usernameStatus === 'invalid' ||
            usernameStatus === 'checking'
          }
        />

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
