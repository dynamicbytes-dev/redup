import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { formatListTime, messagePreview } from '@/lib/format';
import type { ConversationOverview } from '@/lib/types';
import { useTheme } from '@/theme';

type Props = {
  conversation: ConversationOverview;
  currentUserId: string;
  aliasOverride?: string | null;
  onlineOverride?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

function isRecentlyOnline(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 2 * 60 * 1000;
}

export function ConversationRow({
  conversation,
  currentUserId,
  aliasOverride,
  onlineOverride,
  onPress,
  onLongPress,
}: Props) {
  const { colors } = useTheme();

  const isGroup = conversation.type === 'group';
  const title = isGroup
    ? (conversation.name ?? 'Grupo')
    : (aliasOverride || conversation.other_display_name || 'Usuario');
  const avatar = isGroup ? conversation.avatar_path : conversation.other_avatar_path;
  const isOnline =
    !isGroup &&
    (onlineOverride !== undefined
      ? onlineOverride
      : isRecentlyOnline(conversation.other_last_seen_at));

  const hasMessage = Boolean(conversation.last_message_created_at);
  const lastIsMine = conversation.last_message_sender_id === currentUserId;
  const deleted = conversation.last_message_kind === 'deleted';

  const preview = hasMessage
    ? messagePreview(conversation.last_message_kind, conversation.last_message_body)
    : 'Toca para empezar la conversación';

  const unread = conversation.unread_count;
  const muted = conversation.muted_until ? new Date(conversation.muted_until) > new Date() : false;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}>
      <Avatar
        name={title}
        uri={avatar}
        size={50}
        online={isOnline}
      />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
            {title}
          </AppText>
          {isGroup ? <Icon name="people-outline" size={13} color={colors.textFaint} /> : null}
          {muted ? <Icon name="notifications-off-outline" size={13} color={colors.textFaint} /> : null}
          <AppText
            variant="micro"
            color={unread > 0 && !muted ? colors.primary : colors.textFaint}
            style={{ fontWeight: unread > 0 ? '700' : '500' }}>
            {formatListTime(conversation.last_message_at)}
          </AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {hasMessage && lastIsMine && !deleted ? (
            <Icon
              name="checkmark-done"
              size={15}
              color={unread > 0 ? colors.textMuted : colors.textFaint}
            />
          ) : null}

          <AppText
            variant="caption"
            color={unread > 0 ? colors.text : colors.textMuted}
            numberOfLines={1}
            style={{ flex: 1, fontWeight: unread > 0 ? '600' : '400' }}>
            {hasMessage && lastIsMine && !deleted ? `Tú: ${preview}` : preview}
          </AppText>

          {unread > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 6,
                backgroundColor: muted ? colors.surfaceStrong : colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AppText
                style={{
                  color: muted ? colors.textMuted : '#FFFFFF',
                  fontSize: 11,
                  fontWeight: '700',
                }}>
                {unread > 99 ? '99+' : unread}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
