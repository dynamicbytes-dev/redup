import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import { updatePassword, validatePassword } from '@/features/auth/api';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Status = 'exchanging' | 'ready' | 'error' | 'done';

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    code?: string;
    token_hash?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  }>();

  const [status, setStatus] = useState<Status>('exchanging');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      try {
        if (params.error) {
          throw new Error(params.error_description ?? 'El enlace ya no es válido.');
        }

        if (params.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw exchangeError;
        } else if (params.token_hash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: 'recovery',
          });
          if (otpError) throw otpError;
        } else if (params.access_token && params.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (sessionError) throw sessionError;
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error('missing');
        }

        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(
          e instanceof Error && e.message !== 'missing'
            ? 'El enlace expiró o ya se usó. Pide uno nuevo.'
            : 'Abre el enlace desde el mismo dispositivo donde pediste el cambio.',
        );
      }
    }

    exchange();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    const problem = validatePassword(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('Las contraseñas no coinciden.');

    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'exchanging') {
    return (
      <AuthShell title="Verificando enlace" showBack={false}>
        <AppText color={colors.textMuted}>Un momento…</AppText>
      </AuthShell>
    );
  }

  if (status === 'error') {
    return (
      <AuthShell
        title="Enlace no válido"
        subtitle="Por seguridad, los enlaces de recuperación caducan."
        footer={
          <Button
            title="Pedir otro enlace"
            variant="secondary"
            onPress={() => router.replace('/forgot-password')}
          />
        }>
        <ErrorBanner message={error} />
      </AuthShell>
    );
  }

  if (status === 'done') {
    return (
      <AuthShell
        title="Contraseña actualizada"
        subtitle="Ya puedes usar tu nueva contraseña."
        showBack={false}
        footer={<Button title="Ir a mis chats" size="lg" onPress={() => router.replace('/chats')} />}>
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <AppText color={colors.textMuted}>
            Tu sesión quedó iniciada en este dispositivo.
          </AppText>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nueva contraseña" subtitle="Elige algo que recuerdes." showBack={false}>
      <ErrorBanner message={error} />

      <TextField
        label="Contraseña nueva"
        icon="lock-closed-outline"
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TextField
        label="Repite la contraseña"
        icon="lock-closed-outline"
        placeholder="Otra vez"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={onSubmit}
      />

      <Button
        title="Guardar contraseña"
        size="lg"
        onPress={onSubmit}
        loading={busy}
        disabled={busy}
      />
    </AuthShell>
  );
}
