import type { PieceId } from './types.ts';

export const BOARD_SIZE = 6;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const BLOCKED_COUNT = 7;

export type PieceDef = {
  id: PieceId;
  name: string;
  /** Base cells as `[row, col]`, in the orientation `{ rot: 0, flip: false }`. */
  cells: ReadonlyArray<readonly [number, number]>;
  /** Presentation token; the web app maps it to a colour. */
  colorToken: string;
};

/** Canonical piece order: tray order, and the order the solver tries pieces in (part of generator v1). */
export const PIECE_IDS: readonly PieceId[] = ['I4', 'O4', 'T4', 'S4', 'L4', 'I3', 'V3', 'D2', 'M1'];

export const PIECES: Readonly<Record<PieceId, PieceDef>> = {
  I4: {
    id: 'I4',
    name: 'Long bar',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    colorToken: 'piece-i4',
  },
  O4: {
    id: 'O4',
    name: 'Square',
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    colorToken: 'piece-o4',
  },
  T4: {
    id: 'T4',
    name: 'Tee',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
    colorToken: 'piece-t4',
  },
  S4: {
    id: 'S4',
    name: 'Zig',
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    colorToken: 'piece-s4',
  },
  L4: {
    id: 'L4',
    name: 'Ell',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    colorToken: 'piece-l4',
  },
  I3: {
    id: 'I3',
    name: 'Bar',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    colorToken: 'piece-i3',
  },
  V3: {
    id: 'V3',
    name: 'Corner',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    colorToken: 'piece-v3',
  },
  D2: {
    id: 'D2',
    name: 'Domino',
    cells: [
      [0, 0],
      [0, 1],
    ],
    colorToken: 'piece-d2',
  },
  M1: { id: 'M1', name: 'Single', cells: [[0, 0]], colorToken: 'piece-m1' },
};
