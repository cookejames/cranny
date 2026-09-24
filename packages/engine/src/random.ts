export const SEED_BITS = 30;
export const MAX_SEED = 2 ** SEED_BITS - 1;

/** Whether `seed` is an integer in `0..MAX_SEED` (30 bits). */
export const isValidSeed = (seed: number) =>
  Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED;

/** mulberry32: returns a function yielding floats in [0, 1). Part of generator v1. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CryptoLike = { getRandomValues<T extends ArrayBufferView>(array: T): T };

/** A random 30-bit seed from the platform CSPRNG (browsers and Node). */
export function randomSeed(): number {
  const { crypto } = globalThis as unknown as { crypto: CryptoLike };
  return crypto.getRandomValues(new Uint32Array(1))[0]! & MAX_SEED;
}
