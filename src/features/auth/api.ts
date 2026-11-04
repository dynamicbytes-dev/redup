import * as Linking from 'expo-linking';

import { unregisterPushNotificationsAsync } from '@/features/notifications/api';
import {
  assertRateLimit,
  sanitizeText,
  validateDisplayName,
  validateEmailStrict,
  validatePasswordStrict,
  validateUsernameStrict,
} from '@/lib/security';
import { supabase } from '@/lib/supabase';

export class AppError extends Error {}

export function validateUsername(value: string): string | null {
  return validateUsernameStrict(value);
}

export function validateEmail(value: string): string | null {
  return validateEmailStrict(value);
}

export function validatePassword(value: string, isSignup = true): string | null {
  return validatePasswordStrict(value, isSignup);
}

export function normalizeUsername(value: string): string {
  return sanitizeText(value, 30).toLowerCase().replace(/\s+/g, '');
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const clean = normalizeUsername(username);
  const problem = validateUsernameStrict(clean);
  if (problem) return false;

  const { data, error } = await supabase.rpc('is_username_available', {
    uname: clean,
  });
  if (error) throw new AppError('No pudimos comprobar el usuario. Revisa tu conexión.');
  return Boolean(data);
}

export async function signInWithIdentifier(identifier: string, password: string): Promise<void> {
  const value = sanitizeText(identifier, 254);
  if (!value || !password) throw new AppError('Escribe tu usuario y contraseña.');

  // Rate limiting anti-fuerza bruta: máximo 5 intentos por minuto por identificador
  assertRateLimit(
    `login:${value.toLowerCase()}`,
    5,
    60_000,
    'Demasiados intentos de inicio de sesión.',
  );

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
  const email = sanitizeText(input.email, 254).toLowerCase();
  const username = normalizeUsername(input.username);
  const displayName = sanitizeText(input.displayName, 60);

  // Validación estricta de todos los campos
  const emailProblem = validateEmailStrict(email);
  if (emailProblem) throw new AppError(emailProblem);

  const usernameProblem = validateUsernameStrict(username);
  if (usernameProblem) throw new AppError(usernameProblem);

  const passwordProblem = validatePasswordStrict(input.password, true);
  if (passwordProblem) throw new AppError(passwordProblem);

  const nameProblem = validateDisplayName(displayName);
  if (nameProblem) throw new AppError(nameProblem);

  // Rate limit para registro de cuentas: máx 3 registros por cada 5 minutos por cliente
  assertRateLimit('auth:signup', 3, 300_000, 'Demasiados intentos de registro.');

  if (!(await isUsernameAvailable(username))) {
    throw new AppError('Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { username, display_name: displayName },
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new AppError('Ese correo ya tiene una cuenta. Inicia sesión.');
    }
    if (/duplicate|unique|username_taken|Database error saving new user/i.test(error.message)) {
      throw new AppError('Ese nombre de usuario ya está en uso. No pueden existir nombres de usuario repetidos.');
    }
    throw new AppError('No pudimos crear la cuenta. Inténtalo de nuevo.');
  }

  if (!data.session) {
    throw new AppError('Revisa tu correo para confirmar la cuenta.');
  }
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const value = sanitizeText(identifier, 254);
  if (!value) throw new AppError('Escribe tu usuario o correo.');

  // Rate limit: máx 3 solicitudes en 5 minutos
  assertRateLimit('auth:reset_password', 3, 300_000, 'Demasiadas solicitudes de restablecimiento.');

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
  const problem = validatePasswordStrict(password, true);
  if (problem) throw new AppError(problem);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new AppError('No pudimos cambiar la contraseña.');
}

export async function signOut(): Promise<void> {
  await unregisterPushNotificationsAsync();
  await supabase.auth.signOut();
}
