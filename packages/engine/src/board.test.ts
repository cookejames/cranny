import { describe, expect, it } from 'vitest';
import { canPlace, clear, isSolved, newBoard, occupancy, place, remove } from './board.ts';
import { PIECE_IDS } from './pieces.ts';
import { solve } from './solver.ts';
import type { BoardState, Grid } from './types.ts';

const flat = { rot: 0, flip: false } as const;
// The design prototype's default layout (known solvable).
const grid: Grid = { version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] };
const empty = newBoard(grid);

/** A fully solved board for the fixture grid, using the solver's solution. */
const solved = (): BoardState => {
  const solution = solve(grid.blocked);
  if (!solution) throw new Error('fixture grid should be solvable');
  return { grid, placements: solution };
};

describe('occupancy', () => {
  it('marks blocked cells and placed pieces', () => {
    const state = place(empty, 'D2', { orientation: flat, origin: 0 });
    const occ = occupancy(state);
    expect(occ[0]).toBe('D2');
    expect(occ[1]).toBe('D2');
    expect(occ[3]).toBe('X');
    expect(occ[2]).toBeNull();
    expect(occ.filter((o) => o === 'X')).toHaveLength(7);
  });
});

describe('canPlace', () => {
  it('rejects blocked cells, overlaps and off-board placements', () => {
    expect(canPlace(empty, 'I4', { orientation: flat, origin: 0 })).toBe(false); // covers 3
    expect(canPlace(empty, 'I4', { orientation: flat, origin: 30 })).toBe(true);
    expect(canPlace(empty, 'I4', { orientation: flat, origin: 4 })).toBe(false); // off board
    const state = place(empty, 'D2', { orientation: flat, origin: 0 });
    expect(canPlace(state, 'M1', { orientation: flat, origin: 1 })).toBe(false);
  });

  it('lets a placed piece move over its own cells', () => {
    const state = place(empty, 'D2', { orientation: flat, origin: 0 });
    expect(canPlace(state, 'D2', { orientation: flat, origin: 1 })).toBe(true);
  });

  it('treats the ignored piece as absent', () => {
    const state = place(empty, 'D2', { orientation: flat, origin: 0 });
    expect(canPlace(state, 'M1', { orientation: flat, origin: 1 }, { ignore: 'D2' })).toBe(true);
  });
});

describe('place / remove / clear', () => {
  it('does not mutate the input state', () => {
    const state = place(empty, 'M1', { orientation: flat, origin: 0 });
    expect(empty.placements).toEqual({});
    expect(state.placements.M1).toEqual({ orientation: flat, origin: 0 });
  });

  it('copies the placement so later changes to the input object have no effect', () => {
    const placement = { orientation: { rot: 0 as const, flip: false }, origin: 0 };
    const state = place(empty, 'M1', placement);
    placement.origin = 35;
    placement.orientation.flip = true;
    expect(state.placements.M1).toEqual({ orientation: flat, origin: 0 });
  });

  it('moves a piece that is already placed', () => {
    const state = place(place(empty, 'M1', { orientation: flat, origin: 0 }), 'M1', {
      orientation: flat,
      origin: 1,
    });
    expect(state.placements.M1?.origin).toBe(1);
  });

  it('throws on an invalid placement', () => {
    expect(() => place(empty, 'M1', { orientation: flat, origin: 3 })).toThrow(/Invalid placement/);
  });

  it('removes one piece or clears all', () => {
    const state = place(place(empty, 'M1', { orientation: flat, origin: 0 }), 'D2', {
      orientation: flat,
      origin: 30,
    });
    expect(Object.keys(remove(state, 'M1').placements)).toEqual(['D2']);
    expect(remove(empty, 'M1')).toBe(empty);
    expect(clear(state).placements).toEqual({});
  });

  it('round-trips through JSON', () => {
    const state = solved();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('isSolved', () => {
  it('is true for a full valid placement', () => {
    expect(isSolved(solved())).toBe(true);
  });

  it('is false when a piece is missing', () => {
    expect(isSolved(remove(solved(), 'M1'))).toBe(false);
    expect(isSolved(empty)).toBe(false);
  });

  it('is false for overlapping placements restored from storage', () => {
    const state = solved();
    const bad: BoardState = {
      ...state,
      placements: { ...state.placements, M1: { ...state.placements.D2!, orientation: flat } },
    };
    expect(isSolved(bad)).toBe(false);
  });

  it.each([
    ['a cell off the board', [8, 13, 18, 19, 24, 34, 36]],
    ['a negative cell', [-1, 8, 13, 18, 19, 24, 34]],
    ['a fractional cell', [3.5, 8, 13, 18, 19, 24, 34]],
    ['too few cells', [8, 13, 18, 19, 24, 34]],
    ['a duplicate', [3, 3, 8, 13, 18, 19, 24]],
  ])('is false when the blocked list has %s', (_, blocked) => {
    // Pieces from a real solution, but a corrupted blocked list (e.g. from storage).
    expect(isSolved({ ...solved(), grid: { ...grid, blocked } })).toBe(false);
  });

  it('does not throw on malformed restored placements', () => {
    const state = solved();
    const bad = {
      ...state,
      placements: { ...state.placements, T4: { orientation: { rot: 9, flip: false }, origin: 0 } },
    } as unknown as BoardState;
    expect(isSolved(bad)).toBe(false);
    expect(() => occupancy(bad)).not.toThrow();
    expect(() => canPlace(bad, 'T4', { orientation: flat, origin: 0 })).not.toThrow();
  });

  it('is false for a placement off the board', () => {
    const state = solved();
    const bad: BoardState = {
      ...state,
      placements: { ...state.placements, I4: { orientation: flat, origin: 5 } },
    };
    expect(isSolved(bad)).toBe(false);
  });

  it('checks all nine pieces', () => {
    expect(Object.keys(solved().placements).sort()).toEqual([...PIECE_IDS].sort());
  });
});
