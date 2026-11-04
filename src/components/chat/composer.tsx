import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Platform, Pressable, TextInput, View } from 'react-native';

import { ActionSheet, type SheetOption } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import {
  pickChatDocument,
  pickChatImageFromCamera,
  pickChatImageFromLibrary,
  type PickedMedia,
} from '@/features/chats/media';
import { durationLabel, formatFileSize, messagePreview } from '@/lib/format';
import type { ChatMessage } from '@/lib/types';
import { useTheme } from '@/theme';

type Props = {
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  onEdit?: (id: string, body: string) => void;
  onSend: (body: string, replyToId?: string | null) => void;
  onSendMedia?: (media: PickedMedia, caption?: string | null, replyToId?: string | null) => void;
  onTyping: () => void;
  bottomInset: number;
};

export function Composer({
  replyTo,
  onCancelReply,
  editingMessage = null,
  onCancelEdit,
  onEdit,
  onSend,
  onSendMedia,
  onTyping,
  bottomInset,
}: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState(() => editingMessage?.body ?? '');
  const [pendingMedia, setPendingMedia] = useState<PickedMedia | null>(null);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const isRecording = recordingActive || recorderState.isRecording;
  const canSend = text.trim().length > 0 || Boolean(pendingMedia);

  function cancelEditing() {
    setText('');
    onCancelEdit?.();
  }

  function handleSend() {
    if (editingMessage && onEdit) {
      const body = text.trim();
      if (!body) return;
      if (body !== (editingMessage.body ?? '').trim()) {
        onEdit(editingMessage.id, body);
      }
      setText('');
      onCancelEdit?.();
      return;
    }

    if (pendingMedia && onSendMedia) {
      const caption = text.trim() || null;
      onSendMedia(pendingMedia, caption, replyTo?.id ?? null);
      setPendingMedia(null);
      setText('');
      onCancelReply();
      return;
    }

    const body = text.trim();
    if (!body) return;
    onSend(body, replyTo?.id ?? null);
    setText('');
    onCancelReply();
  }

  async function handlePickCamera() {
    try {
      const picked = await pickChatImageFromCamera();
      if (picked) setPendingMedia(picked);
    } catch (e) {
      Alert.alert(
        'Cámara',
        e instanceof Error ? e.message : 'No pudimos abrir la cámara.',
      );
    }
  }

  async function handlePickGallery() {
    try {
      const picked = await pickChatImageFromLibrary();
      if (picked) setPendingMedia(picked);
    } catch (e) {
      Alert.alert(
        'Fotos',
        e instanceof Error ? e.message : 'No pudimos abrir tus fotos.',
      );
    }
  }

  async function handlePickDocument() {
    try {
      const picked = await pickChatDocument();
      if (picked) setPendingMedia(picked);
    } catch (e) {
      Alert.alert(
        'Documento',
        e instanceof Error ? e.message : 'No pudimos seleccionar el archivo.',
      );
    }
  }

  async function startVoiceRecording() {
    if (!onSendMedia) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permiso de micrófono',
          'Necesitamos acceso al micrófono para grabar notas de voz.',
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingActive(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      setRecordingActive(false);
      Alert.alert('Nota de voz', 'No pudimos iniciar la grabación de audio.');
    }
  }

  async function cancelVoiceRecording() {
    try {
      await recorder.stop();
    } catch {
      // Ignorar si ya se detuvo
    } finally {
      setRecordingActive(false);
      Haptics.selectionAsync().catch(() => {});
    }
  }

  async function finishVoiceRecording() {
    const durationMs = Math.max(recorderState.durationMillis || 0, 500);
    try {
      await recorder.stop();
      setRecordingActive(false);

      const uri = recorder.uri || recorderState.url;
      if (!uri || !onSendMedia) return;

      const ext = Platform.OS === 'web' ? 'webm' : 'm4a';
      const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';

      onSendMedia(
        {
          kind: 'audio',
          localUri: uri,
          fileName: `nota-voz-${Date.now()}.${ext}`,
          mimeType,
          ext,
          durationMs,
        },
        null,
        replyTo?.id ?? null,
      );
      onCancelReply();
    } catch {
      setRecordingActive(false);
      Alert.alert('Nota de voz', 'No pudimos guardar la nota de voz.');
    }
  }

  const attachOptions: SheetOption[] = [
    {
      label: 'Tomar foto con la cámara',
      icon: 'camera-outline',
      onPress: handlePickCamera,
    },
    {
      label: 'Elegir foto de la galería',
      icon: 'image-outline',
      onPress: handlePickGallery,
    },
    {
      label: 'Enviar documento o archivo',
      icon: 'document-attach-outline',
      onPress: handlePickDocument,
    },
  ];

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: Math.max(bottomInset, 8),
        backgroundColor: colors.bgElevated,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
      {editingMessage ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 8,
            marginBottom: 8,
            marginHorizontal: 2,
          }}>
          <View
            style={{
              width: 3,
              alignSelf: 'stretch',
              borderRadius: 2,
              backgroundColor: colors.accent,
            }}
          />
          <Icon name="create-outline" size={16} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <AppText variant="micro" color={colors.accent} style={{ fontWeight: '700' }}>
              Editando mensaje
            </AppText>
            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
              {editingMessage.body ?? ''}
            </AppText>
          </View>
          <Pressable onPress={cancelEditing} hitSlop={10}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 8,
            marginBottom: 8,
            marginHorizontal: 2,
          }}>
          <View
            style={{
              width: 3,
              alignSelf: 'stretch',
              borderRadius: 2,
              backgroundColor: colors.primary,
            }}
          />
          <View style={{ flex: 1 }}>
            <AppText variant="micro" color={colors.primary} style={{ fontWeight: '700' }}>
              Respondiendo
            </AppText>
            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
              {replyTo.deleted_at
                ? 'Mensaje eliminado'
                : messagePreview(replyTo.kind, replyTo.body)}
            </AppText>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {pendingMedia ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 8,
            marginBottom: 8,
            marginHorizontal: 2,
          }}>
          {pendingMedia.kind === 'image' ? (
            <Image
              source={{ uri: pendingMedia.localUri }}
              style={{ width: 48, height: 48, borderRadius: 10 }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="document-text-outline" size={22} color={colors.primary} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>
              {pendingMedia.kind === 'image' ? 'Foto lista para enviar' : pendingMedia.fileName}
            </AppText>
            <AppText variant="micro" color={colors.textMuted} numberOfLines={1}>
              {pendingMedia.size
                ? `${pendingMedia.ext.toUpperCase()} · ${formatFileSize(pendingMedia.size)}`
                : 'Añade un comentario opcional abajo'}
            </AppText>
          </View>

          <Pressable onPress={() => setPendingMedia(null)} hitSlop={10} style={{ padding: 4 }}>
            <Icon name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {isRecording ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 }}>
          <Pressable
            onPress={cancelVoiceRecording}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="trash-outline" size={20} color={colors.danger} />
          </Pressable>

          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: colors.surface,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.danger,
              paddingHorizontal: 14,
              height: 46,
            }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.danger,
              }}
            />
            <AppText variant="bodyStrong" style={{ flex: 1, fontSize: 15 }}>
              Grabando nota de voz…
            </AppText>
            <AppText
              variant="bodyStrong"
              color={colors.danger}
              style={{ fontVariant: ['tabular-nums'] }}>
              {durationLabel(recorderState.durationMillis)}
            </AppText>
          </View>

          <Pressable
            onPress={finishVoiceRecording}
            style={({ pressed }) => ({
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accent,
              transform: [{ scale: pressed ? 0.92 : 1 }],
            })}>
            <Icon name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          {!editingMessage ? (
            <Pressable
              onPress={() => setAttachSheetOpen(true)}
              style={({ pressed }) => ({
                width: 44,
                height: 46,
                borderRadius: 22,
                backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              })}>
              <Icon name="add" size={24} color={colors.primary} />
            </Pressable>
          ) : null}

          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'flex-end',
              backgroundColor: colors.surface,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: editingMessage
                ? colors.accent
                : pendingMedia
                  ? colors.primary
                  : colors.border,
              paddingHorizontal: 14,
              paddingVertical: 3,
              minHeight: 46,
            }}>
            <TextInput
              value={text}
              onChangeText={(value) => {
                setText(value);
                onTyping();
              }}
              placeholder={
                editingMessage
                  ? 'Edita tu mensaje…'
                  : pendingMedia
                    ? 'Añade un comentario…'
                    : 'Mensaje'
              }
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={4000}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 15.5,
                lineHeight: 20,
                paddingTop: 11,
                paddingBottom: 11,
                maxHeight: 120,
              }}
            />
          </View>

          <Pressable
            onPress={canSend ? handleSend : startVoiceRecording}
            disabled={Boolean(editingMessage) && !canSend}
            style={({ pressed }) => ({
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: canSend ? colors.accent : colors.surfaceAlt,
              transform: [{ scale: pressed ? 0.92 : 1 }],
            })}>
            <Icon
              name={editingMessage ? 'checkmark' : canSend ? 'arrow-up' : 'mic-outline'}
              size={22}
              color={canSend ? '#FFFFFF' : colors.text}
            />
          </Pressable>
        </View>
      )}

      <ActionSheet
        visible={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        title="Compartir en el chat"
        options={attachOptions}
      />
    </View>
  );
}
