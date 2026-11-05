import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './app-text';
import { Icon } from './icon';
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type SubmitReportInput,
} from '@/features/reports/api';
import { useTheme } from '@/theme';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  target: {
    reportedUserId?: string | null;
    contentType: 'user' | 'message' | 'status';
    contentId?: string | null;
    displayName?: string | null;
  } | null;
}

export function ReportModal({ visible, onClose, target }: ReportModalProps) {
  const { colors } = useTheme();
  const [selectedReason, setSelectedReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!target) return null;

  async function handleSend() {
    if (!target) return;
    setSubmitting(true);
    try {
      const input: SubmitReportInput = {
        reportedUserId: target.reportedUserId,
        contentType: target.contentType,
        contentId: target.contentId,
        reason: selectedReason,
        details: details.trim() || undefined,
      };
      await submitReport(input);
      Alert.alert(
        'Reporte recibido',
        'Gracias por ayudarnos a mantener segura a la comunidad. Nuestro equipo de moderación revisará el contenido reportado a la brevedad.',
        [{ text: 'Entendido', onPress: onClose }],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar reporte.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const titleType =
    target.contentType === 'user'
      ? `usuario ${target.displayName ? `@${target.displayName}` : ''}`
      : target.contentType === 'status'
        ? 'estado'
        : 'mensaje';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'flex-end',
        }}>
        <SafeAreaView
          edges={['bottom']}
          style={{
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <AppText variant="subtitle" style={{ fontSize: 18 }}>
                Reportar {titleType}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                Ayúdanos a comprender qué está ocurriendo
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Form */}
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 14 }}
            keyboardShouldPersistTaps="handled">
            <AppText variant="caption" color={colors.textFaint} style={{ textTransform: 'uppercase' }}>
              Motivo del reporte
            </AppText>

            {REPORT_REASONS.map((reason) => {
              const selected = selectedReason === reason.key;
              return (
                <Pressable
                  key={reason.key}
                  onPress={() => setSelectedReason(reason.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.primarySoft : colors.surfaceAlt,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    gap: 12,
                  }}>
                  <Icon
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? colors.primary : colors.textFaint}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText
                      style={{
                        fontWeight: selected ? '700' : '500',
                        color: selected ? colors.primary : colors.text,
                      }}>
                      {reason.label}
                    </AppText>
                    <AppText variant="micro" color={colors.textMuted}>
                      {reason.description}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}

            <AppText variant="caption" color={colors.textFaint} style={{ textTransform: 'uppercase', marginTop: 6 }}>
              Detalles adicionales (opcional)
            </AppText>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Explica brevemente lo sucedido..."
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
              style={{
                height: 80,
                borderRadius: 14,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                color: colors.text,
                fontSize: 14,
                textAlignVertical: 'top',
              }}
            />

            {/* Acciones */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={onClose}
                disabled={submitting}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                <AppText color={colors.textMuted} style={{ fontWeight: '600' }}>
                  Cancelar
                </AppText>
              </Pressable>

              <Pressable
                onPress={handleSend}
                disabled={submitting}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: colors.danger,
                }}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <AppText color="#FFFFFF" style={{ fontWeight: '700' }}>
                    Enviar reporte
                  </AppText>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
