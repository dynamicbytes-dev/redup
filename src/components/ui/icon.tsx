import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: ComponentProps<typeof Ionicons>['style'];
};

export function Icon({ name, size = 22, color, style }: Props) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.text} style={style} />;
}
