import { mulberry32 } from '@cranny/engine';
import type { RandomSource } from '../random.ts';

/** A deterministic `RandomSource` for tests, drawn from mulberry32. */
export function seededRandom(seed: number): RandomSource {
  const next = mulberry32(seed);
  return (count) => Array.from({ length: count }, () => Math.floor(next() * 2 ** 32));
}
