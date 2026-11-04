import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import {
  isUsernameAvailable,
  normalizeUsername,
  signUp,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/features/auth/api';
import { useTheme } from '@/theme';

type UsernameStatus = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function SignupScreen() {
  const { colors } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkUsername() {
    const value = username.trim();
    const problem = validateUsername(value);
    if (problem) {
      setUsernameStatus(value ? 'invalid' : 'idle');
      return;
    }
    setUsernameStatus('checking');
    try {
      const available = await isUsernameAvailable(value);
      setUsernameStatus(available ? 'ok' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  }

  const usernameError =
    usernameStatus === 'taken'
      ? 'Ese nombre de usuario ya está en uso.'
      : usernameStatus === 'invalid'
        ? validateUsername(username)
        : null;

  async function onSubmit() {
    setError(null);

    const emailProblem = validateEmail(email);
    if (emailProblem) return setError(emailProblem);
    const passwordProblem = validatePassword(password);
    if (passwordProblem) return setError(passwordProblem);
    const usernameProblem = validateUsername(username);
    if (usernameProblem) return setError(usernameProblem);
    if (!displayName.trim()) return setError('Escribe tu nombre.');

    setBusy(true);
    try {
      await signUp({
        email,
        password,
        username: normalizeUsername(username),
        displayName,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Tres datos y ya estás dentro.">
      <ErrorBanner message={error} />

      <TextField
        label="Nombre"
        icon="happy-outline"
        placeholder="Cómo te llaman"
        autoCapitalize="words"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />

      <View style={{ gap: 6 }}>
        <TextField
          label="Nombre de usuario"
          icon="at-outline"
          placeholder="ana_22"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(value) => {
            setUsername(value);
            setUsernameStatus('idle');
          }}
          onBlur={checkUsername}
          maxLength={20}
          error={usernameError}
          right={
            usernameStatus === 'checking' ? (
              <Icon name="ellipsis-horizontal" size={18} color={colors.textFaint} />
            ) : usernameStatus === 'ok' ? (
              <Icon name="checkmark-circle" size={20} color="#2BD67B" />
            ) : null
          }
        />
        <AppText variant="micro" color={usernameStatus === 'ok' ? '#2BD67B' : colors.textFaint}>
          {usernameStatus === 'ok'
            ? 'Disponible. Así te encontrarán tus contactos.'
            : 'Solo minúsculas, números, punto y guion bajo.'}
        </AppText>
      </View>

      <TextField
        label="Correo"
        icon="mail-outline"
        placeholder="tu@correo.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextField
        label="Contraseña"
        icon="lock-closed-outline"
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={onSubmit}
      />

      <Button title="Crear cuenta" size="lg" onPress={onSubmit} loading={busy} disabled={busy} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
        <AppText color={colors.textMuted}>¿Ya tienes cuenta?</AppText>
        <Pressable onPress={() => router.replace('/login')}>
          <AppText variant="bodyStrong" color={colors.primary}>
            Entrar
          </AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
