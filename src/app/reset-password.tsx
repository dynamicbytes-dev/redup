import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { TextField } from '@/components/ui/text-field';
import {
  updatePassword,
  validatePassword,
  verifyPasswordResetOtp,
} from '@/features/auth/api';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Status = 'exchanging' | 'ready' | 'manual_otp' | 'error' | 'done';

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

  // Estados para validación manual de OTP
  const [manualEmail, setManualEmail] = useState('');
  const [manualOtp, setManualOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      try {
        if (params.error) {
          throw new Error(params.error_description ?? 'El enlace ya no es válido.');
        }

        // 1. Si ya existe una sesión activa (ej. acaba de verificar el OTP en pantalla anterior o token previo)
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          if (!cancelled) setStatus('ready');
          return;
        }

        // 2. Si viene el code de PKCE
        if (params.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw exchangeError;
          if (!cancelled) setStatus('ready');
          return;
        }

        // 3. Si viene el token_hash
        if (params.token_hash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: 'recovery',
          });
          if (otpError) throw otpError;
          if (!cancelled) setStatus('ready');
          return;
        }

        // 4. Si viene por query params access_token y refresh_token
        if (params.access_token && params.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (sessionError) throw sessionError;
          if (!cancelled) setStatus('ready');
          return;
        }

        // 5. Revisar si la URL inicial trae fragmentos hash (#access_token=...&refresh_token=...)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('#')) {
          const hashPart = initialUrl.split('#')[1];
          const hashParams = new URLSearchParams(hashPart);
          const at = hashParams.get('access_token');
          const rt = hashParams.get('refresh_token');
          if (at && rt) {
            const { error: hashSessionErr } = await supabase.auth.setSession({
              access_token: at,
              refresh_token: rt,
            });
            if (!hashSessionErr) {
              if (!cancelled) setStatus('ready');
              return;
            }
          }
        }

        // Si no hay sesión ni params válidos, ofrecer ingreso manual de OTP
        if (!cancelled) {
          setStatus('manual_otp');
        }
      } catch (e) {
        if (cancelled) return;
        // Si falló el canje pero ya hay una sesión establecida, permitir continuar
        const { data: checkData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (checkData?.session) {
          setStatus('ready');
          return;
        }
        setStatus('manual_otp');
        setError(
          e instanceof Error
            ? e.message
            : 'El enlace expiró o ya fue usado. Puedes ingresar tu código abajo.',
        );
      }
    }

    exchange();

    // Listener para URLs entrantes mientras la app está abierta
    const urlSub = Linking.addEventListener('url', async ({ url }) => {
      if (url.includes('reset-password') && url.includes('#')) {
        const hashPart = url.split('#')[1];
        const hashParams = new URLSearchParams(hashPart);
        const at = hashParams.get('access_token');
        const rt = hashParams.get('refresh_token');
        if (at && rt) {
          const { error: linkErr } = await supabase.auth.setSession({
            access_token: at,
            refresh_token: rt,
          });
          if (!linkErr) {
            setStatus('ready');
          }
        }
      }
    });

    return () => {
      cancelled = true;
      urlSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onVerifyManualOtp() {
    if (!manualEmail.trim() || manualOtp.trim().length < 6) {
      setError('Escribe tu correo y el código de 6 dígitos.');
      return;
    }

    setVerifyingOtp(true);
    setError(null);
    try {
      await verifyPasswordResetOtp(manualEmail, manualOtp);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El código no es válido o ya caducó.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function onSubmitNewPassword() {
    const problem = validatePassword(password, true);
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
        <AppText color={colors.textMuted}>Comprobando credenciales seguras…</AppText>
      </AuthShell>
    );
  }

  if (status === 'manual_otp') {
    return (
      <AuthShell
        title="Ingresar código"
        subtitle="Escribe el correo electrónico con el que te registraste y el código de 6 dígitos recibido."
        footer={
          <Button
            title="Pedir un nuevo enlace"
            variant="secondary"
            onPress={() => router.replace('/forgot-password')}
          />
        }>
        <ErrorBanner message={error} />

        <TextField
          label="Correo electrónico registrado"
          icon="mail-outline"
          placeholder="tu-correo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={manualEmail}
          onChangeText={setManualEmail}
        />

        <TextField
          label="Código de 6 dígitos"
          icon="key-outline"
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          value={manualOtp}
          onChangeText={setManualOtp}
          onSubmitEditing={onVerifyManualOtp}
        />

        <Button
          title="Verificar y continuar"
          size="lg"
          icon="checkmark-circle-outline"
          onPress={onVerifyManualOtp}
          loading={verifyingOtp}
          disabled={verifyingOtp || manualOtp.trim().length < 6}
        />
      </AuthShell>
    );
  }

  if (status === 'error') {
    return (
      <AuthShell
        title="Enlace no válido"
        subtitle="Por seguridad, los enlaces de recuperación caducan tras un tiempo."
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
        subtitle="Tu nueva contraseña se guardó con éxito."
        showBack={false}
        footer={
          <Button
            title="Ir a mis chats"
            size="lg"
            onPress={() => router.replace('/chats')}
          />
        }>
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <AppText color={colors.textMuted}>
            Tu sesión ha quedado autenticada de forma segura en este dispositivo.
          </AppText>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      subtitle="Elige tu nueva contraseña segura."
      showBack={false}>
      <ErrorBanner message={error} />

      <TextField
        label="Contraseña nueva"
        icon="lock-closed-outline"
        placeholder="Mínimo 8 caracteres con letras y números"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TextField
        label="Repite la contraseña"
        icon="lock-closed-outline"
        placeholder="Escribe la misma contraseña"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={onSubmitNewPassword}
      />

      <Button
        title="Guardar contraseña"
        size="lg"
        icon="shield-checkmark-outline"
        onPress={onSubmitNewPassword}
        loading={busy}
        disabled={busy}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
        <Pressable onPress={() => router.replace('/login')}>
          <AppText color={colors.textMuted}>Cancelar y volver al inicio</AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
