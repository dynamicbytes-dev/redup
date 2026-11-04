import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useKeyboardAutoScroll } from '@/lib/use-keyboard';
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
  const { scrollRef, keyboardHeight, onScroll, onTouchEndCapture } = useKeyboardAutoScroll();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View
        style={{ flex: 1, paddingBottom: keyboardHeight }}
        onTouchEndCapture={onTouchEndCapture}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: keyboardHeight > 0 ? 48 : 28,
            justifyContent: center && keyboardHeight === 0 ? 'center' : 'flex-start',
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
      </View>
    </SafeAreaView>
  );
}
