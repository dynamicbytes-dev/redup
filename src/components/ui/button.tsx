import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth = true,
  size = 'md',
  style,
}: Props) {
  const { colors } = useTheme();

  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.surfaceAlt
        : variant === 'danger'
          ? colors.danger
          : 'transparent';

  const fg =
    variant === 'primary' || variant === 'danger'
      ? variant === 'danger'
        ? '#FFFFFF'
        : colors.onPrimary
      : variant === 'secondary'
        ? colors.text
        : colors.primary;

  const height = size === 'lg' ? 56 : 50;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height,
          borderRadius: 16,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.99 : 1 }],
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={19} color={fg} /> : null}
          <AppText style={{ color: fg, fontSize: size === 'lg' ? 16.5 : 15.5, fontWeight: '600' }}>
            {title}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
