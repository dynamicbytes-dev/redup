import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { signInWithIdentifier } from '@/features/auth/api';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signInWithIdentifier(identifier, password);
      // El navegador raíz cambia solo al detectar la sesión
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Hola de nuevo" subtitle="Entra con tu usuario o tu correo.">
      <ErrorBanner message={error} />

      <TextField
        label="Usuario o correo"
        icon="person-outline"
        placeholder="ana o ana@redup.app"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={identifier}
        onChangeText={setIdentifier}
        returnKeyType="next"
      />

      <TextField
        label="Contraseña"
        icon="lock-closed-outline"
        placeholder="Tu contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <Pressable onPress={() => router.push('/forgot-password')} style={{ alignSelf: 'flex-end' }}>
        <AppText variant="bodyStrong" color={colors.primary}>
          ¿Olvidaste tu contraseña?
        </AppText>
      </Pressable>

      <Button title="Entrar" size="lg" onPress={onSubmit} loading={busy} disabled={busy} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
        <AppText color={colors.textMuted}>¿No tienes cuenta?</AppText>
        <Pressable onPress={() => router.replace('/signup')}>
          <AppText variant="bodyStrong" color={colors.primary}>
            Crear una
          </AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
