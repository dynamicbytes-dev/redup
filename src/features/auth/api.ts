import * as Linking from 'expo-linking';

import { unregisterPushNotificationsAsync } from '@/features/notifications/api';
import { supabase } from '@/lib/supabase';

export class AppError extends Error {}

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(value: string): string | null {
  const username = value.trim().toLowerCase();
  if (!username) return 'Elige un nombre de usuario.';
  if (!USERNAME_RE.test(username)) {
    return 'Entre 3 y 20 caracteres: letras minúsculas, números, punto o guion bajo.';
  }
  return null;
}

export function validateEmail(value: string): string | null {
  if (!EMAIL_RE.test(value.trim())) return 'Escribe un correo válido.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 6) return 'La contraseña necesita al menos 6 caracteres.';
  return null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    uname: normalizeUsername(username),
  });
  if (error) throw new AppError('No pudimos comprobar el usuario. Revisa tu conexión.');
  return Boolean(data);
}

export async function signInWithIdentifier(identifier: string, password: string): Promise<void> {
  const value = identifier.trim();
  if (!value || !password) throw new AppError('Escribe tu usuario y contraseña.');

  let email = value;

  if (!value.includes('@')) {
    const { data, error } = await supabase.rpc('resolve_login_email', {
      uname: normalizeUsername(value),
    });
    if (error) throw new AppError('No pudimos iniciar sesión. Inténtalo de nuevo.');
    if (!data) throw new AppError('Usuario o contraseña incorrectos.');
    email = data as string;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AppError('Usuario o contraseña incorrectos.');
}

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
}): Promise<void> {
  const username = normalizeUsername(input.username);

  if (!(await isUsernameAvailable(username))) {
    throw new AppError('Ese nombre de usuario ya está en uso.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { username, display_name: input.displayName.trim() || username },
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new AppError('Ese correo ya tiene una cuenta. Inicia sesión.');
    }
    if (/duplicate|unique/i.test(error.message)) {
      throw new AppError('Ese nombre de usuario ya está en uso.');
    }
    throw new AppError('No pudimos crear la cuenta. Inténtalo de nuevo.');
  }

  if (!data.session) {
    throw new AppError('Revisa tu correo para confirmar la cuenta.');
  }
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const value = identifier.trim();
  if (!value) throw new AppError('Escribe tu usuario o correo.');

  let email: string | null = value.includes('@') ? value : null;

  if (!email) {
    const { data, error } = await supabase.rpc('resolve_login_email', {
      uname: normalizeUsername(value),
    });
    if (error) throw new AppError('No pudimos buscar tu cuenta. Inténtalo de nuevo.');
    email = (data as string | null) ?? null;
  }

  if (!email) throw new AppError('No encontramos ninguna cuenta con ese dato.');

  const redirectTo = Linking.createURL('reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), { redirectTo });

  if (error) {
    throw new AppError('No pudimos enviar el correo. Espera un momento e inténtalo otra vez.');
  }
}

export async function updatePassword(password: string): Promise<void> {
  const problem = validatePassword(password);
  if (problem) throw new AppError(problem);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new AppError('No pudimos cambiar la contraseña.');
}

export async function signOut(): Promise<void> {
  await unregisterPushNotificationsAsync();
  await supabase.auth.signOut();
}
