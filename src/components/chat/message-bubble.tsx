import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import {
  avatarTint,
  durationLabel,
  formatFileSize,
  formatMessageTime,
  messagePreview,
} from '@/lib/format';
import { useSignedMediaUrl } from '@/lib/storage';
import type { ChatMessage, Message, StoryReplyMeta } from '@/lib/types';
import { useTheme } from '@/theme';

type Props = {
  message: ChatMessage;
  isMine: boolean;
  readByOthers: boolean;
  showSender?: boolean;
  senderName?: string | null;
  senderAvatar?: string | null;
  onPressSender?: () => void;
  onPressImage?: (uri: string, caption?: string | null) => void;
  replyTo?: Message | null;
  repliedName?: string | null;
  onLongPress?: () => void;
  onRetry?: () => void;
};

export function MessageBubble({
  message,
  isMine,
  readByOthers,
  showSender = false,
  senderName,
  senderAvatar,
  onPressSender,
  onPressImage,
  replyTo,
  repliedName,
  onLongPress,
  onRetry,
}: Props) {
  const { colors } = useTheme();

  if (message.kind === 'system') {
    const label = senderName ? `${senderName} · ${message.body ?? ''}` : (message.body ?? '');
    return (
      <View style={{ alignItems: 'center', marginVertical: 6, paddingHorizontal: 24 }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 999,
            paddingHorizontal: 13,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <AppText variant="micro" color={colors.textMuted} align="center">
            {label}
          </AppText>
        </View>
      </View>
    );
  }

  const deleted = Boolean(message.deleted_at);
  const storyReply = (message.media_meta as { story_reply?: StoryReplyMeta } | null)?.story_reply;
  const isStoryReaction = Boolean(
    (message.media_meta as { is_story_reaction?: boolean } | null)?.is_story_reaction,
  );
  const bg = isMine ? colors.bubbleOut : colors.bubbleIn;
  const fg = isMine ? colors.bubbleOutText : colors.bubbleInText;
  const senderColor = avatarTint(message.sender_id ?? senderName);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isMine ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 12,
        marginVertical: 1.5,
      }}>
      {showSender && !isMine ? (
        <Pressable onPress={onPressSender} hitSlop={6} style={{ marginBottom: 2 }}>
          <Avatar name={senderName ?? 'Usuario'} uri={senderAvatar} size={28} />
        </Pressable>
      ) : null}

      <Pressable
        onLongPress={onLongPress}
        delayLongPress={280}
        style={{
          maxWidth: showSender && !isMine ? '78%' : '84%',
          backgroundColor: bg,
          borderRadius: 18,
          borderBottomRightRadius: isMine ? 6 : 18,
          borderBottomLeftRadius: isMine ? 18 : 6,
          paddingHorizontal: message.kind === 'image' && !deleted ? 6 : 12,
          paddingTop: message.kind === 'image' && !deleted && !(showSender && !isMine) ? 6 : 8,
          paddingBottom: 6,
          gap: 4,
        }}>
        {showSender && !isMine && senderName ? (
          <Pressable
            onPress={onPressSender}
            hitSlop={4}
            style={{ paddingHorizontal: message.kind === 'image' && !deleted ? 6 : 0 }}>
            <AppText
              variant="micro"
              numberOfLines={1}
              style={{ color: senderColor, fontWeight: '700', marginBottom: 1 }}>
              {senderName}
            </AppText>
          </Pressable>
        ) : null}

        {replyTo ? (
          <View
            style={{
              borderLeftWidth: 3,
              borderLeftColor: isMine ? 'rgba(255,255,255,0.55)' : colors.primary,
              backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : colors.surface,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 5,
              marginBottom: 2,
              marginHorizontal: message.kind === 'image' && !deleted ? 4 : 0,
            }}>
            {repliedName ? (
              <AppText
                variant="micro"
                style={{ color: isMine ? '#FFFFFF' : colors.primary, fontWeight: '700' }}>
                {repliedName}
              </AppText>
            ) : null}
            <AppText
              variant="caption"
              numberOfLines={2}
              style={{ color: isMine ? 'rgba(255,255,255,0.85)' : colors.textMuted }}>
              {replyTo.deleted_at
                ? 'Mensaje eliminado'
                : messagePreview(replyTo.kind, replyTo.body)}
            </AppText>
          </View>
        ) : null}

        {storyReply && !deleted ? (
          <StoryReplyHeader storyReply={storyReply} isMine={isMine} />
        ) : null}

        {deleted ? (
          <AppText
            style={{
              color: isMine ? 'rgba(255,255,255,0.7)' : colors.textMuted,
              fontStyle: 'italic',
              fontSize: 15,
            }}>
            Mensaje eliminado
          </AppText>
        ) : message.kind === 'image' ? (
          <ImageBubbleContent
            message={message}
            isMine={isMine}
            fg={fg}
            onPressImage={onPressImage}
            onLongPress={onLongPress}
          />
        ) : message.kind === 'audio' ? (
          <AudioBubbleContent message={message} isMine={isMine} />
        ) : message.kind === 'file' ? (
          <FileBubbleContent message={message} isMine={isMine} fg={fg} />
        ) : isStoryReaction ? (
          <AppText
            style={{
              fontSize: 34,
              lineHeight: 40,
              textAlign: isMine ? 'right' : 'left',
              paddingVertical: 2,
            }}>
            {message.body}
          </AppText>
        ) : (
          <AppText style={{ color: fg, fontSize: 15.5, lineHeight: 21 }}>{message.body}</AppText>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-end',
            gap: 4,
            marginTop: 1,
            paddingLeft: 8,
            paddingRight: message.kind === 'image' && !deleted ? 4 : 0,
          }}>
          {message.edited_at && !deleted ? (
            <AppText
              variant="micro"
              style={{ color: isMine ? 'rgba(255,255,255,0.65)' : colors.textFaint }}>
              editado
            </AppText>
          ) : null}

          <AppText
            variant="micro"
            style={{ color: isMine ? 'rgba(255,255,255,0.7)' : colors.textFaint }}>
            {formatMessageTime(message.created_at)}
          </AppText>

          {isMine ? (
            message.failed ? (
              <Pressable onPress={onRetry} hitSlop={6}>
                <Icon name="refresh-circle" size={16} color={colors.danger} />
              </Pressable>
            ) : message.pending ? (
              <Icon name="time-outline" size={13} color={colors.tick} />
            ) : readByOthers ? (
              <Icon name="checkmark-done" size={15} color={colors.tickRead} />
            ) : (
              <Icon name="checkmark-done" size={15} color={colors.tick} />
            )
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function ImageBubbleContent({
  message,
  isMine,
  fg,
  onPressImage,
  onLongPress,
}: {
  message: ChatMessage;
  isMine: boolean;
  fg: string;
  onPressImage?: (uri: string, caption?: string | null) => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const url = useSignedMediaUrl(message.media_path);

  const meta = message.media_meta ?? {};
  const rawW = typeof meta.width === 'number' && meta.width > 0 ? meta.width : 4;
  const rawH = typeof meta.height === 'number' && meta.height > 0 ? meta.height : 3;
  const ratio = Math.min(Math.max(rawW / rawH, 0.78), 1.65);
  const width = 236;
  const height = Math.round(width / ratio);

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => {
          if (url && onPressImage) onPressImage(url, message.body);
        }}
        onLongPress={onLongPress}
        delayLongPress={280}
        style={{
          width,
          height,
          borderRadius: 13,
          overflow: 'hidden',
          backgroundColor: isMine ? 'rgba(0,0,0,0.18)' : colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={180}
          />
        ) : (
          <ActivityIndicator color={isMine ? '#FFFFFF' : colors.primary} />
        )}
      </Pressable>

      {message.body ? (
        <AppText
          style={{
            color: fg,
            fontSize: 15,
            lineHeight: 20,
            paddingHorizontal: 6,
            maxWidth: width,
          }}>
          {message.body}
        </AppText>
      ) : null}
    </View>
  );
}

const WAVE_BAR_COUNT = 20;

function AudioBubbleContent({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const { colors } = useTheme();
  const url = useSignedMediaUrl(message.media_path);
  const player = useAudioPlayer(url ?? null, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  const bars = useMemo(() => {
    const out: number[] = [];
    let seed = 17;
    for (let i = 0; i < message.id.length; i += 1) {
      seed = (seed * 31 + message.id.charCodeAt(i)) % 997;
    }
    for (let i = 0; i < WAVE_BAR_COUNT; i += 1) {
      seed = (seed * 73 + i * 19 + 11) % 101;
      out.push(0.28 + (seed / 100) * 0.72);
    }
    return out;
  }, [message.id]);

  const totalMs =
    status.duration > 0 ? status.duration * 1000 : (message.duration_ms ?? 0);
  const currentMs = status.currentTime > 0 ? status.currentTime * 1000 : 0;
  const progress =
    totalMs > 0 ? Math.min(Math.max(currentMs / totalMs, 0), 1) : 0;

  async function togglePlay() {
    if (!url) return;
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {
      // Ignorar si ya está configurado
    }

    if (status.playing) {
      player.pause();
      return;
    }

    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.15)) {
      await player.seekTo(0).catch(() => {});
    }
    player.play();
  }

  function cycleRate() {
    const next: 1 | 1.5 | 2 = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    try {
      player.setPlaybackRate(next);
    } catch {
      // Ignorar en plataformas que no soporten cambio de velocidad
    }
  }

  const activeColor = isMine ? '#FFFFFF' : colors.primary;
  const inactiveColor = isMine ? 'rgba(255,255,255,0.32)' : colors.border;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minWidth: 215,
        paddingVertical: 4,
      }}>
      <Pressable
        onPress={togglePlay}
        disabled={!url}
        hitSlop={6}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {!url ? (
          <ActivityIndicator size="small" color={activeColor} />
        ) : (
          <Icon
            name={status.playing ? 'pause' : 'play'}
            size={19}
            color={activeColor}
            style={{ marginLeft: status.playing ? 0 : 2 }}
          />
        )}
      </Pressable>

      <View style={{ flex: 1, gap: 5 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            height: 24,
          }}>
          {bars.map((heightFactor, idx) => {
            const filled = idx / bars.length <= progress && (status.playing || currentMs > 0);
            return (
              <View
                key={idx}
                style={{
                  width: 3,
                  height: Math.round(6 + heightFactor * 16),
                  borderRadius: 2,
                  backgroundColor: filled ? activeColor : inactiveColor,
                }}
              />
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText
            variant="micro"
            style={{ color: isMine ? 'rgba(255,255,255,0.82)' : colors.textMuted }}>
            {status.playing || currentMs > 0
              ? durationLabel(currentMs)
              : durationLabel(totalMs)}
          </AppText>

          <Pressable
            onPress={cycleRate}
            hitSlop={6}
            style={{
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 999,
              backgroundColor: isMine ? 'rgba(255,255,255,0.16)' : colors.surface,
            }}>
            <AppText
              variant="micro"
              style={{
                color: isMine ? '#FFFFFF' : colors.textMuted,
                fontWeight: '700',
                fontSize: 10.5,
              }}>
              {rate}×
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FileBubbleContent({
  message,
  isMine,
  fg,
}: {
  message: ChatMessage;
  isMine: boolean;
  fg: string;
}) {
  const { colors } = useTheme();
  const url = useSignedMediaUrl(message.media_path);

  const meta = message.media_meta ?? {};
  const fileName = typeof meta.name === 'string' && meta.name ? meta.name : 'Documento adjunto';
  const fileSize = typeof meta.size === 'number' ? formatFileSize(meta.size) : '';
  const ext = (fileName.split('.').pop() ?? 'ARCHIVO').toUpperCase().slice(0, 5);

  async function openDocument() {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => {});
    }
  }

  return (
    <View style={{ gap: 6, minWidth: 210 }}>
      <Pressable
        onPress={openDocument}
        disabled={!url}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 10,
          borderRadius: 12,
          backgroundColor: isMine ? 'rgba(255,255,255,0.14)' : colors.surface,
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon
            name="document-text-outline"
            size={21}
            color={isMine ? '#FFFFFF' : colors.primary}
          />
        </View>

        <View style={{ flex: 1 }}>
          <AppText
            variant="bodyStrong"
            numberOfLines={1}
            style={{ color: isMine ? '#FFFFFF' : colors.text, fontSize: 14.5 }}>
            {fileName}
          </AppText>
          <AppText
            variant="micro"
            style={{ color: isMine ? 'rgba(255,255,255,0.75)' : colors.textMuted }}>
            {fileSize ? `${ext} · ${fileSize}` : ext}
          </AppText>
        </View>

        <Icon
          name="download-outline"
          size={19}
          color={isMine ? '#FFFFFF' : colors.primary}
        />
      </Pressable>

      {message.body ? (
        <AppText style={{ color: fg, fontSize: 15, lineHeight: 20 }}>{message.body}</AppText>
      ) : null}
    </View>
  );
}

function StoryReplyHeader({
  storyReply,
  isMine,
}: {
  storyReply: StoryReplyMeta;
  isMine: boolean;
}) {
  const { colors } = useTheme();
  const isImage = storyReply.kind === 'image';
  const signedUrl = useSignedMediaUrl(isImage ? storyReply.media_path : null);

  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: isMine ? 'rgba(255,255,255,0.7)' : colors.primary,
        backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : colors.surfaceAlt,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={{ width: 36, height: 36, borderRadius: 6 }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            backgroundColor: storyReply.bg_color || colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="flash-outline" size={16} color="#FFFFFF" />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon
            name="arrow-undo-outline"
            size={12}
            color={isMine ? 'rgba(255,255,255,0.9)' : colors.primary}
          />
          <AppText
            variant="micro"
            style={{
              color: isMine ? '#FFFFFF' : colors.primary,
              fontWeight: '700',
            }}>
            {isMine ? 'Respondiste a un estado' : 'Respondió a tu estado'}
          </AppText>
        </View>

        <AppText
          variant="caption"
          numberOfLines={1}
          style={{
            color: isMine ? 'rgba(255,255,255,0.85)' : colors.textMuted,
            marginTop: 1,
          }}>
          {storyReply.caption || (isImage ? 'Foto de estado' : 'Estado')}
        </AppText>
      </View>
    </View>
  );
}
