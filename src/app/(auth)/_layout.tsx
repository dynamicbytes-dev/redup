import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (session) return <Redirect href="/chats" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
