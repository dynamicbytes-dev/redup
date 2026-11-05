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

  if (value.includes('@')) {
    const { error } = await supabase.auth.signInWithPassword({ email: value, password });
    if (error) throw new AppError('Usuario o contraseña incorrectos.');
    return;
  }

  // Si inicia con username, autenticamos a través de la Edge Function en el servidor.
  // Esto elimina completamente la exposición y enumeración de correos electrónicos.
  const { data, error } = await supabase.functions.invoke('auth-login', {
    body: { identifier: value, password },
  });

  if (error || !data?.session) {
    throw new AppError('Usuario o contraseña incorrectos.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (sessionError) {
    throw new AppError('No pudimos iniciar tu sesión de forma segura.');
  }
}

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
}): Promise<{ needsConfirmation: boolean }> {
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
    return { needsConfirmation: true };
  }

  return { needsConfirmation: false };
}

export async function requestPasswordReset(emailInput: string): Promise<string> {
  const email = sanitizeText(emailInput, 254).toLowerCase().trim();
  if (!email) {
    throw new AppError('Escribe el correo electrónico con el que te registraste.');
  }

  const problem = validateEmailStrict(email);
  if (problem) {
    throw new AppError('Ingresa un correo electrónico válido (el mismo con el que te registraste).');
  }

  // Rate limit: máx 3 solicitudes en 5 minutos
  assertRateLimit('auth:reset_password', 3, 300_000, 'Demasiadas solicitudes de restablecimiento.');

  const redirectTo = Linking.createURL('reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    throw new AppError('No pudimos enviar el correo. Espera un momento e inténtalo otra vez.');
  }

  return email;
}

export async function verifyPasswordResetOtp(email: string, token: string): Promise<void> {
  const cleanEmail = sanitizeText(email, 254).toLowerCase();
  const cleanToken = token.trim();

  if (!cleanEmail || !cleanToken) {
    throw new AppError('Escribe tu correo y el código de 6 dígitos.');
  }

  // Rate limiting anti-fuerza bruta de OTP: máx 5 intentos en 5 minutos
  assertRateLimit(
    `auth:verify_otp:${cleanEmail}`,
    5,
    300_000,
    'Demasiados intentos de verificación de código.',
  );

  const { error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'recovery',
  });

  if (error) {
    throw new AppError('El código de 6 dígitos es incorrecto o ha expirado.');
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

/**
 * Elimina definitivamente la cuenta del usuario en cumplimiento de las directrices
 * de App Store (Guideline 5.1.1(v)) y normativas de privacidad (GDPR / CCPA).
 * Borra permanentemente los datos personales, mensajes, contactos, estados y archivos en Storage.
 */
export async function deleteAccount(): Promise<void> {
  await unregisterPushNotificationsAsync().catch(() => {});
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    throw new AppError('No pudimos eliminar la cuenta. Por favor, inténtalo de nuevo.');
  }
  await supabase.auth.signOut().catch(() => {});
}
