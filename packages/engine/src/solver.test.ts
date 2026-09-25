import { describe, expect, it } from 'vitest';
import { isSolved } from './board.ts';
import { generateGrid } from './generator.ts';
import { orientationsOf } from './geometry.ts';
import { BLOCKED_COUNT, CELL_COUNT, PIECE_IDS } from './pieces.ts';
import { mulberry32 } from './random.ts';
import { solve } from './solver.ts';
import type { Cell } from './types.ts';

/** High-resolution time in ms (the engine has no DOM or Node types, so read it off `globalThis`). */
const now = () => (globalThis as unknown as { performance: { now(): number } }).performance.now();

/** `count` random layouts of 7 distinct sorted cells, reproducible from `seed`. Not necessarily solvable. */
function randomLayouts(count: number, seed: number): Cell[][] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const cells = new Set<Cell>();
    while (cells.size < BLOCKED_COUNT) cells.add(Math.floor(rand() * CELL_COUNT));
    return [...cells].sort((a, b) => a - b);
  });
}

/**
 * Independent, deliberately simple reference: fills the first empty cell with every placement of
 * every unused piece that covers it. No shared code with `solve` beyond the piece shapes.
 */
function referenceSolvable(blocked: readonly Cell[]): boolean {
  const placementsCovering: Array<Array<{ piece: number; cells: Cell[] }>> = Array.from(
    { length: CELL_COUNT },
    () => [],
  );
  PIECE_IDS.forEach((id, piece) => {
    for (const shape of orientationsOf(id)) {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 6; col++) {
          if (!shape.every(([r, c]) => row + r < 6 && col + c < 6)) continue;
          const cells = shape.map(([r, c]) => (row + r) * 6 + col + c);
          for (const cell of cells) placementsCovering[cell]!.push({ piece, cells });
        }
      }
    }
  });
  const filled = new Array<boolean>(CELL_COUNT).fill(false);
  for (const cell of blocked) filled[cell] = true;
  const used = new Array<boolean>(PIECE_IDS.length).fill(false);
  /** Covers the first empty cell with each fitting placement in turn; true once all nine are placed. */
  const search = (): boolean => {
    const empty = filled.indexOf(false);
    if (empty < 0) return used.every(Boolean);
    for (const { piece, cells } of placementsCovering[empty]!) {
      if (used[piece] || cells.some((cell) => filled[cell])) continue;
      used[piece] = true;
      for (const cell of cells) filled[cell] = true;
      if (search()) return true;
      used[piece] = false;
      for (const cell of cells) filled[cell] = false;
    }
    return false;
  };
  return search();
}

describe('solve', () => {
  it('solves the design prototype layout', () => {
    const blocked = [3, 8, 13, 18, 19, 24, 34];
    const placements = solve(blocked);
    expect(placements).not.toBeNull();
    expect(isSolved({ grid: { version: 1, seed: 0, blocked }, placements: placements! })).toBe(
      true,
    );
  });

  it('returns null for a layout that cannot be filled', () => {
    // Bottom-right pocket that no combination of pieces fits.
    expect(solve([16, 22, 27, 29, 32, 34, 35])).toBeNull();
  });

  it('returns null when two single squares are isolated (there is only one Single piece)', () => {
    // Cells 0 and 5 are each cut off by blockers at 1, 6 and 4, 11.
    expect(solve([1, 4, 6, 11, 20, 27, 33])).toBeNull();
  });

  it.each([
    ['too few cells', [0, 1, 2, 3, 4, 5]],
    ['too many cells', [0, 1, 2, 3, 4, 5, 6, 7]],
    ['a duplicate', [0, 0, 1, 2, 3, 4, 5]],
    ['a cell off the board', [0, 1, 2, 3, 4, 5, 36]],
    ['a negative cell', [-1, 1, 2, 3, 4, 5, 6]],
    ['a fractional cell', [0.5, 1, 2, 3, 4, 5, 6]],
  ])('returns null for invalid input: %s', (_, blocked) => {
    expect(solve(blocked)).toBeNull();
  });

  it('is deterministic', () => {
    const blocked = [0, 1, 7, 9, 18, 21, 24];
    expect(solve(blocked)).toEqual(solve(blocked));
  });

  it('agrees with an independent reference solver', () => {
    // Guards completeness: pruning that wrongly rejected solvable layouts would change which
    // grids generator v1 deals. Include known unsolvable layouts so both answers are exercised.
    const layouts = [
      ...randomLayouts(400, 31),
      [16, 22, 27, 29, 32, 34, 35],
      [1, 4, 6, 11, 20, 27, 33],
      [0, 19, 21, 23, 31, 33, 35],
    ];
    let unsolvable = 0;
    for (const blocked of layouts) {
      const expected = referenceSolvable(blocked);
      if (!expected) unsolvable++;
      expect(solve(blocked) !== null, JSON.stringify(blocked)).toBe(expected);
    }
    expect(unsolvable).toBeGreaterThanOrEqual(3);
  });

  it('only ever returns valid solutions', () => {
    for (const blocked of randomLayouts(2000, 7)) {
      const placements = solve(blocked);
      if (placements) {
        expect(isSolved({ grid: { version: 1, seed: 0, blocked }, placements })).toBe(true);
      }
    }
  });

  it('has no performance blow-ups (regression guard; see `pnpm bench` for the real budget)', () => {
    // Timings under Vitest run ~2.5× slower than plain Node, so this bound only catches large
    // regressions (the first solver took 560 ms on some layouts). `bench/solver.ts` measures the
    // specs/2026-09-25-single-player/SPEC.md §4 budget properly.
    const layouts = [
      [0, 19, 21, 23, 31, 33, 35], // slowest known layout (unsolvable)
      [1, 5, 18, 27, 29, 30, 32],
      [0, 2, 21, 23, 24, 33, 35],
      ...randomLayouts(2000, 99),
      ...Array.from({ length: 1000 }, (_, i) => generateGrid(i * 7919).blocked),
    ];
    for (const blocked of randomLayouts(500, 5)) solve(blocked); // warm the JIT
    let worst = 0;
    for (const blocked of layouts) {
      const start = now();
      solve(blocked);
      worst = Math.max(worst, now() - start);
    }
    expect(worst).toBeLessThan(150);
  });
});
