import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export function ErrorBanner({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        backgroundColor: colors.accentSoft,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.accent + '55',
      }}>
      <Icon name="alert-circle" size={18} color={colors.danger} />
      <AppText style={{ flex: 1, color: colors.danger, fontSize: 14 }}>{message}</AppText>
    </View>
  );
}
