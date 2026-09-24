import { newBoard, place, type Shape } from '@cranny/engine';
import { describe, expect, it } from 'vitest';
import { BOARD_SPAN, CELL_GAP } from '../board/metrics.ts';
import {
  cellUnder,
  geometryOf,
  grabPoint,
  liftAt,
  pieceTopLeft,
  pointInPiece,
  snap,
  TOUCH_LIFT_CELLS,
  grabbedCell,
  type BoardGeometry,
  type RowCol,
} from './snap.ts';

const board: BoardGeometry = { left: 100, top: 200, pitch: 50 };
const touchLift = TOUCH_LIFT_CELLS * board.pitch;
const grid = { version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] };
const upright = { rot: 0, flip: false } as const;
const single: Shape = [[0, 0]];
const bar: Shape = [
  [0, 0],
  [0, 1],
  [0, 2],
];
const corner: Shape = [
  [0, 0],
  [1, 0],
  [1, 1],
];

/**
 * Snaps a piece whose top-left is at board (row, col), give or take `nudge` pitches, held by
 * `grabbed` (its first cell unless given).
 */
const snapAt = (
  piece: 'M1' | 'I3' | 'D2',
  shape: Shape,
  row: number,
  col: number,
  { nudge = 0, grabbed = shape[0]! }: { nudge?: number; grabbed?: RowCol } = {},
) =>
  snap(
    newBoard(grid),
    piece,
    upright,
    shape,
    { x: board.left + (col + nudge) * board.pitch, y: board.top + (row + nudge) * board.pitch },
    board,
    grabbed,
  );

describe('geometryOf', () => {
  it('measures the pitch (cell plus gap) from the cell area width', () => {
    const geometry = geometryOf({ left: 10, top: 20, width: BOARD_SPAN * 40 });
    expect(geometry).toEqual({ left: 10, top: 20, pitch: expect.closeTo(40 * (1 + CELL_GAP)) });
  });
});

describe('pointInPiece', () => {
  it('converts a pointer on a drawn piece to pitches within the piece', () => {
    const gap = 0.2;
    const unit = 10;
    const rect = { left: 50, top: 60, width: unit * (3 + 2 * gap) };
    const point = { x: 50 + 1.5 * unit * (1 + gap), y: 60 + 0.25 * unit * (1 + gap) };
    const local = pointInPiece(point, rect, bar, gap);
    expect(local.x).toBeCloseTo(1.5);
    expect(local.y).toBeCloseTo(0.25);
  });
});

describe('grabPoint', () => {
  it('keeps a point that is on one of the cells', () => {
    expect(grabPoint(corner, { x: 0.3, y: 1.4 })).toEqual({ x: 0.3, y: 1.4 });
  });

  it('moves a point in an empty corner onto the nearest cell', () => {
    expect(grabPoint(corner, { x: 1.7, y: 0.4 })).toEqual({ x: 1.7, y: 1 });
  });

  it('moves a point outside the piece onto its edge', () => {
    expect(grabPoint(single, { x: -2, y: 0.5 })).toEqual({ x: 0, y: 0.5 });
  });
});

describe('grabbedCell', () => {
  it('finds the cell containing the grab point, including its far edges', () => {
    expect(grabbedCell(corner, { x: 0.3, y: 1.4 })).toEqual([1, 0]);
    expect(grabbedCell(corner, { x: 1.7, y: 1 })).toEqual([1, 1]);
    expect(grabbedCell(bar, { x: 3, y: 0.5 })).toEqual([0, 2]);
  });
});

describe('liftAt', () => {
  const grab = { x: 0.5, y: 0.5 };

  it('lifts fully well below the top of the board', () => {
    expect(liftAt(board.top + 10 * board.pitch, grab, board, touchLift)).toBe(touchLift);
  });

  it('does not lift at or above the top edge of the board', () => {
    expect(liftAt(board.top + 0.5 * board.pitch, grab, board, touchLift)).toBe(0);
    expect(liftAt(board.top - 100, grab, board, touchLift)).toBe(0);
  });

  it('reduces the lift near the top so a finger on row 0 can place in row 0', () => {
    const finger = { x: board.left + 2.5 * board.pitch, y: board.top + 0.5 * board.pitch };
    const topLeft = pieceTopLeft(finger, grab, board, touchLift);
    expect(snap(newBoard(grid), 'M1', upright, single, topLeft, board, [0, 0])).toMatchObject({
      row: 0,
      col: 2,
      origin: 2,
    });
  });

  it('keeps the piece moving with the finger through the ramp (no dead zone)', () => {
    let previous = -Infinity;
    for (let y = board.top - board.pitch; y < board.top + 6 * board.pitch; y += 5) {
      const top = pieceTopLeft({ x: 0, y }, grab, board, touchLift).y;
      expect(top).toBeGreaterThan(previous);
      previous = top;
    }
  });

  it('is zero for mouse and pen', () => {
    expect(liftAt(board.top + 10 * board.pitch, grab, board, 0)).toBe(0);
  });
});

describe('pieceTopLeft', () => {
  it('keeps the grab point under the pointer, raised by the lift', () => {
    const pointer = { x: 400, y: 700 };
    const grab = { x: 1.5, y: 0.5 };
    expect(pieceTopLeft(pointer, grab, board, 0)).toEqual({ x: 325, y: 675 });
    expect(pieceTopLeft(pointer, grab, board, touchLift)).toEqual({ x: 325, y: 675 - touchLift });
  });
});

describe('snap', () => {
  it('rounds to the nearest cell and accepts a free one', () => {
    expect(snapAt('M1', single, 0, 2, { nudge: 0.4 })).toEqual({
      row: 0,
      col: 2,
      cellsOnBoard: [[0, 2]],
      overBoard: true,
      origin: 2,
    });
  });

  it('rejects a blocked cell, still reporting the cells over the board', () => {
    expect(snapAt('M1', single, 0, 3)).toMatchObject({ cellsOnBoard: [[0, 3]], origin: null });
  });

  it('rejects a piece hanging off the edge, keeping only its on-board cells', () => {
    expect(snapAt('I3', bar, 0, 4)).toMatchObject({
      cellsOnBoard: [
        [0, 4],
        [0, 5],
      ],
      origin: null,
    });
    expect(snapAt('I3', bar, -1, 0)).toMatchObject({ cellsOnBoard: [], origin: null });
  });

  it('reports no cells when the piece is clear of the board', () => {
    expect(snapAt('M1', single, 9, 9)).toMatchObject({ cellsOnBoard: [], overBoard: false });
  });

  it('counts the piece as off the board once the held cell is, even if others overlap', () => {
    // A bar at columns 4–6, held by its right-hand cell (off the board): off.
    expect(snapAt('I3', bar, 0, 4, { grabbed: [0, 2] })).toMatchObject({
      overBoard: false,
      cellsOnBoard: [
        [0, 4],
        [0, 5],
      ],
    });
    // Held by its left-hand cell (on the board): still over the board, just not placeable.
    expect(snapAt('I3', bar, 0, 4, { grabbed: [0, 0] })).toMatchObject({
      overBoard: true,
      origin: null,
    });
  });

  it('always has the held cell on the board when the placement is valid', () => {
    for (const grabbed of bar) {
      const result = snapAt('I3', bar, 0, 0, { nudge: 0.45, grabbed });
      expect(result).toMatchObject({ origin: 0, overBoard: true });
    }
  });

  it('treats a moving piece’s own cells as free', () => {
    const placed = place(newBoard(grid), 'D2', { orientation: upright, origin: 0 });
    const domino: Shape = [
      [0, 0],
      [0, 1],
    ];
    const topLeft = { x: board.left + board.pitch, y: board.top };
    expect(snap(placed, 'D2', upright, domino, topLeft, board, [0, 0]).origin).toBe(1);
    // Another piece can't use those cells.
    expect(snap(placed, 'M1', upright, single, topLeft, board, [0, 0]).origin).toBeNull();
  });
});

describe('cellUnder', () => {
  it('finds the cell under a point, counting a gap with the cell before it', () => {
    expect(
      cellUnder({ x: board.left + 2.2 * board.pitch, y: board.top + 4.99 * board.pitch }, board),
    ).toEqual([4, 2]);
  });

  it('is null off the board', () => {
    expect(cellUnder({ x: board.left - 1, y: board.top }, board)).toBeNull();
    expect(cellUnder({ x: board.left, y: board.top + 6 * board.pitch }, board)).toBeNull();
  });
});
