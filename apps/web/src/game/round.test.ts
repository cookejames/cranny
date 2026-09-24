import { PIECE_IDS, shapeOf, type Orientation } from '@tessel/engine';
import { describe, expect, it } from 'vitest';
import { mirror, newRound, placedCount, rotateClockwise, roundReducer } from './round.ts';

const grid = { version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] };

/** Mirrors a set of shape cells left-to-right and normalises them, for comparison. */
function mirrorCells(cells: ReadonlyArray<readonly [number, number]>) {
  const maxC = Math.max(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r, maxC - c] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Every orientation, for exhaustive checks. */
const ALL: Orientation[] = [false, true].flatMap((flip) =>
  ([0, 1, 2, 3] as const).map((rot) => ({ rot, flip })),
);

describe('orientation helpers', () => {
  it('mirror flips the shape as it currently looks, in every orientation', () => {
    for (const id of PIECE_IDS) {
      for (const o of ALL) {
        expect(shapeOf(id, mirror(o))).toEqual(mirrorCells(shapeOf(id, o)));
      }
    }
  });

  it('rotateClockwise turns the on-screen shape clockwise even when mirrored', () => {
    for (const o of ALL) {
      // Rotating clockwise a quarter turn: (row, col) → (col, maxRow - row).
      const before = shapeOf('L4', o);
      const maxR = Math.max(...before.map(([r]) => r));
      const expected = before
        .map(([r, c]) => [c, maxR - r] as const)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      expect(shapeOf('L4', rotateClockwise(o))).toEqual(expected);
    }
  });

  it('four rotations or two mirrors return to the start', () => {
    for (const o of ALL) {
      expect(rotateClockwise(rotateClockwise(rotateClockwise(rotateClockwise(o))))).toEqual(o);
      expect(mirror(mirror(o))).toEqual(o);
    }
  });
});

describe('roundReducer', () => {
  it('starts empty, upright and with nothing selected', () => {
    const state = newRound(grid);
    expect(state.selected).toBeNull();
    expect(placedCount(state)).toBe(0);
    expect(Object.values(state.orientations)).toEqual(
      PIECE_IDS.map(() => ({ rot: 0, flip: false })),
    );
  });

  it('rotates and flips only the selected piece', () => {
    let state = newRound(grid);
    expect(roundReducer(state, { type: 'rotate' })).toBe(state); // nothing selected
    state = roundReducer(state, { type: 'select', piece: 'L4' });
    state = roundReducer(state, { type: 'rotate' });
    state = roundReducer(state, { type: 'flip' });
    expect(state.orientations.L4).toEqual(mirror(rotateClockwise({ rot: 0, flip: false })));
    expect(state.orientations.T4).toEqual({ rot: 0, flip: false });
  });

  it('places a piece in its current orientation and clears the selection', () => {
    let state = roundReducer(newRound(grid), { type: 'select', piece: 'D2' });
    state = roundReducer(state, { type: 'place', piece: 'D2', origin: 0 });
    expect(state.board.placements.D2).toEqual({ origin: 0, orientation: { rot: 0, flip: false } });
    expect(state.selected).toBeNull();
    expect(placedCount(state)).toBe(1);
  });

  it('keeps a different selection when another piece is placed', () => {
    let state = roundReducer(newRound(grid), { type: 'select', piece: 'T4' });
    state = roundReducer(state, { type: 'place', piece: 'M1', origin: 0 });
    expect(state.selected).toBe('T4');
  });

  it('ignores invalid placements', () => {
    const state = newRound(grid);
    expect(roundReducer(state, { type: 'place', piece: 'M1', origin: 3 })).toBe(state); // blocked
  });

  it('cannot select a placed piece', () => {
    const state = roundReducer(newRound(grid), { type: 'place', piece: 'M1', origin: 0 });
    expect(roundReducer(state, { type: 'select', piece: 'M1' })).toBe(state);
  });

  it('removes one piece or clears all, keeping orientations', () => {
    let state = roundReducer(newRound(grid), { type: 'select', piece: 'D2' });
    state = roundReducer(state, { type: 'rotate' });
    state = roundReducer(state, { type: 'place', piece: 'D2', origin: 0 });
    state = roundReducer(state, { type: 'place', piece: 'M1', origin: 35 });
    expect(placedCount(roundReducer(state, { type: 'remove', piece: 'M1' }))).toBe(1);
    const cleared = roundReducer(state, { type: 'clear' });
    expect(placedCount(cleared)).toBe(0);
    expect(cleared.orientations.D2).toEqual({ rot: 1, flip: false });
  });

  it('returns the same state when remove or clear changes nothing', () => {
    const state = newRound(grid);
    expect(roundReducer(state, { type: 'remove', piece: 'M1' })).toBe(state);
    expect(roundReducer(state, { type: 'clear' })).toBe(state);
  });
});
