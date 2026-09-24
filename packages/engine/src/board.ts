import { cellsOf, isValidBlocked, isValidCell } from './geometry.ts';
import { CELL_COUNT, PIECE_IDS } from './pieces.ts';
import type { BoardState, Grid, Occupant, PieceId, Placement } from './types.ts';

/** An empty board for a grid, with no pieces placed. */
export function newBoard(grid: Grid): BoardState {
  return { grid, placements: {} };
}

/** What covers each cell. Invalid blocked cells and malformed or off-board placements are ignored. */
export function occupancy(state: BoardState): Occupant[] {
  const occ: Occupant[] = new Array<Occupant>(CELL_COUNT).fill(null);
  for (const cell of state.grid.blocked) if (isValidCell(cell)) occ[cell] = 'X';
  for (const id of PIECE_IDS) {
    const placement = state.placements[id];
    if (!placement) continue;
    for (const cell of cellsOf(id, placement) ?? []) occ[cell] = id;
  }
  return occ;
}

/**
 * Whether `piece` can go at `placement`. The piece's own current placement never blocks it
 * (placing a placed piece moves it); `ignore` additionally treats another piece as absent.
 */
export function canPlace(
  state: BoardState,
  piece: PieceId,
  placement: Placement,
  options: { ignore?: PieceId } = {},
): boolean {
  const cells = cellsOf(piece, placement);
  if (!cells) return false;
  const occ = occupancy(state);
  return cells.every((cell) => {
    const who = occ[cell];
    return who === null || who === piece || who === options.ignore;
  });
}

/**
 * Places a piece, or moves it if it is already placed. Returns a new state; the input is unchanged.
 *
 * @throws Error if the placement is not valid (see {@link canPlace}).
 */
export function place(state: BoardState, piece: PieceId, placement: Placement): BoardState {
  if (!canPlace(state, piece, placement)) {
    throw new Error(`Invalid placement for ${piece} at ${placement.origin}`);
  }
  // Copy so later changes to the caller's object can't alter this state.
  const stored: Placement = {
    origin: placement.origin,
    orientation: { rot: placement.orientation.rot, flip: placement.orientation.flip },
  };
  return { ...state, placements: { ...state.placements, [piece]: stored } };
}

/** Takes a piece off the board. Returns the same state object if the piece wasn't placed. */
export function remove(state: BoardState, piece: PieceId): BoardState {
  if (!state.placements[piece]) return state;
  const placements = { ...state.placements };
  delete placements[piece];
  return { ...state, placements };
}

/** Takes every piece off the board, keeping the grid. */
export function clear(state: BoardState): BoardState {
  return { ...state, placements: {} };
}

/**
 * True when every piece is placed on the board with no overlaps. Checked from scratch rather
 * than trusted, because states may be restored from storage.
 */
export function isSolved(state: BoardState): boolean {
  if (!isValidBlocked(state.grid.blocked)) return false;
  const covered = new Set<number>(state.grid.blocked);
  for (const id of PIECE_IDS) {
    const placement = state.placements[id];
    const cells = placement && cellsOf(id, placement);
    if (!cells) return false;
    for (const cell of cells) {
      if (covered.has(cell)) return false;
      covered.add(cell);
    }
  }
  return covered.size === CELL_COUNT;
}
