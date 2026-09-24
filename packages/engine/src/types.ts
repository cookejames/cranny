/** Board cell index, 0..35, row-major (`row * 6 + col`). */
export type Cell = number;

export type PieceId = 'I4' | 'O4' | 'T4' | 'S4' | 'L4' | 'I3' | 'V3' | 'D2' | 'M1';

/** `rot` is the number of 90° clockwise turns, applied after the optional mirror. */
export type Orientation = { rot: 0 | 1 | 2 | 3; flip: boolean };

/** Cells as `[row, col]` offsets, normalised so min row/col = 0, sorted row-major. */
export type Shape = ReadonlyArray<readonly [row: number, col: number]>;

/** `origin` is the board cell of the top-left corner of the shape's bounding box. */
export type Placement = { orientation: Orientation; origin: Cell };

/** `blocked` is sorted ascending and has length `BLOCKED_COUNT`. */
export type Grid = { version: number; seed: number; blocked: Cell[] };

export type BoardState = { grid: Grid; placements: Partial<Record<PieceId, Placement>> };

export type Occupant = PieceId | 'X' | null;
