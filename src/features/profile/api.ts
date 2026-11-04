import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  assertRateLimit,
  sanitizeText,
  validateAboutText,
  validateDisplayName,
  validateUsernameStrict,
} from '@/lib/security';
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
  const cleanDisplayName = sanitizeText(input.display_name, 60);
  const cleanUsername = sanitizeText(input.username, 30).toLowerCase().replace(/\s+/g, '');
  const cleanAbout = input.about ? sanitizeText(input.about, 139) : null;

  // Validación estricta de inputs
  const nameProblem = validateDisplayName(cleanDisplayName);
  if (nameProblem) throw new ProfileError(nameProblem);

  const usernameProblem = validateUsernameStrict(cleanUsername);
  if (usernameProblem) throw new ProfileError(usernameProblem);

  const aboutProblem = validateAboutText(cleanAbout);
  if (aboutProblem) throw new ProfileError(aboutProblem);

  // Anti-bot rate limit: máx 10 actualizaciones de perfil cada minuto por usuario
  assertRateLimit(`profile:${userId}`, 10, 60_000, 'Demasiados cambios de perfil en poco tiempo.');

  // Comprobar que ningún otro perfil tenga ya este username
  const { data: conflict } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', cleanUsername)
    .neq('id', userId)
    .maybeSingle();

  if (conflict) {
    throw new ProfileError(
      'Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.',
    );
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: cleanDisplayName,
      username: cleanUsername,
      about: cleanAbout,
    })
    .eq('id', userId)
    .select('id, username, display_name, avatar_path, about, last_seen_at, created_at')
    .single();

  if (error) {
    if (/duplicate|unique|23505/i.test(`${error.code ?? ''} ${error.message}`)) {
      throw new ProfileError(
        'Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.',
      );
    }
    throw new ProfileError('No pudimos guardar los cambios.');
  }

  return data as Profile;
}
