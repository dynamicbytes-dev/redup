import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Adaptador de almacenamiento seguro para Supabase Auth y credenciales sensibles.
 *
 * Características de seguridad:
 * 1. Chunking en SecureStore: divide valores que excedan los 1000 caracteres en
 *    fragmentos en iOS Keychain y Android EncryptedSharedPreferences (AES-256 respaldado por Keystore),
 *    superando de manera nativa y transparente el límite de ~2048 bytes sin comprometer la seguridad.
 * 2. Cero fallback a texto plano en AsyncStorage en dispositivos móviles.
 * 3. En la Web, utiliza AsyncStorage como adaptador estándar de sesión.
 */

const CHUNK_SIZE = 1000;

async function writeSecureChunks(key: string, value: string): Promise<void> {
  const totalChunks = Math.ceil(value.length / CHUNK_SIZE);

  // Leer cantidad previa para limpiar huérfanos si la nueva cadena es más corta
  const prevCountStr = await SecureStore.getItemAsync(`${key}__chunks_count`).catch(() => null);
  const prevCount = prevCountStr ? parseInt(prevCountStr, 10) : 0;

  // Guardar cada fragmento
  for (let i = 0; i < totalChunks; i++) {
    const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}__chunk_${i}`, chunk, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  }

  // Guardar meta con la cantidad total
  await SecureStore.setItemAsync(`${key}__chunks_count`, String(totalChunks), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });

  // Limpiar chunks obsoletos de escrituras anteriores más largas
  if (prevCount > totalChunks) {
    for (let i = totalChunks; i < prevCount; i++) {
      await SecureStore.deleteItemAsync(`${key}__chunk_${i}`).catch(() => {});
    }
  }

  // Eliminar la clave simple por si antes se guardó sin chunking
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

async function readSecureChunks(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(`${key}__chunks_count`);
  if (!countStr) {
    // Si no tiene chunks, intentar leer la clave directamente
    return await SecureStore.getItemAsync(key);
  }

  const count = parseInt(countStr, 10);
  if (isNaN(count) || count <= 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
    if (part === null) return null; // Fragmento incompleto o corrupto
    parts.push(part);
  }

  return parts.join('');
}

async function removeSecureChunks(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(`${key}__chunks_count`).catch(() => null);
  const count = countStr ? parseInt(countStr, 10) : 0;

  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${key}__chunk_${i}`).catch(() => {});
  }
  await SecureStore.deleteItemAsync(`${key}__chunks_count`).catch(() => {});
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }
    try {
      const val = await readSecureChunks(key);
      if (val !== null) {
        // Limpieza defensiva en AsyncStorage por si quedó un remanente antiguo
        AsyncStorage.removeItem(key).catch(() => {});
        return val;
      }

      // Si no estaba en SecureStore, verificar si existía en AsyncStorage para migrarlo
      const legacyVal = await AsyncStorage.getItem(key).catch(() => null);
      if (legacyVal) {
        await writeSecureChunks(key, legacyVal).catch(() => {});
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacyVal;
      }

      return null;
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (!value) {
      await secureStorage.removeItem(key);
      return;
    }

    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }

    // En móviles: exclusivamente SecureStore mediante chunking respaldado por hardware.
    // Sin fallback a texto plano.
    await writeSecureChunks(key, value);
    // Eliminar de AsyncStorage cualquier residuo antiguo
    await AsyncStorage.removeItem(key).catch(() => {});
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    await removeSecureChunks(key);
    await AsyncStorage.removeItem(key).catch(() => {});
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
