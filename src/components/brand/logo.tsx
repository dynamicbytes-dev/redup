import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/theme/tokens';

export function Logo({ size = 60 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: brand.crimson,
        backgroundColor: brand.obsidian,
        shadowColor: brand.crimson,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 8,
      }}>
      <Image
        source={require('../../../assets/images/logo.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
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
        alignItems: 'center',
        paddingVertical: 2,
        gap: 6,
      }}>
      <Image
        source={require('../../../assets/images/logo.png')}
        style={{
          width: size * 0.9,
          height: size * 0.9,
          borderRadius: (size * 0.9) / 2,
          borderWidth: 1,
          borderColor: brand.crimson,
        }}
        contentFit="contain"
      />
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AppText
          style={{
            color,
            fontSize: size,
            lineHeight,
            fontWeight: '900',
            letterSpacing: -0.5,
            includeFontPadding: false,
          }}>
          Akatsuki
        </AppText>
        <AppText
          style={{
            color: brand.crimson,
            fontSize: size,
            lineHeight,
            fontWeight: '900',
            letterSpacing: -0.5,
            marginLeft: 4,
            includeFontPadding: false,
          }}>
          Chat
        </AppText>
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: brand.narutoOrange,
            marginLeft: Math.max(3, Math.round(size * 0.08)),
            marginBottom: Math.round(size * 0.12),
          }}
        />
      </View>
    </View>
  );
}
