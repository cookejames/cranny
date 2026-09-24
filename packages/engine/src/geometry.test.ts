import { describe, expect, it } from 'vitest';
import { cellsOf, orientationsOf, shapeOf, uniqueOrientations } from './geometry.ts';
import { PIECE_IDS, PIECES } from './pieces.ts';
import type { PieceId } from './types.ts';

describe('pieces', () => {
  it('has nine pieces covering 29 squares', () => {
    expect(PIECE_IDS).toHaveLength(9);
    expect(PIECE_IDS.reduce((sum, id) => sum + PIECES[id].cells.length, 0)).toBe(29);
  });
});

describe('orientationsOf', () => {
  const expected: Record<PieceId, number> = {
    I4: 2,
    O4: 1,
    T4: 4,
    S4: 4,
    L4: 8,
    I3: 2,
    V3: 4,
    D2: 2,
    M1: 1,
  };

  it.each(PIECE_IDS)('%s has the unique orientation count from the spec', (id) => {
    expect(orientationsOf(id)).toHaveLength(expected[id]);
  });

  it('returns normalised, sorted shapes', () => {
    for (const id of PIECE_IDS) {
      for (const shape of orientationsOf(id)) {
        expect(Math.min(...shape.map(([r]) => r))).toBe(0);
        expect(Math.min(...shape.map(([, c]) => c))).toBe(0);
        const sorted = [...shape].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        expect(shape).toEqual(sorted);
      }
    }
  });

  it('pairs each unique shape with an orientation that produces it', () => {
    for (const id of PIECE_IDS) {
      for (const { orientation, shape } of uniqueOrientations(id)) {
        expect(shapeOf(id, orientation)).toEqual(shape);
      }
    }
  });
});

describe('shapeOf', () => {
  it('rotates clockwise', () => {
    // I4 horizontal → vertical
    expect(shapeOf('I4', { rot: 1, flip: false })).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    // L4: vertical bar with foot to the right → rotated clockwise, foot at bottom-left
    expect(shapeOf('L4', { rot: 1, flip: false })).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
  });

  it('throws on an invalid orientation rather than aliasing another one', () => {
    expect(() => shapeOf('L4', { rot: 4, flip: false } as never)).toThrow(RangeError);
    expect(() => shapeOf('L4', { rot: 0, flip: 1 } as never)).toThrow(RangeError);
  });

  it('mirrors before rotating', () => {
    expect(shapeOf('L4', { rot: 0, flip: true })).toEqual([
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
    ]);
    expect(shapeOf('S4', { rot: 0, flip: true })).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ]);
  });

  it('uses the base cells for rot 0 unflipped', () => {
    for (const id of PIECE_IDS) {
      expect(shapeOf(id, { rot: 0, flip: false })).toEqual(
        [...PIECES[id].cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      );
    }
  });
});

describe('cellsOf', () => {
  const flat = { rot: 0, flip: false } as const;

  it('maps a shape onto board cells from its origin', () => {
    expect(cellsOf('T4', { orientation: flat, origin: 7 })).toEqual([7, 8, 9, 14]);
  });

  it('returns null when any cell is off the board', () => {
    expect(cellsOf('I4', { orientation: flat, origin: 3 })).toBeNull(); // runs past column 5
    expect(cellsOf('L4', { orientation: flat, origin: 24 })).toBeNull(); // runs past row 5
  });

  it('returns null for malformed placements instead of throwing', () => {
    const bad = [
      { orientation: { rot: 4, flip: false }, origin: 0 },
      { orientation: { rot: 1.5, flip: false }, origin: 0 },
      { orientation: { rot: 0, flip: 'no' }, origin: 0 },
      { orientation: null, origin: 0 },
      { origin: 0 },
      null,
    ];
    for (const placement of bad) {
      expect(cellsOf('T4', placement as never)).toBeNull();
    }
    expect(cellsOf('X9' as never, { orientation: flat, origin: 0 })).toBeNull();
  });

  it('returns null for an invalid origin', () => {
    expect(cellsOf('M1', { orientation: flat, origin: -1 })).toBeNull();
    expect(cellsOf('M1', { orientation: flat, origin: 36 })).toBeNull();
    expect(cellsOf('M1', { orientation: flat, origin: 1.5 })).toBeNull();
  });
});
