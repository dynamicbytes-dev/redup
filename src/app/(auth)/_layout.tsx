import { Redirect, Stack, useSegments } from 'expo-router';

import { useSession } from '@/features/auth/session';

export const unstable_settings = {
  anchor: 'welcome',
};

export default function AuthLayout() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const isForgotPassword = segments.includes('forgot-password');

  if (loading) return null;
  // Si el usuario está en el flujo de recuperación de contraseña, no lo expulsamos a chats
  if (session && !isForgotPassword) return <Redirect href="/chats" />;

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
