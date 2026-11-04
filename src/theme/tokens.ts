import { Platform } from 'react-native';

/**
 * Redup · identidad visual
 * Índigo profundo + acento coral. Lenguaje de interacción tipo WhatsApp,
 * pero con personalidad propia.
 */
export const brand = {
  indigo: '#5B4BE8',
  indigoDeep: '#3A2FA8',
  indigoLight: '#8F86FF',
  coral: '#FF6B5B',
} as const;

const light = {
  bg: '#FFFFFF',
  bgElevated: '#FFFFFF',
  surface: '#F7F6FC',
  surfaceAlt: '#EFEDF9',
  surfaceStrong: '#E4E1F4',
  border: '#E7E5F2',
  text: '#141322',
  textMuted: '#6E6A85',
  textFaint: '#9C98AF',
  primary: '#5B4BE8',
  primarySoft: '#EDEBFE',
  onPrimary: '#FFFFFF',
  accent: '#FF6B5B',
  accentSoft: '#FFECE9',
  onAccent: '#FFFFFF',
  bubbleIn: '#F3F1FB',
  bubbleInText: '#141322',
  bubbleOut: '#5B4BE8',
  bubbleOutText: '#FFFFFF',
  tick: 'rgba(255,255,255,0.65)',
  tickRead: '#FFC2B8',
  danger: '#E5484D',
  overlay: 'rgba(15,14,25,0.45)',
} as const;

const dark = {
  bg: '#0D0C14',
  bgElevated: '#16141F',
  surface: '#16141F',
  surfaceAlt: '#1E1B2A',
  surfaceStrong: '#272338',
  border: '#282439',
  text: '#F5F4FB',
  textMuted: '#9C97B2',
  textFaint: '#6E6982',
  primary: '#7B6DF5',
  primarySoft: '#221F3D',
  onPrimary: '#FFFFFF',
  accent: '#FF7D6E',
  accentSoft: '#33201E',
  onAccent: '#1A0F0D',
  bubbleIn: '#1B1826',
  bubbleInText: '#F5F4FB',
  bubbleOut: '#4C40C4',
  bubbleOutText: '#FFFFFF',
  tick: 'rgba(255,255,255,0.6)',
  tickRead: '#FFC2B8',
  danger: '#FF6369',
  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const palettes = { light, dark } as const;
export type ThemeScheme = keyof typeof palettes;
export type ThemeColors = { [K in keyof typeof light]: string };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fonts = {
  regular: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' })!,
  medium: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'System' })!,
  bold: Platform.select({ ios: 'System', android: 'sans-serif-condensed', default: 'System' })!,
};

export const maxContentWidth = 720;
