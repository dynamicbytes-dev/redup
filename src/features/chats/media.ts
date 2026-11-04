import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { ChatError } from './api';

export type PickedMedia = {
  kind: 'image' | 'audio' | 'file';
  localUri: string;
  fileName: string;
  mimeType: string;
  ext: string;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

function sanitizeExtension(nameOrUri: string, fallback: string): string {
  const clean = nameOrUri.split('?')[0]?.split('#')[0] ?? '';
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(clean);
  return (match?.[1] ?? fallback).toLowerCase();
}

async function compressChatImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ uri: string; width: number; height: number; size: number | null }> {
  const origW = asset.width || 1280;
  const origH = asset.height || 1280;
  const targetWidth = Math.min(origW, 1280);
  const targetHeight = Math.round((origH * targetWidth) / origW);

  const context = ImageManipulator.manipulate(asset.uri);
  if (origW > 1280) {
    context.resize({ width: targetWidth });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });

  let size: number | null = asset.fileSize ?? null;
  if (Platform.OS !== 'web') {
    try {
      const f = new File(saved.uri);
      if (f.size) size = f.size;
    } catch {
      // Ignorar si no se puede leer el tamaño local
    }
  }

  return {
    uri: saved.uri,
    width: saved.width || targetWidth,
    height: saved.height || targetHeight,
    size,
  };
}

export async function pickChatImageFromLibrary(): Promise<PickedMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ChatError('Necesitamos permiso para acceder a tu galería de fotos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const compressed = await compressChatImage(asset);

  return {
    kind: 'image',
    localUri: compressed.uri,
    fileName: asset.fileName ?? `foto-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    ext: 'jpg',
    size: compressed.size,
    width: compressed.width,
    height: compressed.height,
  };
}

export async function pickChatImageFromCamera(): Promise<PickedMedia | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new ChatError('Necesitamos permiso para usar la cámara.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const compressed = await compressChatImage(asset);

  return {
    kind: 'image',
    localUri: compressed.uri,
    fileName: asset.fileName ?? `camara-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    ext: 'jpg',
    size: compressed.size,
    width: compressed.width,
    height: compressed.height,
  };
}

export async function pickChatDocument(): Promise<PickedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const ext = sanitizeExtension(asset.name || asset.uri, 'bin');

  return {
    kind: 'file',
    localUri: asset.uri,
    fileName: asset.name || `documento.${ext}`,
    mimeType: asset.mimeType || 'application/octet-stream',
    ext,
    size: asset.size ?? null,
  };
}

async function readUriBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const file = new File(uri);
  return file.arrayBuffer();
}

export async function uploadChatMedia(input: {
  conversationId: string;
  messageId: string;
  media: PickedMedia;
}): Promise<{ path: string; meta: Record<string, unknown> }> {
  const { conversationId, messageId, media } = input;
  const ext = sanitizeExtension(media.ext || media.fileName, 'bin');
  const path = `${conversationId}/${messageId}.${ext}`;

  const buffer = await readUriBuffer(media.localUri);

  const { error } = await supabase.storage
    .from('media')
    .upload(path, buffer, { contentType: media.mimeType, upsert: true });

  if (error) {
    throw new ChatError('No pudimos subir el archivo adjunto.');
  }

  const meta: Record<string, unknown> = {
    name: media.fileName,
    mimeType: media.mimeType,
    size: media.size ?? buffer.byteLength,
  };
  if (media.width) meta.width = media.width;
  if (media.height) meta.height = media.height;

  return { path, meta };
}

