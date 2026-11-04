import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Props = {
  icon: IconName;
  title: string;
  description?: string;
};

export function EmptyState({ icon, title, description }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="caption" color={colors.textMuted} align="center">
          {description}
        </AppText>
      ) : null}
    </View>
  );
}
