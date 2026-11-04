import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  icon?: IconName;
  right?: ReactNode;
};

export function TextField({ label, error, icon, right, style, ...rest }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isPassword = rest.secureTextEntry === true;
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText variant="label" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          paddingHorizontal: 14,
          minHeight: 52,
        }}>
        {icon ? <Icon name={icon} size={19} color={focused ? colors.primary : colors.textFaint} /> : null}

        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          secureTextEntry={isPassword ? !revealed : false}
          placeholderTextColor={colors.textFaint}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontSize: 15.5,
              paddingVertical: 14,
            },
            style,
          ]}
        />

        {isPassword ? (
          <Pressable hitSlop={10} onPress={() => setRevealed((v) => !v)}>
            <Icon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={colors.textFaint}
            />
          </Pressable>
        ) : (
          right
        )}
      </View>

      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
