import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showBack?: boolean;
  center?: boolean;
};

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  showBack = true,
  center = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 28,
            justifyContent: center ? 'center' : 'flex-start',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {showBack ? (
            <Pressable
              hitSlop={12}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
              style={{ paddingVertical: 14, alignSelf: 'flex-start' }}>
              <Icon name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          ) : (
            <View style={{ height: 12 }} />
          )}

          {title ? (
            <View style={{ gap: 6, marginBottom: 24, marginTop: 4 }}>
              <AppText variant="display">{title}</AppText>
              {subtitle ? (
                <AppText color={colors.textMuted} style={{ fontSize: 15 }}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: 16 }}>{children}</View>

          <View style={{ flex: 1 }} />
          {footer ? <View style={{ marginTop: 24 }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
