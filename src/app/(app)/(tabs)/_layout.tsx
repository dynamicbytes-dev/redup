import { Tabs } from 'expo-router/tabs';

import { RedupTabBar } from '@/components/navigation/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <RedupTabBar {...props} />}>
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="status" options={{ title: 'Estados' }} />
      <Tabs.Screen name="calls" options={{ title: 'Llamadas' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
