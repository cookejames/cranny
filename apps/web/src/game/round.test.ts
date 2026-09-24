import { PIECE_IDS, shapeOf, solve, type Orientation, type PieceId } from '@cranny/engine';
import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  mirror,
  newRound,
  placedCount,
  resumeRound,
  rotateClockwise,
  roundReducer,
  type RoundState,
} from './round.ts';

const grid = { version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] };
const solution = solve(grid.blocked)!;
const T0 = 1_000_000;

/** A round for `grid` whose Start was pressed at `T0`. */
const started = () => roundReducer(newRound(grid), { type: 'start', at: T0 });

/** Places every piece of the solution except `except`, in their solved orientations. */
function nearlySolved(except: PieceId): RoundState {
  let state = started();
  for (const id of PIECE_IDS) {
    if (id === except) continue;
    state = { ...state, orientations: { ...state.orientations, [id]: solution[id].orientation } };
    state = roundReducer(state, { type: 'place', piece: id, origin: solution[id].origin, at: T0 });
  }
  return {
    ...state,
    orientations: { ...state.orientations, [except]: solution[except].orientation },
  };
}

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
  it('starts before Start: empty, upright and with nothing selected', () => {
    const state = newRound(grid);
    expect(state.status).toBe('pre-start');
    expect(state.startedAt).toBeNull();
    expect(state.selected).toBeNull();
    expect(placedCount(state)).toBe(0);
    expect(Object.values(state.orientations)).toEqual(
      PIECE_IDS.map(() => ({ rot: 0, flip: false })),
    );
  });

  it('ignores play before Start, then starts the clock', () => {
    const state = newRound(grid);
    expect(roundReducer(state, { type: 'select', piece: 'L4' })).toBe(state);
    expect(roundReducer(state, { type: 'place', piece: 'M1', origin: 0, at: T0 })).toBe(state);
    const playing = roundReducer(state, { type: 'start', at: T0 });
    expect(playing).toMatchObject({ status: 'playing', startedAt: T0 });
    expect(roundReducer(playing, { type: 'start', at: T0 + 5 })).toBe(playing);
  });

  it('rotates and flips only the selected piece', () => {
    let state = started();
    expect(roundReducer(state, { type: 'rotate' })).toBe(state); // nothing selected
    state = roundReducer(state, { type: 'select', piece: 'L4' });
    state = roundReducer(state, { type: 'rotate' });
    state = roundReducer(state, { type: 'flip' });
    expect(state.orientations.L4).toEqual(mirror(rotateClockwise({ rot: 0, flip: false })));
    expect(state.orientations.T4).toEqual({ rot: 0, flip: false });
  });

  it('places a piece in its current orientation and clears the selection', () => {
    let state = roundReducer(started(), { type: 'select', piece: 'D2' });
    state = roundReducer(state, { type: 'place', piece: 'D2', origin: 0, at: T0 });
    expect(state.board.placements.D2).toEqual({ origin: 0, orientation: { rot: 0, flip: false } });
    expect(state.selected).toBeNull();
    expect(placedCount(state)).toBe(1);
  });

  it('keeps a different selection when another piece is placed', () => {
    let state = roundReducer(started(), { type: 'select', piece: 'T4' });
    state = roundReducer(state, { type: 'place', piece: 'M1', origin: 0, at: T0 });
    expect(state.selected).toBe('T4');
  });

  it('ignores invalid placements', () => {
    const state = started();
    expect(roundReducer(state, { type: 'place', piece: 'M1', origin: 3, at: T0 })).toBe(state); // blocked
  });

  it('cannot select a placed piece', () => {
    const state = roundReducer(started(), { type: 'place', piece: 'M1', origin: 0, at: T0 });
    expect(roundReducer(state, { type: 'select', piece: 'M1' })).toBe(state);
  });

  it('removes one piece or clears all, keeping orientations', () => {
    let state = roundReducer(started(), { type: 'select', piece: 'D2' });
    state = roundReducer(state, { type: 'rotate' });
    state = roundReducer(state, { type: 'place', piece: 'D2', origin: 0, at: T0 });
    state = roundReducer(state, { type: 'place', piece: 'M1', origin: 35, at: T0 });
    expect(placedCount(roundReducer(state, { type: 'remove', piece: 'M1' }))).toBe(1);
    const cleared = roundReducer(state, { type: 'clear' });
    expect(placedCount(cleared)).toBe(0);
    expect(cleared.orientations.D2).toEqual({ rot: 1, flip: false });
  });

  it('returns the same state when remove or clear changes nothing', () => {
    const state = started();
    expect(roundReducer(state, { type: 'remove', piece: 'M1' })).toBe(state);
    expect(roundReducer(state, { type: 'clear' })).toBe(state);
  });

  it('completes on the drop that fills the grid, stopping the clock at that drop', () => {
    const state = roundReducer(nearlySolved('V3'), { type: 'select', piece: 'V3' });
    expect(state.status).toBe('playing');
    const done = roundReducer(state, {
      type: 'place',
      piece: 'V3',
      origin: solution.V3.origin,
      at: T0 + 68_400,
    });
    expect(done).toMatchObject({ status: 'complete', finishedAt: T0 + 68_400, selected: null });
    expect(elapsedMs(done, T0 + 999_999)).toBe(68_400);
    // Nothing changes a finished grid.
    expect(roundReducer(done, { type: 'clear' })).toBe(done);
    expect(roundReducer(done, { type: 'remove', piece: 'V3' })).toBe(done);
  });
});

describe('elapsedMs', () => {
  it('is 0 before Start and runs with the wall clock after', () => {
    expect(elapsedMs(newRound(grid), T0 + 5000)).toBe(0);
    expect(elapsedMs(started(), T0 + 5000)).toBe(5000);
    // A clock that went backwards doesn't show negative time.
    expect(elapsedMs(started(), T0 - 5000)).toBe(0);
  });
});

describe('resumeRound', () => {
  it('restores a round under way with its clock, orientations and placements', () => {
    const turned = { rot: 1, flip: true } as const;
    const round = resumeRound(
      grid,
      T0,
      { D2: solution.D2.orientation, T4: turned },
      { D2: solution.D2 },
    )!;
    expect(round).toMatchObject({ status: 'playing', startedAt: T0 });
    expect(round.board.placements).toEqual({ D2: solution.D2 });
    expect(round.orientations.T4).toEqual(turned);
    expect(round.orientations.L4).toEqual({ rot: 0, flip: false });
  });

  it('drops placements that do not fit, keeping the first of two that overlap (piece order)', () => {
    const round = resumeRound(
      grid,
      T0,
      {},
      {
        M1: { orientation: { rot: 0, flip: false }, origin: 3 }, // on a blocker
        D2: { orientation: { rot: 0, flip: false }, origin: 0 }, // overlaps the square
        O4: { orientation: { rot: 0, flip: false }, origin: 0 },
      },
    )!;
    expect(Object.keys(round.board.placements)).toEqual(['O4']);
  });

  it('uses the piece’s saved orientation, not the placement’s', () => {
    const round = resumeRound(
      grid,
      T0,
      { I3: { rot: 1, flip: false } },
      { I3: { orientation: { rot: 0, flip: false }, origin: 0 } },
    )!;
    expect(round.board.placements.I3?.orientation).toEqual({ rot: 1, flip: false });
  });

  it('refuses a finished grid', () => {
    const orientations = Object.fromEntries(PIECE_IDS.map((id) => [id, solution[id].orientation]));
    expect(resumeRound(grid, T0, orientations, solution)).toBeNull();
  });
});
