import { MAX_SEED } from '@cranny/engine';

/**
 * A source of uniformly random unsigned 32-bit integers. The package has no DOM types, so the
 * caller supplies it: `cryptoRandom` in the app, a seeded sequence in tests.
 */
export type RandomSource = (count: number) => ArrayLike<number>;

type CryptoLike = { getRandomValues<T extends ArrayBufferView>(array: T): T };

/** `count` random 32-bit integers from the platform CSPRNG (`crypto.getRandomValues`). */
export const cryptoRandom: RandomSource = (count) => {
  const { crypto } = globalThis as unknown as { crypto: CryptoLike };
  return crypto.getRandomValues(new Uint32Array(count));
};

/** Player ids are 22 characters: base64url of 128 random bits, without padding. */
const PLAYER_ID = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A new random player id (SPEC §5.1). */
export function randomPlayerId(random: RandomSource): string {
  const words = random(4);
  const bytes: number[] = [];
  for (let i = 0; i < 4; i++) {
    const w = words[i]! >>> 0;
    bytes.push(w >>> 24, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64URL[(n >>> 18) & 63]! + BASE64URL[(n >>> 12) & 63]!;
    if (i + 1 < bytes.length) out += BASE64URL[(n >>> 6) & 63]!;
    if (i + 2 < bytes.length) out += BASE64URL[n & 63]!;
  }
  return out;
}

/** Whether a value is a well-formed player id. */
export const isPlayerId = (value: unknown): value is string =>
  typeof value === 'string' && PLAYER_ID.test(value);

/** A random 30-bit grid seed. */
export const randomSeedFrom = (random: RandomSource): number => random(1)[0]! & MAX_SEED;

/**
 * A random element of a non-empty list. The modulo bias is below 2^-20 for lists of a few
 * thousand, which doesn't matter here.
 */
export function pick<T>(list: readonly T[], value: number): T {
  return list[(value >>> 0) % list.length]!;
}
