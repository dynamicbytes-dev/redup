import * as ExpoCrypto from 'expo-crypto';

declare const global: Record<string, unknown> | undefined;

// Scope global transversal (Hermes, Node, Web, React Native global)
const globalScope =
  typeof globalThis !== 'undefined'
    ? (globalThis as unknown as Record<string, unknown>)
    : typeof global !== 'undefined'
      ? global
      : typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>)
        : ({} as Record<string, unknown>);

// Polyfill de btoa y atob para React Native / Hermes
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function polyfillBtoa(input: string): string {
  const str = String(input);
  let output = '';
  for (
    let block = 0, charCode, i = 0, map = B64_CHARS;
    str.charAt(i | 0) || ((map = '='), i % 1);
    output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
  ) {
    charCode = str.charCodeAt((i += 3 / 4));
    if (charCode > 0xff) {
      throw new Error(
        "'btoa' failed: The string to be encoded contains characters outside of the Latin1 range."
      );
    }
    block = (block << 8) | charCode;
  }
  return output;
}

function polyfillAtob(input: string): string {
  const str = String(input).replace(/[=]+$/, '');
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  let output = '';
  for (
    let bc = 0, bs = 0, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = B64_CHARS.indexOf(buffer);
  }
  return output;
}

if (typeof (globalScope as { btoa?: unknown }).btoa !== 'function') {
  try {
    Object.defineProperty(globalScope, 'btoa', {
      value: polyfillBtoa,
      configurable: true,
      writable: true,
    });
  } catch {
    (globalScope as Record<string, unknown>).btoa = polyfillBtoa;
  }
}

if (typeof (globalScope as { atob?: unknown }).atob !== 'function') {
  try {
    Object.defineProperty(globalScope, 'atob', {
      value: polyfillAtob,
      configurable: true,
      writable: true,
    });
  } catch {
    (globalScope as Record<string, unknown>).atob = polyfillAtob;
  }
}

// Polyfill de TextEncoder y TextDecoder
class PolyfillTextEncoder {
  readonly encoding = 'utf-8';
  encode(input: string = ''): Uint8Array {
    const unescaped = unescape(encodeURIComponent(String(input)));
    const len = unescaped.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = unescaped.charCodeAt(i);
    }
    return bytes;
  }
}

class PolyfillTextDecoder {
  readonly encoding = 'utf-8';
  decode(bytes?: BufferSource): string {
    if (!bytes) return '';
    const uint8 =
      bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(
            ArrayBuffer.isView(bytes)
              ? bytes.buffer
              : (bytes as ArrayBuffer)
          );
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    try {
      return decodeURIComponent(escape(binary));
    } catch {
      return binary;
    }
  }
}

if (typeof (globalScope as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  try {
    Object.defineProperty(globalScope, 'TextEncoder', {
      value: PolyfillTextEncoder,
      configurable: true,
      writable: true,
    });
  } catch {
    (globalScope as Record<string, unknown>).TextEncoder = PolyfillTextEncoder;
  }
}

if (typeof (globalScope as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
  try {
    Object.defineProperty(globalScope, 'TextDecoder', {
      value: PolyfillTextDecoder,
      configurable: true,
      writable: true,
    });
  } catch {
    (globalScope as Record<string, unknown>).TextDecoder = PolyfillTextDecoder;
  }
}

// Polyfill de WebCrypto Subtle Digest
const subtleDigestImpl = async (
  algorithm: string | { name: string },
  data: BufferSource
): Promise<ArrayBuffer> => {
  const rawName = typeof algorithm === 'string' ? algorithm : algorithm?.name;
  const name = String(rawName || 'SHA-256').toUpperCase();

  const algo =
    name === 'SHA-512'
      ? ExpoCrypto.CryptoDigestAlgorithm.SHA512
      : name === 'SHA-384'
        ? ExpoCrypto.CryptoDigestAlgorithm.SHA384
        : name === 'SHA-1'
          ? ExpoCrypto.CryptoDigestAlgorithm.SHA1
          : ExpoCrypto.CryptoDigestAlgorithm.SHA256;

  // ExpoCrypto.digest espera un BufferSource y devuelve Promise<ArrayBuffer>
  return ExpoCrypto.digest(algo, data);
};

const subtleObj = {
  digest: subtleDigestImpl,
};

// Configuración de globalScope.crypto
try {
  const g = globalScope as Record<string, unknown>;
  const currentCrypto = g.crypto as {
    getRandomValues?: typeof ExpoCrypto.getRandomValues;
    subtle?: typeof subtleObj;
  } | undefined;

  if (!currentCrypto) {
    const cryptoInstance = {
      getRandomValues: ExpoCrypto.getRandomValues,
      subtle: subtleObj,
    };
    Object.defineProperty(globalScope, 'crypto', {
      value: cryptoInstance,
      configurable: true,
      writable: true,
    });
    // Garantizar también en global de React Native
    if (typeof global !== 'undefined' && global && global !== globalScope) {
      try {
        global.crypto = cryptoInstance;
      } catch {
        // Ignorar
      }
    }
  } else {
    if (typeof currentCrypto.getRandomValues !== 'function') {
      try {
        currentCrypto.getRandomValues = ExpoCrypto.getRandomValues;
      } catch {
        Object.defineProperty(currentCrypto, 'getRandomValues', {
          value: ExpoCrypto.getRandomValues,
          configurable: true,
          writable: true,
        });
      }
    }
    if (!currentCrypto.subtle) {
      try {
        currentCrypto.subtle = subtleObj;
      } catch {
        Object.defineProperty(currentCrypto, 'subtle', {
          value: subtleObj,
          configurable: true,
          writable: true,
        });
      }
    }
  }
} catch {
  // Ignorar errores en runtime ultra-restringidos
}
