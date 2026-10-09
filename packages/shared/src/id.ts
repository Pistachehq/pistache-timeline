const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

// Typed locally so this package does not depend on DOM or Node type libraries.
const randomSource = (globalThis as unknown as { crypto: RandomSource }).crypto;

/**
 * Generates a random, URL-safe identifier with an optional readable prefix,
 * e.g. `clip_k3j9x0q2m1ab`. Uses the Web Crypto API, which is available in
 * browsers, Electron renderers and Node.js.
 */
export function createId(prefix?: string, length = 16): string {
  const bytes = new Uint8Array(length);
  randomSource.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }
  return prefix ? `${prefix}_${id}` : id;
}
