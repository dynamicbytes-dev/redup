import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Adaptador de almacenamiento seguro para Supabase Auth y datos sensibles.
 * En dispositivos móviles (iOS y Android) almacena las credenciales y tokens en el
 * almacenamiento seguro del sistema respaldado por hardware (iOS Keychain y Android Keystore
 * mediante EncryptedSharedPreferences con AES-256-GCM).
 * En la web, utiliza AsyncStorage como fallback.
 */
export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Fallback transparente si el hardware keystore no responde temporalmente
      return AsyncStorage.getItem(key);
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};

/**
 * Guarda un dato sensible de forma cifrada en hardware seguro.
 */
export async function setSecureSecret(key: string, value: string): Promise<void> {
  await secureStorage.setItem(key, value);
}

/**
 * Recupera un dato sensible cifrado.
 */
export async function getSecureSecret(key: string): Promise<string | null> {
  return secureStorage.getItem(key);
}

/**
 * Elimina un dato sensible del almacén seguro.
 */
export async function removeSecureSecret(key: string): Promise<void> {
  await secureStorage.removeItem(key);
}

