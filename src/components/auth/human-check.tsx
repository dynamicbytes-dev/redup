import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import type { HumanChallenge } from '@/lib/security';
import { notifyInputFocused } from '@/lib/use-keyboard';
import { useTheme } from '@/theme';

type Props = {
  challenge: HumanChallenge;
  answer: string;
  onChangeAnswer: (value: string) => void;
  onRefresh: () => void;
  honeypot: string;
  onChangeHoneypot: (value: string) => void;
  error?: string | null;
};

/**
 * Componente de protección anti-bots que combina:
 * 1. Un campo trampa invisible (Honeypot) que los bots de autocompletado rellenan pero los humanos no ven.
 * 2. Una verificación rápida de seguridad generada con `expo-crypto`.
 */
export function HumanCheckField({
  challenge,
  answer,
  onChangeAnswer,
  onRefresh,
  honeypot,
  onChangeHoneypot,
  error,
}: Props) {
  const { colors } = useTheme();
  const isSolved = answer.trim() === challenge.expectedAnswer;

  return (
    <View style={{ gap: 6 }}>
      {/* Campo trampa (Honeypot) oculto para humanos pero visible en el árbol para bots */}
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          zIndex: -10,
        }}>
        <TextInput
          value={honeypot}
          onChangeText={onChangeHoneypot}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect={false}
          tabIndex={-1}
          placeholder="Deja este campo vacío"
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon
            name={isSolved ? 'shield-checkmark' : 'shield-outline'}
            size={15}
            color={isSolved ? '#2BD67B' : colors.primary}
          />
          <AppText variant="label" color={colors.textMuted}>
            Verificación anti-bots
          </AppText>
        </View>

        <Pressable
          hitSlop={8}
          onPress={onRefresh}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="refresh" size={14} color={colors.textFaint} />
          <AppText variant="micro" color={colors.textFaint}>
            Otra pregunta
          </AppText>
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 14,
          backgroundColor: colors.surface,
          borderWidth: isSolved ? 1.5 : 1,
          borderColor: error ? colors.danger : isSolved ? '#2BD67B' : colors.border,
        }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: colors.primarySoft,
          }}>
          <AppText variant="bodyStrong" color={colors.primary}>
            {challenge.question}
          </AppText>
        </View>

        <TextInput
          value={answer}
          onChangeText={(txt) => onChangeAnswer(txt.replace(/[^0-9-]/g, ''))}
          onFocus={() => notifyInputFocused()}
          keyboardType="number-pad"
          placeholder="Respuesta"
          placeholderTextColor={colors.textFaint}
          maxLength={4}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 16,
            fontWeight: '600',
            paddingVertical: 6,
          }}
        />

        {isSolved ? (
          <Icon name="checkmark-circle" size={20} color="#2BD67B" />
        ) : null}
      </View>

      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

