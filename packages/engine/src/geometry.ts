import { BLOCKED_COUNT, BOARD_SIZE, CELL_COUNT, PIECE_IDS, PIECES } from './pieces.ts';
import type { Cell, Orientation, PieceId, Placement, Shape } from './types.ts';

const ORIENTATIONS: readonly Orientation[] = [false, true].flatMap((flip) =>
  ([0, 1, 2, 3] as const).map((rot) => ({ rot, flip })),
);

/** Shifts cells so the minimum row and column are 0, and sorts them row-major. */
function normalise(cells: Array<[number, number]>): Shape {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Builds a piece's shape for an orientation: mirror the columns if `flip`, then turn clockwise `rot` times. */
function computeShape(piece: PieceId, { rot, flip }: Orientation): Shape {
  let cells = PIECES[piece].cells.map(([r, c]): [number, number] => [r, flip ? -c : c]);
  for (let i = 0; i < rot; i++) cells = cells.map(([r, c]): [number, number] => [c, -r]);
  return normalise(cells);
}

/** A string key for a normalised shape, used to find duplicate orientations. */
const key = (shape: Shape) => shape.map(([r, c]) => `${r},${c}`).join(';');

type OrientationEntry = { orientation: Orientation; shape: Shape };

// Precomputed per piece: all 8 orientation shapes, and the unique ones in a fixed order
// (rot 0..3 unflipped, then rot 0..3 flipped; first occurrence wins). The solver relies on this order.
const SHAPES = {} as Record<PieceId, Shape[]>;
const UNIQUE = {} as Record<PieceId, OrientationEntry[]>;
for (const id of PIECE_IDS) {
  SHAPES[id] = ORIENTATIONS.map((o) => computeShape(id, o));
  const seen = new Set<string>();
  UNIQUE[id] = [];
  ORIENTATIONS.forEach((orientation, i) => {
    const shape = SHAPES[id][i]!;
    const k = key(shape);
    if (!seen.has(k)) {
      seen.add(k);
      UNIQUE[id].push({ orientation, shape });
    }
  });
}

// Validation for data that may come from storage or the network, where types can't be trusted.
/** Whether `value` is one of the nine piece ids. */
export const isPieceId = (value: unknown): value is PieceId =>
  typeof value === 'string' && Object.hasOwn(PIECES, value);

/** Whether `value` is an `Orientation` with `rot` in 0–3 and a boolean `flip`. */
export const isValidOrientation = (value: unknown): value is Orientation => {
  if (typeof value !== 'object' || value === null) return false;
  const { rot, flip } = value as Record<string, unknown>;
  return (rot === 0 || rot === 1 || rot === 2 || rot === 3) && typeof flip === 'boolean';
};

/** Whether `value` is an integer cell index in `0..35`. */
export const isValidCell = (value: unknown): value is Cell =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < CELL_COUNT;

/** Exactly `BLOCKED_COUNT` distinct valid cells (any order). */
export const isValidBlocked = (value: unknown): value is Cell[] =>
  Array.isArray(value) &&
  value.length === BLOCKED_COUNT &&
  value.every(isValidCell) &&
  new Set(value).size === BLOCKED_COUNT;

/**
 * The normalised shape of a piece in an orientation.
 *
 * @throws RangeError if the piece id or orientation is invalid.
 */
export function shapeOf(piece: PieceId, orientation: Orientation): Shape {
  if (!isPieceId(piece) || !isValidOrientation(orientation)) {
    throw new RangeError(
      `Invalid piece or orientation: ${String(piece)} ${JSON.stringify(orientation)}`,
    );
  }
  return SHAPES[piece][(orientation.flip ? 4 : 0) + orientation.rot]!;
}

/** Unique shapes of a piece, in a fixed order. */
export function orientationsOf(piece: PieceId): Shape[] {
  return UNIQUE[piece].map((e) => e.shape);
}

/** Unique orientations with a representative `Orientation` for each; same order as `orientationsOf`. */
export function uniqueOrientations(piece: PieceId): readonly OrientationEntry[] {
  return UNIQUE[piece];
}

/** Row (0–5) of a board cell. */
export const rowOf = (cell: Cell) => Math.floor(cell / BOARD_SIZE);
/** Column (0–5) of a board cell. */
export const colOf = (cell: Cell) => cell % BOARD_SIZE;
/** Board cell index at a row and column. Does not check bounds. */
export const cellAt = (row: number, col: number): Cell => row * BOARD_SIZE + col;

/** Whether a row and column are inside the 6×6 board. */
const onBoard = (row: number, col: number) =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

/**
 * Board cells covered by a placement, or null if the placement is malformed (unknown piece, bad
 * orientation or origin) or any cell is off the board. Never throws, so it is safe on restored state.
 */
export function cellsOf(piece: PieceId, placement: Placement): Cell[] | null {
  if (!isPieceId(piece) || typeof placement !== 'object' || placement === null) return null;
  const { origin, orientation } = placement;
  if (!isValidCell(origin) || !isValidOrientation(orientation)) return null;
  const r0 = rowOf(origin);
  const c0 = colOf(origin);
  const cells: Cell[] = [];
  for (const [r, c] of shapeOf(piece, placement.orientation)) {
    if (!onBoard(r0 + r, c0 + c)) return null;
    cells.push(cellAt(r0 + r, c0 + c));
  }
  return cells;
}
