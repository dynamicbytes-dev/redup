import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: ReactNode;
  edges?: Edge[];
  padded?: boolean;
  style?: ViewStyle;
};

export function Screen({ children, edges = ['top', 'left', 'right'], padded = false, style }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView
        edges={edges}
        style={[{ flex: 1 }, padded && { paddingHorizontal: 20 }, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}
