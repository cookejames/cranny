import { BLOCKED_COUNT, CELL_COUNT } from './pieces.ts';
import { isValidSeed, mulberry32 } from './random.ts';
import { solve } from './solver.ts';
import type { Cell, Grid } from './types.ts';

/** Generator version. Bump it (keeping every older version) if anything that affects output changes. */
export const CURRENT_VERSION = 1;
export const SUPPORTED_VERSIONS: readonly number[] = [1];
const MAX_ATTEMPTS = 10_000;

/**
 * Generator v1 — FROZEN. mulberry32(seed); each attempt shuffles a fresh `0..35` with a partial
 * Fisher–Yates to pick 7 cells, continuing the same PRNG stream until `solve` succeeds.
 * Output is locked by golden-seed tests.
 */
function generateV1(seed: number): Cell[] {
  const rand = mulberry32(seed);
  // About 2.5% of draws are unsolvable, so this cap is never reached unless `solve` is broken;
  // it turns that bug into an error instead of a hang. It doesn't affect any real output.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cells = Array.from({ length: CELL_COUNT }, (_, i) => i);
    for (let i = 0; i < BLOCKED_COUNT; i++) {
      const j = i + Math.floor(rand() * (CELL_COUNT - i));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    const blocked = cells.slice(0, BLOCKED_COUNT).sort((a, b) => a - b);
    if (solve(blocked)) return blocked;
  }
  throw new Error(`No solvable layout for seed ${seed} after ${MAX_ATTEMPTS} attempts`);
}

/**
 * The grid for a seed: always the same 7 blocked cells for the same seed and version, and always
 * solvable.
 *
 * @param version - Generator version; old versions stay available so old share links still work.
 * @throws RangeError if the seed isn't a 30-bit integer or the version isn't supported.
 */
export function generateGrid(seed: number, version: number = CURRENT_VERSION): Grid {
  if (!isValidSeed(seed)) throw new RangeError(`Seed must be an integer in 0..2^30-1, got ${seed}`);
  switch (version) {
    case 1:
      return { version, seed, blocked: generateV1(seed) };
    default:
      throw new RangeError(`Unsupported grid version ${version}`);
  }
}
