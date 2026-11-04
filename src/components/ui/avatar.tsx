import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { avatarTint, initials } from '@/lib/format';
import { avatarUrl } from '@/lib/storage';
import { useTheme } from '@/theme';

import { AppText } from './app-text';

type Props = {
  name: string | null | undefined;
  uri?: string | null;
  size?: number;
  online?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ name, uri, size = 48, online, style }: Props) {
  const { colors } = useTheme();
  const tint = avatarTint(name ?? '?');
  const src = avatarUrl(uri);
  const fontSize = Math.round(size * 0.4);
  const dot = Math.max(10, Math.round(size * 0.26));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {src ? (
          <Image
            source={{ uri: src }}
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={160}
          />
        ) : (
          <AppText style={{ color: '#FFFFFF', fontSize, fontWeight: '700' }}>
            {initials(name)}
          </AppText>
        )}
      </View>

      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: '#2BD67B',
            borderWidth: 2.5,
            borderColor: colors.bg,
          }}
        />
      ) : null}
    </View>
  );
}
