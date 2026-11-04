import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

export type SheetOption = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: SheetOption[];
};

export function ActionSheet({ visible, onClose, title, options }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}
        onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
            paddingHorizontal: 12,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
          onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.surfaceStrong,
              marginBottom: 10,
            }}
          />
          {title ? (
            <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginBottom: 8 }}>
              {title}
            </AppText>
          ) : null}

          {options.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 15,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
              })}>
              {option.icon ? (
                <Icon
                  name={option.icon}
                  size={20}
                  color={option.destructive ? colors.danger : colors.text}
                />
              ) : null}
              <AppText
                variant="bodyStrong"
                color={option.destructive ? colors.danger : colors.text}>
                {option.label}
              </AppText>
            </Pressable>
          ))}

          <View style={{ height: 6 }} />
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              paddingVertical: 15,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            })}>
            <AppText variant="bodyStrong" color={colors.primary}>
              Cancelar
            </AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function FullScreenLoader() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
