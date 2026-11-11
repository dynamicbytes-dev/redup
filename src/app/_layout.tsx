import '@/lib/crypto-polyfill';

import { registerGlobals } from '@livekit/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FullScreenLoader } from '@/components/ui/action-sheet';
import { SessionProvider, useSession } from '@/features/auth/session';
import { initErrorReporting } from '@/lib/error-reporting';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider, useTheme } from '@/theme';

if (Platform.OS !== 'web') {
  registerGlobals();
}

initErrorReporting();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <RootNavigator />
            </SessionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { loading } = useSession();
  const { colors, scheme } = useTheme();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) return <FullScreenLoader />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="reset-password" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
