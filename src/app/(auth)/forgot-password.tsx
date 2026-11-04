import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { requestPasswordReset, verifyPasswordResetOtp } from '@/features/auth/api';
import { getSupabaseUrl } from '@/lib/env';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  async function onRequestReset() {
    setBusy(true);
    setError(null);
    try {
      const targetEmail = await requestPasswordReset(email);
      setEmailSentTo(targetEmail);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el correo.');
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyOtp() {
    if (!emailSentTo) return;
    if (otpCode.trim().length < 6) {
      setError('Escribe el código completo de 6 dígitos que te llegó al correo.');
      return;
    }

    setVerifyingOtp(true);
    setError(null);
    try {
      await verifyPasswordResetOtp(emailSentTo, otpCode);
      router.replace('/reset-password');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'El código no es válido o ya caducó.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Código enviado"
        subtitle={`Enviamos el código de verificación a ${emailSentTo ?? 'tu correo'}.`}
        footer={
          <Button
            title="Volver a entrar"
            variant="secondary"
            onPress={() => router.replace('/login')}
          />
        }>
        <ErrorBanner message={error} />

        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            padding: 16,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <Icon name="mail-open-outline" size={22} color={colors.primary} />
          <AppText style={{ flex: 1, color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            Revisa la bandeja de entrada del correo con el que te registraste (y la carpeta de spam).
            Ingresa el código de 6 dígitos aquí abajo para crear tu nueva contraseña.
          </AppText>
        </View>

        <TextField
          label="Código de 6 dígitos del correo"
          icon="key-outline"
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          value={otpCode}
          onChangeText={setOtpCode}
          onSubmitEditing={onVerifyOtp}
        />

        <Button
          title="Verificar código"
          size="lg"
          icon="checkmark-circle-outline"
          onPress={onVerifyOtp}
          loading={verifyingOtp}
          disabled={verifyingOtp || otpCode.trim().length < 6}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
          <Pressable onPress={onRequestReset} disabled={busy}>
            <AppText variant="bodyStrong" color={colors.primary}>
              {busy ? 'Reenviando…' : '¿No recibiste el código? Reenviar'}
            </AppText>
          </Pressable>
        </View>

        {__DEV__ ? (
          <Button
            title="Abrir bandeja local (Inbucket)"
            variant="ghost"
            icon="flask-outline"
            onPress={() =>
              Linking.openURL(getSupabaseUrl().replace(':54321', ':54324'))
            }
          />
        ) : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Escribe el correo electrónico con el que te registraste. Te enviaremos el código para verificar el cambio de contraseña.">
      <ErrorBanner message={error} />

      <TextField
        label="Correo electrónico registrado"
        icon="mail-outline"
        placeholder="ejemplo@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={onRequestReset}
      />

      <Button
        title="Enviar código al correo"
        size="lg"
        icon="paper-plane-outline"
        onPress={onRequestReset}
        loading={busy}
        disabled={busy}
      />
    </AuthShell>
  );
}
