import * as ExpoCrypto from 'expo-crypto';

/**
 * Módulo de encriptación simétrica autenticada (AES-256-GCM) para datos sensibles.
 * Utiliza las APIs criptográficas nativas para garantizar confidencialidad
 * e integridad contra alteraciones (tampering).
 */

const ENCRYPTION_PREFIX = 'redup:v1:';

/**
 * Deriva una clave de 256 bits a partir de un secreto o identificador compartido
 * usando SHA-256 nativo.
 */
export async function deriveKeyBytes(secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(secret);
  const hash = await ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, rawBytes);
  return new Uint8Array(hash);
}

/**
 * Cifra un texto sensible con AES-GCM-256.
 * Produce una cadena serializada que contiene el IV (nonce), texto cifrado y tag de autenticación.
 */
export async function encryptSensitiveText(
  plaintext: string,
  secretKey: string,
): Promise<string> {
  if (!plaintext) return '';

  const keyBytes = await deriveKeyBytes(secretKey);
  const iv = ExpoCrypto.getRandomBytes(12); // 96-bit IV para GCM
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // Sub-clave WebCrypto importada
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    plaintextBytes as unknown as BufferSource,
  );

  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  // Convertir a Base64 URL-safe
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]!);
  }
  const base64 = btoa(binary);

  return `${ENCRYPTION_PREFIX}${base64}`;
}

/**
 * Descifra un texto previamente encriptado con `encryptSensitiveText`.
 * Si el texto no está cifrado (formato legado), devuelve el texto original sin alterar.
 */
export async function decryptSensitiveText(
  cipherPayload: string,
  secretKey: string,
): Promise<string> {
  if (!cipherPayload) return '';
  if (!cipherPayload.startsWith(ENCRYPTION_PREFIX)) {
    return cipherPayload;
  }

  const base64 = cipherPayload.slice(ENCRYPTION_PREFIX.length);
  const binary = atob(base64);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i);
  }

  const iv = combined.slice(0, 12);
  const encryptedBytes = combined.slice(12);

  const keyBytes = await deriveKeyBytes(secretKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    encryptedBytes as unknown as BufferSource,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
