import { Platform } from 'react-native';

/**
 * Akatsuki Chat · Identidad visual Naruto / Akatsuki
 * - Base oscura estilo capa de Akatsuki (obsidiana profundo)
 * - Rojo carmesí Sharingan / Nube de Akatsuki (primario)
 * - Naranja chakra Naruto Sage / Kyuubi (acento vibrante)
 */
export const brand = {
  crimson: '#E6192E',
  crimsonDeep: '#991B1B',
  crimsonLight: '#FF334B',
  narutoOrange: '#FF7A00',
  chakraBlue: '#00D2FF',
  obsidian: '#0A0A0E',
  // Alias de compatibilidad
  indigo: '#E6192E',
  indigoDeep: '#991B1B',
  indigoLight: '#FF4D62',
  coral: '#FF7A00',
} as const;

const light = {
  bg: '#F8F6F2',
  bgElevated: '#FFFFFF',
  surface: '#EFECE4',
  surfaceAlt: '#E4E0D6',
  surfaceStrong: '#D7D1C3',
  border: '#DCD6C7',
  text: '#17151D',
  textMuted: '#686273',
  textFaint: '#968F9F',
  primary: '#D61327',
  primarySoft: '#FDECEF',
  onPrimary: '#FFFFFF',
  accent: '#EA580C',
  accentSoft: '#FFF3EB',
  onAccent: '#FFFFFF',
  bubbleIn: '#ECE7DD',
  bubbleInText: '#17151D',
  bubbleOut: '#D61327',
  bubbleOutText: '#FFFFFF',
  tick: 'rgba(255,255,255,0.7)',
  tickRead: '#FFE4A0',
  danger: '#DC2626',
  overlay: 'rgba(15,14,25,0.5)',
} as const;

const dark = {
  bg: '#0A0A0E',
  bgElevated: '#131219',
  surface: '#14131C',
  surfaceAlt: '#1D1B28',
  surfaceStrong: '#272435',
  border: '#282536',
  text: '#F5F4FB',
  textMuted: '#9B96AD',
  textFaint: '#69647C',
  primary: '#E6192E',
  primarySoft: '#2B0E13',
  onPrimary: '#FFFFFF',
  accent: '#FF7A00',
  accentSoft: '#331B0E',
  onAccent: '#FFFFFF',
  bubbleIn: '#1A1824',
  bubbleInText: '#F5F4FB',
  bubbleOut: '#C51628',
  bubbleOutText: '#FFFFFF',
  tick: 'rgba(255,255,255,0.7)',
  tickRead: '#FFA500',
  danger: '#FF334B',
  overlay: 'rgba(0,0,0,0.65)',
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
