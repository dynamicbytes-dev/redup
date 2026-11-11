import { Redirect, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import { useIncomingCalls } from '@/features/calls/hooks';
import { useNotificationsBootstrap } from '@/features/notifications/use-notifications';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading, userId } = useSession();

  useNotificationsBootstrap(userId);
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useIncomingCalls(userId);

  if (loading) return null;
  if (!session) return <Redirect href="/welcome" />;

  const callerTitle =
    incomingCall?.conversation?.type === 'group'
      ? incomingCall.conversation.name || 'Llamada grupal'
      : incomingCall?.caller?.display_name ||
        incomingCall?.caller?.username ||
        'Llamada entrante';

  const callerAvatar =
    incomingCall?.conversation?.type === 'group'
      ? incomingCall.conversation.avatar_path
      : incomingCall?.caller?.avatar_path;

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="contact/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="group/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="server/[id]/channel/[channelId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="call/[id]"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="new-chat"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="new-group"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
      </Stack>

      {incomingCall ? (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 14,
            right: 14,
            borderRadius: 22,
            padding: 14,
            backgroundColor: '#121020',
            borderWidth: 1,
            borderColor: 'rgba(124, 110, 242, 0.45)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}>
          <Avatar name={callerTitle} uri={callerAvatar} size={46} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" color="#FFFFFF" numberOfLines={1}>
              {callerTitle}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              {incomingCall.kind === 'video'
                ? 'Videollamada entrante…'
                : 'Llamada de voz entrante…'}
            </AppText>
          </View>

          <Pressable
            onPress={declineIncomingCall}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#E5484D',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              name="call"
              size={19}
              color="#FFFFFF"
              style={{ transform: [{ rotate: '135deg' }] }}
            />
          </Pressable>

          <Pressable
            onPress={acceptIncomingCall}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#10B981',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon
              name={incomingCall.kind === 'video' ? 'videocam' : 'call'}
              size={19}
              color="#FFFFFF"
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
