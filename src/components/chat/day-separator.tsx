import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { formatDaySeparator } from '@/lib/format';
import { useTheme } from '@/theme';

export function DaySeparator({ date }: { date: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: 10 }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 999,
        }}>
        <AppText variant="micro" color={colors.textMuted} style={{ fontWeight: '600' }}>
          {formatDaySeparator(date)}
        </AppText>
      </View>
    </View>
  );
}
