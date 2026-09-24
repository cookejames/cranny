import {
  canPlace,
  clear,
  newBoard,
  PIECE_IDS,
  place,
  remove,
  type BoardState,
  type Cell,
  type Grid,
  type Orientation,
  type PieceId,
} from '@tessel/engine';

/**
 * Play-screen state for one grid: the board, each piece's orientation, and the tray selection.
 * Timer and pre-start/complete status are added in Phase 5 (TASKS.md T5.1).
 */
export type RoundState = {
  board: BoardState;
  /** Orientation of every piece, whether in the tray or on the board. */
  orientations: Record<PieceId, Orientation>;
  /** The tray piece that Rotate and Flip act on (SPEC.md §6). Never a placed piece. */
  selected: PieceId | null;
};

/** Player actions on the play screen. */
export type RoundAction =
  | { type: 'select'; piece: PieceId }
  | { type: 'rotate' }
  | { type: 'flip' }
  | { type: 'place'; piece: PieceId; origin: Cell }
  | { type: 'remove'; piece: PieceId }
  | { type: 'clear' };

const UPRIGHT: Orientation = { rot: 0, flip: false };

/** A fresh round for a grid: empty board, every piece upright, nothing selected. */
export function newRound(grid: Grid): RoundState {
  return {
    board: newBoard(grid),
    orientations: Object.fromEntries(PIECE_IDS.map((id) => [id, UPRIGHT])) as Record<
      PieceId,
      Orientation
    >,
    selected: null,
  };
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
 * Applies a player action. Invalid actions (selecting a placed piece, rotating with nothing
 * selected, an invalid placement) leave the state unchanged rather than throwing.
 */
export function roundReducer(state: RoundState, action: RoundAction): RoundState {
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
      return {
        ...state,
        board: place(state.board, action.piece, placement),
        selected: state.selected === action.piece ? null : state.selected,
      };
    }

    case 'remove':
      if (!isPlaced(state, action.piece)) return state;
      return { ...state, board: remove(state.board, action.piece) };

    case 'clear':
      if (placedCount(state) === 0) return state;
      return { ...state, board: clear(state.board) };
  }
}
