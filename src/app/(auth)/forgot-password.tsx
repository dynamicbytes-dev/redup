import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth/auth-shell';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { requestPasswordReset } from '@/features/auth/api';
import { getSupabaseUrl } from '@/lib/env';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(identifier);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos enviar el correo.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Revisa tu correo"
        subtitle="Te enviamos un enlace para crear una contraseña nueva."
        footer={
          <Button title="Volver a entrar" variant="secondary" onPress={() => router.replace('/login')} />
        }>
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
            El enlace caduca en una hora. Si no lo ves, mira en spam. Abre el correo en este mismo
            dispositivo para que la app pueda continuar.
          </AppText>
        </View>

        {__DEV__ ? (
          <Button
            title="Abrir bandeja local (dev)"
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
      title="Recuperar cuenta"
      subtitle="Escribe tu usuario o correo y te mandamos el enlace.">
      <ErrorBanner message={error} />

      <TextField
        label="Usuario o correo"
        icon="at-outline"
        placeholder="ana o ana@redup.app"
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
        onSubmitEditing={onSubmit}
      />

      <Button
        title="Enviar enlace"
        size="lg"
        icon="paper-plane-outline"
        onPress={onSubmit}
        loading={busy}
        disabled={busy}
      />
    </AuthShell>
  );
}
