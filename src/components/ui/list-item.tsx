import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Props = {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
  last?: boolean;
};

export function ListItem({
  icon,
  title,
  subtitle,
  value,
  onPress,
  destructive,
  right,
  last,
}: Props) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.text;

  const content = (
    <>
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: destructive ? colors.accentSoft : colors.primarySoft,
          }}>
          <Icon name={icon} size={18} color={destructive ? colors.danger : colors.primary} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={color}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {value ? (
        <AppText variant="caption" color={colors.textMuted}>
          {value}
        </AppText>
      ) : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </>
  );

  return (
    <View>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          opacity: pressed ? 0.6 : 1,
        })}>
        {content}
      </Pressable>
      {!last ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 60 }} /> : null}
    </View>
  );
}
