import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/theme/tokens';

export function Logo({ size = 60 }: { size?: number }) {
  const glyphSize = Math.round(size * 0.54);
  const glyphLineHeight = Math.round(glyphSize * 1.18);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: brand.indigo,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText
        style={{
          color: '#FFFFFF',
          fontSize: glyphSize,
          lineHeight: glyphLineHeight,
          fontWeight: '800',
          letterSpacing: -1,
          includeFontPadding: false,
        }}>
        r
      </AppText>
      <View
        style={{
          position: 'absolute',
          right: size * 0.17,
          bottom: size * 0.17,
          width: size * 0.17,
          height: size * 0.17,
          borderRadius: size * 0.085,
          backgroundColor: brand.coral,
        }}
      />
    </View>
  );
}

export function Wordmark({ size = 26, color }: { size?: number; color: string }) {
  const lineHeight = Math.round(size * 1.24);
  const dotSize = Math.max(5, Math.round(size * 0.22));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        paddingVertical: 2,
      }}>
      <AppText
        style={{
          color,
          fontSize: size,
          lineHeight,
          fontWeight: '800',
          letterSpacing: -0.8,
          includeFontPadding: false,
        }}>
        redup
      </AppText>
      <View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: brand.coral,
          marginLeft: Math.max(2, Math.round(size * 0.06)),
          marginBottom: Math.round(size * 0.04),
        }}
      />
    </View>
  );
}
