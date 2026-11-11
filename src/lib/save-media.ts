import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

export type SaveResult = {
  success: boolean;
  message: string;
};

/**
 * Normaliza o genera un nombre de archivo seguro.
 */
function sanitizeFilename(raw: string, fallback: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean || fallback;
}

/**
 * Descarga una URI remota a un archivo temporal local.
 */
async function ensureLocalFile(
  uri: string,
  suggestedName?: string,
): Promise<{ localUri: string; filename: string }> {
  // Si ya es un archivo local en el dispositivo
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    const filename = suggestedName || uri.split('/').pop() || 'media';
    return { localUri: uri, filename };
  }

  const rawFilename = suggestedName || uri.split('?')[0].split('/').pop() || `media_${Date.now()}`;
  const filename = sanitizeFilename(rawFilename, `media_${Date.now()}`);

  // Usar expo-file-system (Paths.cache o File.downloadFileAsync)
  if (FileSystem.File && FileSystem.Paths?.cache) {
    const destination = new FileSystem.File(FileSystem.Paths.cache, filename);
    const downloaded = await FileSystem.File.downloadFileAsync(uri, destination);
    return { localUri: downloaded.uri, filename };
  }

  // Fallback para web o entornos legacy
  const fallbackPath = `${FileSystem.Paths?.cache?.uri ?? ''}/${filename}`;
  if (typeof (FileSystem as unknown as { downloadAsync?: unknown }).downloadAsync === 'function') {
    const legacy = FileSystem as unknown as {
      downloadAsync: (url: string, path: string) => Promise<{ uri: string }>;
    };
    const res = await legacy.downloadAsync(uri, fallbackPath);
    return { localUri: res.uri, filename };
  }

  return { localUri: uri, filename };
}

/**
 * Guarda una imagen directamente en la galería / carrete de fotos del dispositivo.
 */
export async function saveImageToGallery(
  uri: string,
  suggestedName?: string,
): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    try {
      const link = document.createElement('a');
      link.href = uri;
      link.download = suggestedName || 'imagen.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { success: true, message: 'Descarga iniciada' };
    } catch {
      return { success: false, message: 'No soportado en web' };
    }
  }

  try {
    const { localUri } = await ensureLocalFile(
      uri,
      suggestedName || `foto_${Date.now()}.jpg`,
    );

    // Solicitar permisos de galería
    const permission = await requestPermissionsAsync();
    if (permission.granted) {
      await Asset.create(localUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return { success: true, message: 'Imagen guardada en tu galería 📸' };
    }

    // Si el usuario no otorgó permisos directos a la galería, usar el menú de compartir nativo
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(localUri, {
        dialogTitle: 'Guardar imagen',
        mimeType: 'image/jpeg',
      });
      return { success: true, message: 'Menú para guardar abierto' };
    }

    return {
      success: false,
      message: 'Se requiere permiso de acceso a la galería para guardar fotos.',
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      message: `No pudimos guardar la imagen: ${errMessage}`,
    };
  }
}

/**
 * Guarda o exporta un documento / archivo al almacenamiento del dispositivo
 * (Descargas, Archivos, Google Drive o cualquier app gestora de archivos).
 */
export async function saveDocumentToDevice(
  uri: string,
  filename: string,
  mimeType?: string,
): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    try {
      const link = document.createElement('a');
      link.href = uri;
      link.download = filename || 'archivo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { success: true, message: 'Descarga iniciada' };
    } catch {
      return { success: false, message: 'No soportado en web' };
    }
  }

  try {
    const { localUri } = await ensureLocalFile(uri, filename);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(localUri, {
        dialogTitle: `Guardar ${filename}`,
        mimeType: mimeType || 'application/octet-stream',
        UTI: mimeType || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return { success: true, message: 'Archivo descargado' };
    }

    return {
      success: false,
      message: 'No hay aplicación disponible para guardar el archivo en este dispositivo.',
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      message: `No pudimos guardar el archivo: ${errMessage}`,
    };
  }
}

/**
 * Comparte cualquier imagen o archivo a través de la hoja de compartir nativa.
 */
export async function shareLocalOrRemoteMedia(
  uri: string,
  filename?: string,
  mimeType?: string,
): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert('Compartir', 'La función de compartir no está disponible en este dispositivo.');
    return;
  }

  try {
    const { localUri } = await ensureLocalFile(uri, filename);
    await Sharing.shareAsync(localUri, {
      dialogTitle: filename ? `Compartir ${filename}` : 'Compartir',
      mimeType: mimeType || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al compartir';
    Alert.alert('Error', msg);
  }
}
