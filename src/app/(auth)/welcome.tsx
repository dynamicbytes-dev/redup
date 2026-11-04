import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo, Wordmark } from '@/components/brand/logo';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 20 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <Logo size={92} />
          <Wordmark size={40} color={colors.text} />
          <AppText
            align="center"
            color={colors.textMuted}
            style={{ maxWidth: 290, fontSize: 16, lineHeight: 23, marginTop: 4 }}>
            Conversaciones con tu gente. Rápidas, privadas y sin ruido.
          </AppText>
        </View>

        <View style={{ gap: 12 }}>
          <Button
            title="Crear cuenta"
            size="lg"
            icon="sparkles-outline"
            onPress={() => router.push('/signup')}
          />
          <Button
            title="Ya tengo cuenta"
            size="lg"
            variant="secondary"
            icon="log-in-outline"
            onPress={() => router.push('/login')}
          />
          <AppText variant="micro" color={colors.textFaint} align="center" style={{ marginTop: 10 }}>
            Tu cuenta se crea con correo y contraseña.
          </AppText>
        </View>
      </View>
    </SafeAreaView>
  );
}
