import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { MessageKind } from '@/lib/types';

const PUSH_ENABLED_KEY = 'redup.push.enabled.v1';
const PUSH_TOKEN_KEY = 'redup.push.token.v1';

let handlerConfigured = false;
let activeConversationId: string | null = null;

export function setActiveConversationId(conversationId: string | null) {
  activeConversationId = conversationId;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}

export function ensureNotificationHandlerConfigured() {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as
        | { conversationId?: string }
        | undefined;
      const incomingConvId = data?.conversationId ?? null;
      const isSameOpenChat =
        Boolean(incomingConvId) && incomingConvId === activeConversationId;

      return {
        shouldShowBanner: !isSameOpenChat,
        shouldShowList: !isSameOpenChat,
        shouldPlaySound: !isSameOpenChat,
        shouldSetBadge: false,
      };
    },
  });
}

export async function getPushEnabledPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function setPushEnabledPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignorar fallos de almacenamiento local
  }
}

export async function getSavedPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export type PushRegistrationResult = {
  granted: boolean;
  token: string | null;
  isRemote: boolean;
};

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { granted: false, token: null, isRemote: false };
  }

  ensureNotificationHandlerConfigured();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensajes',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 220, 160, 220],
      lightColor: '#5B4BE8',
      showBadge: true,
    }).catch(() => {});
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (existing.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return { granted: false, token: null, isRemote: false };
  }

  let token: string | null = null;
  let isRemote = false;

  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId;

  if (Device.isDevice && !isExpoGo && projectId) {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
      token = expoToken.data;
      isRemote = true;
    } catch {
      token = null;
    }
  } else if (Device.isDevice && !isExpoGo) {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      token = expoToken.data;
      isRemote = true;
    } catch {
      token = null;
    }
  }

  if (!token) {
    const deviceLabel = (Device.modelName ?? 'simulator').replace(/\s+/g, '-').toLowerCase();
    token = `local:${Platform.OS}:${deviceLabel}`;
  }

  try {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // Ignorar error de caché local
  }

  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  await supabase
    .rpc('upsert_push_token', {
      p_token: token,
      p_platform: platform,
      p_device_name: Device.modelName ?? `${Platform.OS}-device`,
    })
    .then(
      () => {},
      () => {},
    );

  return { granted: true, token, isRemote };
}

export async function unregisterPushNotificationsAsync(): Promise<void> {
  const savedToken = await getSavedPushToken();
  if (savedToken) {
    await supabase
      .rpc('remove_push_token', { p_token: savedToken })
      .then(
        () => {},
        () => {},
      );
  }
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Ignorar
  }
}

export function formatPushPreview(kind: MessageKind, body: string | null): string {
  if (kind === 'image') return body ? `📷 ${body}` : '📷 Foto';
  if (kind === 'audio') return '🎤 Nota de voz';
  if (kind === 'file') return body ? `📎 ${body}` : '📎 Documento';
  return body?.trim() || 'Nuevo mensaje';
}

export async function presentLocalMessageNotification(input: {
  conversationId: string;
  title: string;
  body: string;
  messageId?: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  ensureNotificationHandlerConfigured();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      sound: 'default',
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        url: `/chat/${input.conversationId}`,
      },
    },
    trigger: null,
  }).catch(() => {});
}

export async function scheduleTestNotificationAsync(
  conversationId?: string | null,
): Promise<void> {
  if (Platform.OS === 'web') return;
  ensureNotificationHandlerConfigured();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Redup · Notificación de prueba',
      body: conversationId
        ? 'Toca para abrir la conversación directamente.'
        : 'Las notificaciones push están activas en este dispositivo.',
      sound: 'default',
      data: conversationId
        ? { conversationId, url: `/chat/${conversationId}` }
        : { url: '/(app)/(tabs)/chats' },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
    },
  });
}

export async function dispatchConversationPushNotification(input: {
  conversationId: string;
  senderName: string;
  conversationTitle?: string | null;
  isGroup?: boolean;
  kind: MessageKind;
  body: string | null;
  messageId: string;
}): Promise<void> {
  try {
    // Despacho seguro de notificación a través de la Edge Function server-side.
    // Los push tokens de los destinatarios nunca se exponen al cliente móvil,
    // y el servidor valida contra la base de datos la autenticidad del mensaje y bloqueos.
    await supabase.functions.invoke('push-notify', {
      body: { messageId: input.messageId },
    });
  } catch {
    // Silencioso en caso de desconexión o contingencia de red
  }
}

export async function syncAppBadgeCount(unreadTotal: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(Math.max(0, unreadTotal)).catch(() => {});
}

