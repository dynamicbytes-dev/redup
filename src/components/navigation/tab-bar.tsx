import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { useSession } from '@/features/auth/session';
import { useConversations } from '@/features/chats/hooks';
import { useFriendRequests, useFriendsRealtime } from '@/features/friends/hooks';
import { useTheme } from '@/theme';

type TabConfig = {
  label: string;
  icon: IconName;
  activeIcon: IconName;
};

const TABS: Record<string, TabConfig> = {
  chats: { label: 'Chats', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  servers: { label: 'Servidores', icon: 'grid-outline', activeIcon: 'grid' },
  friends: { label: 'Amigos', icon: 'people-outline', activeIcon: 'people' },
  status: { label: 'Estados', icon: 'aperture-outline', activeIcon: 'aperture' },
  calls: { label: 'Llamadas', icon: 'call-outline', activeIcon: 'call' },
  settings: { label: 'Ajustes', icon: 'settings-outline', activeIcon: 'settings' },
};

export function RedupTabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { userId } = useSession();
  const { data: conversations } = useConversations();
  useFriendsRealtime(Boolean(userId));
  const { incoming } = useFriendRequests(userId);

  const unread = (conversations ?? []).reduce((total, item) => total + item.unread_count, 0);
  const pendingFriends = incoming.length;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingBottom: insets.bottom,
        paddingTop: 8,
      }}>
      {state.routes.map((route, index) => {
        const config = TABS[route.name];
        if (!config) return null;

        const focused = state.index === index;
        const badgeCount =
          route.name === 'chats' ? unread : route.name === 'friends' ? pendingFriends : 0;
        const showBadge = badgeCount > 0;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={config.label}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 }}
            onPress={() => navigateToTab(route.key)}>
            <View>
              <Icon
                name={focused ? config.activeIcon : config.icon}
                size={24}
                color={focused ? colors.primary : colors.textMuted}
              />
              {focused ? (
                <View
                  style={{
                    position: 'absolute',
                    left: -7,
                    right: -7,
                    top: 6,
                    bottom: 6,
                    borderRadius: 12,
                    backgroundColor: colors.primary,
                    opacity: 0.1,
                    zIndex: -1,
                  }}
                />
              ) : null}
              {showBadge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -8,
                    minWidth: 17,
                    height: 17,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: colors.bgElevated,
                  }}>
                  <AppText style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '700' }}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </AppText>
                </View>
              ) : null}
            </View>

            <AppText
              variant="micro"
              color={focused ? colors.primary : colors.textMuted}
              style={{ fontWeight: focused ? '700' : '500' }}>
              {config.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
