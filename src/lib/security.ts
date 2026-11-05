import * as ExpoCrypto from 'expo-crypto';

/**
 * Elimina caracteres de control invisibles, overrides bidireccionales y bytes nulos,
 * normalizando el texto en formato Unicode NFC.
 */
export function sanitizeText(input: string, maxLength = 4000): string {
  if (!input) return '';
  const cleaned = input
    .normalize('NFC')
    // Eliminar caracteres de control ASCII y caracteres zero-width / bidi spoofing
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim();

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Lista de nombres de usuario reservados para evitar suplantación de identidad o cuentas del sistema.
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'administrador',
  'root',
  'system',
  'sistema',
  'support',
  'soporte',
  'redup',
  'oficial',
  'official',
  'security',
  'seguridad',
  'moderator',
  'moderador',
  'help',
  'ayuda',
  'api',
  'bot',
  'null',
  'undefined',
  'anonymous',
  'anonimo',
]);

/**
 * Dominios de correo desechables comúnmente usados por bots.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'fakeinbox.com',
  'throwawaymail.com',
]);

const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'qwerty',
  'qwerty123',
  '11111111',
  '00000000',
  'abc12345',
  'iloveyou',
  'admin123',
  'redup123',
]);

export function validateDisplayName(value: string): string | null {
  const clean = sanitizeText(value, 60);
  if (!clean) return 'Escribe tu nombre.';
  if (clean.length < 2) return 'El nombre debe tener al menos 2 caracteres.';
  if (clean.length > 60) return 'El nombre no puede superar los 60 caracteres.';
  if (/[<>]/.test(clean) || /javascript:|<script|onerror=/i.test(clean)) {
    return 'El nombre contiene caracteres no permitidos.';
  }
  if (/https?:\/\/|www\./i.test(clean)) {
    return 'El nombre no puede contener enlaces web.';
  }
  if (!/[\p{L}\p{N}]/u.test(clean)) {
    return 'El nombre debe incluir letras o números válidos.';
  }
  return null;
}

export function validateUsernameStrict(
  value: string,
  options?: { allowExistingReserved?: string },
): string | null {
  const username = sanitizeText(value, 30).toLowerCase().replace(/\s+/g, '');
  if (!username) return 'Elige un nombre de usuario.';
  if (username.length < 3 || username.length > 20) {
    return 'Entre 3 y 20 caracteres: letras minúsculas, números, punto o guion bajo.';
  }
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    return 'Solo letras minúsculas (a-z), números (0-9), punto (.) o guion bajo (_).';
  }
  if (/^[._]|[._]$/.test(username)) {
    return 'El usuario no puede empezar ni terminar con punto o guion bajo.';
  }
  if (/[._]{2,}/.test(username)) {
    return 'El usuario no puede tener dos puntos o guiones bajos seguidos.';
  }
  if (
    RESERVED_USERNAMES.has(username) &&
    username !== options?.allowExistingReserved?.toLowerCase()
  ) {
    return 'Ese nombre de usuario está reservado por el sistema.';
  }
  return null;
}

export function validateEmailStrict(value: string): string | null {
  const clean = sanitizeText(value, 254).toLowerCase();
  if (!clean) return 'Escribe tu correo electrónico.';
  if (clean.length > 254) return 'El correo es demasiado largo.';
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(clean) || clean.includes('..')) {
    return 'Escribe un correo electrónico válido.';
  }
  const domain = clean.split('@')[1] ?? '';
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return 'No se permiten correos temporales o desechables.';
  }
  return null;
}

export function validatePasswordStrict(value: string, isSignup = true): string | null {
  if (!value) return 'Escribe tu contraseña.';
  if (value.length < (isSignup ? 8 : 6)) {
    return `La contraseña necesita al menos ${isSignup ? 8 : 6} caracteres.`;
  }
  if (value.length > 128) {
    return 'La contraseña no puede superar los 128 caracteres.';
  }
  if (isSignup) {
    if (COMMON_WEAK_PASSWORDS.has(value.toLowerCase())) {
      return 'Esa contraseña es muy común e insegura. Elige una más fuerte.';
    }
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
      return 'Incluye al menos una minúscula, una mayúscula y un número.';
    }
  }
  return null;
}

export function validateAboutText(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = sanitizeText(value, 200);
  if (clean.length > 139) {
    return 'El estado de perfil no puede superar los 139 caracteres.';
  }
  if (/[<>]/.test(clean) || /javascript:|<script/i.test(clean)) {
    return 'El estado contiene caracteres no permitidos.';
  }
  return null;
}

export function validateGroupName(value: string): string | null {
  const clean = sanitizeText(value, 80);
  if (!clean) return 'Escribe un nombre para el grupo.';
  if (clean.length < 2) return 'El nombre del grupo debe tener al menos 2 caracteres.';
  if (clean.length > 60) return 'El nombre del grupo no puede superar los 60 caracteres.';
  if (/[<>]/.test(clean)) return 'El nombre del grupo contiene caracteres no permitidos.';
  return null;
}

export function validateMessageBody(value: string): { clean: string; error: string | null } {
  const clean = sanitizeText(value, 4000);
  if (!clean) {
    return { clean: '', error: 'El mensaje no puede estar vacío.' };
  }
  if (clean.length > 4000) {
    return { clean: clean.slice(0, 4000), error: 'El mensaje supera el límite de 4000 caracteres.' };
  }
  return { clean, error: null };
}

export function validateStatusCaption(value: string): { clean: string; error: string | null } {
  const clean = sanitizeText(value, 320);
  if (!clean) {
    return { clean: '', error: 'Escribe algo para tu estado.' };
  }
  if (clean.length > 320) {
    return { clean: clean.slice(0, 320), error: 'El estado no puede superar los 320 caracteres.' };
  }
  return { clean, error: null };
}

/* -------------------------------------------------------------------------- */
/* Protección Anti-Bots: Rate Limiter en memoria + Honeypot + Tiempo mínimo   */
/* -------------------------------------------------------------------------- */

const rateBuckets = new Map<string, number[]>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Limitador de frecuencia por ventana deslizante (sliding window) para frenar fuerza bruta y spam.
 */
export function checkRateLimit(
  actionKey: string,
  maxAttempts: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const previous = (rateBuckets.get(actionKey) ?? []).filter((ts) => ts > cutoff);

  if (previous.length >= maxAttempts) {
    const oldest = previous[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateBuckets.set(actionKey, previous);
    return { allowed: false, retryAfterSeconds };
  }

  previous.push(now);
  rateBuckets.set(actionKey, previous);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function assertRateLimit(
  actionKey: string,
  maxAttempts: number,
  windowMs: number,
  errorLabel = 'Demasiados intentos seguidos.',
): void {
  const res = checkRateLimit(actionKey, maxAttempts, windowMs);
  if (!res.allowed) {
    throw new Error(`${errorLabel} Espera ${res.retryAfterSeconds} s antes de volver a intentarlo.`);
  }
}

/**
 * Valida señales anti-bot de un formulario:
 * 1. El campo trampa (honeypot) debe estar completamente vacío.
 * 2. El usuario debe haber tardado un tiempo humano mínimo (`minInteractionMs`) en completar el formulario.
 */
export function verifyBotSignals(input: {
  honeypot: string;
  mountedAt: number;
  minInteractionMs?: number;
}): string | null {
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return 'Actividad automatizada detectada. Solicitud bloqueada.';
  }
  const elapsed = Date.now() - input.mountedAt;
  const minMs = input.minInteractionMs ?? 1200;
  if (elapsed < minMs) {
    return 'Por favor completa el formulario con calma antes de enviarlo.';
  }
  return null;
}

export type HumanChallenge = {
  id: string;
  question: string;
  expectedAnswer: string;
};

/**
 * Genera un reto aritmético aleatorio con entropía criptográfica (`expo-crypto`)
 * para verificar que quien interactúa con el formulario no es un script automatizado.
 */
export function generateHumanChallenge(): HumanChallenge {
  const bytes = ExpoCrypto.getRandomBytes(4);
  const a = (bytes[0]! % 8) + 2; // 2..9
  const b = (bytes[1]! % 8) + 1; // 1..8
  const useAddition = bytes[2]! % 2 === 0 || a <= b;

  const answer = useAddition ? a + b : a - b;
  const symbol = useAddition ? '+' : '−';

  return {
    id: ExpoCrypto.randomUUID(),
    question: `¿Cuánto es ${a} ${symbol} ${b}?`,
    expectedAnswer: String(answer),
  };
}

/**
 * Previene Mass Assignment (Manipulación de Campos):
 * Filtra un objeto arbitrario devolviendo únicamente los campos permitidos en la lista blanca,
 * eliminando claves inyectadas como `id`, `created_at`, `role`, `is_admin`, etc.
 */
export function sanitizePayload<T extends Record<string, unknown>, K extends keyof T>(
  raw: T,
  allowedKeys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      result[key] = raw[key];
    }
  }
  return result;
}


