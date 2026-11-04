import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/theme/tokens';

export function Logo({ size = 60 }: { size?: number }) {
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
          fontSize: size * 0.54,
          fontWeight: '800',
          letterSpacing: -1,
          marginTop: -size * 0.04,
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <AppText style={{ color, fontSize: size, fontWeight: '800', letterSpacing: -0.9 }}>
        redup
      </AppText>
      <View
        style={{
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: size * 0.11,
          backgroundColor: brand.coral,
          marginBottom: size * 0.1,
          marginLeft: size * 0.06,
        }}
      />
    </View>
  );
}
