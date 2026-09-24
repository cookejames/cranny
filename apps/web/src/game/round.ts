import {
  canPlace,
  clear,
  isSolved,
  newBoard,
  PIECE_IDS,
  place,
  remove,
  type BoardState,
  type Cell,
  type Grid,
  type Orientation,
  type PieceId,
  type Placement,
} from '@cranny/engine';

/**
 * Where a round is (SPEC.md §5): before Start the board is hidden and nothing can be played;
 * `complete` is reached by the drop that fills the grid and is final.
 */
export type RoundStatus = 'pre-start' | 'playing' | 'complete';

/** Play-screen state for one grid. Times are wall-clock milliseconds (`Date.now()`). */
export type RoundState = {
  status: RoundStatus;
  board: BoardState;
  /** Orientation of every piece, whether in the tray or on the board. */
  orientations: Record<PieceId, Orientation>;
  /** The tray piece that Rotate and Flip act on (SPEC.md §6). Never a placed piece. */
  selected: PieceId | null;
  /** When Start was pressed; null before. */
  startedAt: number | null;
  /** When the completing drop happened; null until complete. */
  finishedAt: number | null;
};

/**
 * Player actions on the play screen. Actions that happen at a moment the clock cares about
 * carry that moment (`at`), so the reducer stays pure.
 */
export type RoundAction =
  | { type: 'start'; at: number }
  | { type: 'select'; piece: PieceId }
  | { type: 'rotate' }
  | { type: 'flip' }
  | { type: 'place'; piece: PieceId; origin: Cell; at: number }
  | { type: 'remove'; piece: PieceId }
  | { type: 'clear' };

const UPRIGHT: Orientation = { rot: 0, flip: false };

/** A fresh round for a grid: before Start, empty board, every piece upright, nothing selected. */
export function newRound(grid: Grid): RoundState {
  return {
    status: 'pre-start',
    board: newBoard(grid),
    orientations: Object.fromEntries(PIECE_IDS.map((id) => [id, UPRIGHT])) as Record<
      PieceId,
      Orientation
    >,
    selected: null,
    startedAt: null,
    finishedAt: null,
  };
}

/**
 * A round already under way: started at `startedAt`, with the given orientations and pieces
 * placed. Placements that don't fit (overlapping, off the board, on a blocker, or not matching
 * the piece's orientation) are dropped, since saved data can't be trusted. Returns null if what
 * remains would fill the grid: a finished round is never resumed, only replayed.
 */
export function resumeRound(
  grid: Grid,
  startedAt: number,
  orientations: Partial<Record<PieceId, Orientation>>,
  placements: Partial<Record<PieceId, Placement>>,
): RoundState | null {
  const round = newRound(grid);
  const turned = { ...round.orientations, ...orientations };
  let board = round.board;
  for (const id of PIECE_IDS) {
    const placement = placements[id];
    if (!placement) continue;
    const fits = { orientation: turned[id], origin: placement.origin };
    if (canPlace(board, id, fits)) board = place(board, id, fits);
  }
  if (isSolved(board)) return null;
  return { ...round, status: 'playing', board, orientations: turned, startedAt };
}

/** Time on the clock at `now`: 0 before Start, frozen at the completing drop. */
export function elapsedMs(
  state: Pick<RoundState, 'startedAt' | 'finishedAt'>,
  now: number,
): number {
  if (state.startedAt === null) return 0;
  return Math.max(0, (state.finishedAt ?? now) - state.startedAt);
}

/** Turns an orientation 90° clockwise, as seen on screen. */
export function rotateClockwise({ rot, flip }: Orientation): Orientation {
  return { rot: ((rot + 1) % 4) as Orientation['rot'], flip };
}

/**
 * Mirrors an orientation left-to-right, as seen on screen. The engine mirrors before rotating,
 * so the rotation must be reversed too: mirror(rotate(s, r)) = rotate(mirror(s), -r).
 */
export function mirror({ rot, flip }: Orientation): Orientation {
  return { rot: ((4 - rot) % 4) as Orientation['rot'], flip: !flip };
}

/** Whether a piece is on the board. */
export const isPlaced = (state: RoundState, piece: PieceId) =>
  state.board.placements[piece] !== undefined;

/** Number of pieces on the board. */
export const placedCount = (state: RoundState) =>
  PIECE_IDS.filter((id) => isPlaced(state, id)).length;

/**
 * Applies a player action. Only `start` does anything before Start, and nothing does once the
 * grid is complete. Invalid actions (selecting a placed piece, rotating with nothing selected,
 * an invalid placement) leave the state unchanged rather than throwing.
 */
export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  if (action.type === 'start') {
    return state.status === 'pre-start'
      ? { ...state, status: 'playing', startedAt: action.at }
      : state;
  }
  if (state.status !== 'playing') return state;

  switch (action.type) {
    case 'select':
      if (isPlaced(state, action.piece) || state.selected === action.piece) return state;
      return { ...state, selected: action.piece };

    case 'rotate':
    case 'flip': {
      const piece = state.selected;
      if (!piece) return state;
      const turn = action.type === 'rotate' ? rotateClockwise : mirror;
      return {
        ...state,
        orientations: { ...state.orientations, [piece]: turn(state.orientations[piece]) },
      };
    }

    case 'place': {
      const placement = { orientation: state.orientations[action.piece], origin: action.origin };
      if (!canPlace(state.board, action.piece, placement)) return state;
      const board = place(state.board, action.piece, placement);
      const selected = state.selected === action.piece ? null : state.selected;
      // The drop that fills the grid stops the clock at that moment (SPEC.md §7).
      return isSolved(board)
        ? { ...state, board, selected: null, status: 'complete', finishedAt: action.at }
        : { ...state, board, selected };
    }

    case 'remove':
      if (!isPlaced(state, action.piece)) return state;
      return { ...state, board: remove(state.board, action.piece) };

    case 'clear':
      if (placedCount(state) === 0) return state;
      return { ...state, board: clear(state.board) };
  }
}
