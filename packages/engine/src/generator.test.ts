import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, generateGrid } from './generator.ts';
import { MAX_SEED, mulberry32, randomSeed } from './random.ts';
import { solve } from './solver.ts';

/**
 * Golden seeds for generator v1. These must NEVER change: share links depend on them.
 * If a change to the PRNG, the draw, the piece set or the solver breaks this test, the change
 * needs a new generator version instead (SPEC.md §4).
 */
const GOLDEN_V1: Array<[seed: number, blocked: number[]]> = [
  [0, [0, 1, 7, 9, 18, 21, 24]],
  [1, [1, 13, 19, 22, 24, 34, 35]],
  [2, [3, 11, 12, 20, 24, 26, 32]],
  [42, [0, 9, 14, 16, 21, 25, 30]],
  [1000, [4, 15, 18, 25, 28, 29, 32]],
  [123456, [8, 10, 12, 13, 20, 28, 35]],
  [987654321, [2, 5, 16, 19, 24, 33, 34]],
  [1073741823, [0, 13, 14, 17, 29, 33, 34]],
  // Seeds whose first draw is unsolvable, locking the retry-from-the-same-stream behaviour.
  [94, [6, 14, 16, 18, 20, 21, 23]],
  [98, [3, 6, 11, 15, 21, 27, 30]],
  [108, [0, 4, 13, 15, 21, 29, 32]],
  [306, [6, 12, 24, 26, 28, 30, 32]],
];

describe('mulberry32', () => {
  it('matches the reference sequence', () => {
    const rand = mulberry32(1);
    expect([rand(), rand(), rand()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });
});

describe('randomSeed', () => {
  it('returns 30-bit integers', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED).toBe(true);
    }
  });
});

describe('generateGrid', () => {
  it.each(GOLDEN_V1)('v1 seed %i produces its golden layout', (seed, blocked) => {
    expect(generateGrid(seed, 1)).toEqual({ version: 1, seed, blocked });
  });

  it('v1 produces the recorded layouts for seeds 0–4999 (checksum)', () => {
    // FNV-1a over every blocked cell of the first 5,000 seeds. Any change to which layouts v1
    // deals (including solver pruning that wrongly rejects a solvable draw) changes this value.
    let hash = 0x811c9dc5;
    for (let seed = 0; seed < 5000; seed++) {
      for (const cell of generateGrid(seed, 1).blocked) {
        hash ^= cell;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
    expect(hash.toString(16).padStart(8, '0')).toBe('9bcd2b71');
  });

  it('defaults to the current version', () => {
    expect(CURRENT_VERSION).toBe(1);
    expect(generateGrid(42).version).toBe(1);
  });

  it('deals 7 distinct, sorted, solvable cells', () => {
    for (let i = 0; i < 300; i++) {
      const { blocked } = generateGrid(i * 104729);
      expect(blocked).toHaveLength(7);
      expect(new Set(blocked).size).toBe(7);
      expect(blocked).toEqual([...blocked].sort((a, b) => a - b));
      expect(blocked.every((c) => c >= 0 && c < 36)).toBe(true);
      expect(solve(blocked)).not.toBeNull();
    }
  });

  it('rejects invalid seeds and versions', () => {
    expect(() => generateGrid(-1)).toThrow(RangeError);
    expect(() => generateGrid(MAX_SEED + 1)).toThrow(RangeError);
    expect(() => generateGrid(1.5)).toThrow(RangeError);
    expect(() => generateGrid(1, 2)).toThrow(/Unsupported grid version/);
  });
});
