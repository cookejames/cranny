import {
  canPlace,
  CELL_COUNT,
  newBoard,
  PIECE_IDS,
  place,
  type BoardState,
  type Grid,
  type Orientation,
  type PieceId,
  type Placement,
} from '@cranny/engine';

/**
 * A player's board as sent after a round (specs/2026-09-26-player-grids/SPEC.md §3.1): one entry
 * per piece in `PIECE_IDS` order, `origin * 8 + orientationIndex`, or null if it isn't placed. The
 * orientation index is `rot + (flip ? 4 : 0)`.
 */
export type BoardCode = (number | null)[];

/** Orientations per piece. */
const ORIENTATION_COUNT = 8;
/** One past the largest value a code entry can hold. */
const CODE_LIMIT = CELL_COUNT * ORIENTATION_COUNT;

/** Encodes a board's placements; unplaced pieces are null. */
export function encodeBoard(placements: Partial<Record<PieceId, Placement>>): BoardCode {
  return PIECE_IDS.map((id) => {
    const p = placements[id];
    if (!p) return null;
    return p.origin * ORIENTATION_COUNT + p.orientation.rot + (p.orientation.flip ? 4 : 0);
  });
}

/** Whether a value is a well-formed {@link BoardCode}. Says nothing about whether pieces fit. */
export function isBoardCode(raw: unknown): raw is BoardCode {
  return (
    Array.isArray(raw) &&
    raw.length === PIECE_IDS.length &&
    raw.every((v) => v === null || (Number.isInteger(v) && v >= 0 && v < CODE_LIMIT))
  );
}

/**
 * The board a code describes on `grid`. Pieces are placed in `PIECE_IDS` order and any that don't
 * fit (off the board, on a blocked cell or overlapping an earlier piece) are left off, so a bad
 * code still gives a drawable board.
 */
export function decodeBoard(grid: Grid, code: BoardCode): BoardState {
  let board = newBoard(grid);
  PIECE_IDS.forEach((id, i) => {
    const value = code[i];
    if (value === null || value === undefined) return;
    const index = value % ORIENTATION_COUNT;
    const orientation: Orientation = { rot: (index % 4) as Orientation['rot'], flip: index >= 4 };
    const placement: Placement = { origin: Math.floor(value / ORIENTATION_COUNT), orientation };
    if (canPlace(board, id, placement)) board = place(board, id, placement);
  });
  return board;
}
