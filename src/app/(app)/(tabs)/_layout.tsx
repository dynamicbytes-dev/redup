import { Tabs } from 'expo-router/tabs';

import { RedupTabBar } from '@/components/navigation/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <RedupTabBar {...props} />}>
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
      <Tabs.Screen name="wall" options={{ title: 'Muro' }} />
      <Tabs.Screen name="servers" options={{ title: 'Servidores' }} />
      <Tabs.Screen name="friends" options={{ title: 'Amigos' }} />
      <Tabs.Screen name="status" options={{ title: 'Estados' }} />
      <Tabs.Screen name="calls" options={{ title: 'Llamadas' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
