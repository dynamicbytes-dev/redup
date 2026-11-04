import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

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
  const flat = style ? StyleSheet.flatten(style) : undefined;
  const variantStyle = VARIANTS[variant];

  // Si se pasa un fontSize mayor sin lineHeight explícito, ajustamos lineHeight proporcionalmente
  // para evitar que Android recorte ascendentes/descendentes (p. ej. en logos o títulos).
  const autoLineHeight =
    flat?.fontSize && !flat?.lineHeight && flat.fontSize > (variantStyle.fontSize ?? 16)
      ? Math.round(flat.fontSize * 1.25)
      : undefined;

  const base: StyleProp<TextStyle> = [
    variantStyle,
    { color: color ?? colors.text, textAlign: align },
    style,
    autoLineHeight ? { lineHeight: autoLineHeight } : null,
  ];

  return <Text {...rest} style={base} />;
}

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15.5, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15.5, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', letterSpacing: 0.2 },
  micro: { fontSize: 11.5, lineHeight: 16, fontWeight: '500', letterSpacing: 0.2 },
};
