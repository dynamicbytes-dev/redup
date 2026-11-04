import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export class ProfileError extends Error {}

export async function pickAvatarImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ProfileError('Necesitamos permiso para acceder a tus fotos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function compressToJpeg(uri: string, width = 512): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return saved.uri;
}

export async function uploadAvatar(
  userId: string,
  localUri: string,
  previousPath: string | null,
): Promise<string> {
  const compressed = await compressToJpeg(localUri);
  const file = new File(compressed);
  const buffer = await file.arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw new ProfileError('No pudimos subir la foto. Inténtalo de nuevo.');

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) throw new ProfileError('La foto se subió pero no pudimos guardarla.');

  if (previousPath) {
    await supabase.storage.from('avatars').remove([previousPath]);
  }

  return path;
}

export async function updateProfile(
  userId: string,
  input: { display_name: string; username: string; about: string | null },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: input.display_name.trim(),
      username: input.username.trim().toLowerCase(),
      about: input.about?.trim() || null,
    })
    .eq('id', userId)
    .select('id, username, display_name, avatar_path, about, last_seen_at, created_at')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new ProfileError('Ese nombre de usuario ya está en uso.');
    }
    throw new ProfileError('No pudimos guardar los cambios.');
  }

  return data as Profile;
}
