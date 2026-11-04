import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

type Variant =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'micro';

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
  children?: ReactNode;
};

export function AppText({ variant = 'body', color, align, style, ...rest }: Props) {
  const { colors } = useTheme();

  const base: StyleProp<TextStyle> = [
    VARIANTS[variant],
    { color: color ?? colors.text, textAlign: align },
    style,
  ];

  return <Text {...rest} style={base} />;
}

const VARIANTS = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15.5, fontWeight: '400', lineHeight: 21 },
  bodyStrong: { fontSize: 15.5, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 },
  micro: { fontSize: 11.5, fontWeight: '500', letterSpacing: 0.2 },
} as const satisfies Record<Variant, TextStyle>;
