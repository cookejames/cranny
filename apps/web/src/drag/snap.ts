import {
  BOARD_SIZE,
  canPlace,
  cellAt,
  type BoardState,
  type Cell,
  type Orientation,
  type PieceId,
  type Shape,
} from '@cranny/engine';
import { CELL_GAP, BOARD_SPAN } from '../board/metrics.ts';
import type { ClientPoint } from './tap.ts';

/**
 * Drag-and-drop maths (specs/2026-09-25-single-player/SPEC.md §6), kept free of the DOM so it can be unit tested. Positions are
 * client (viewport) pixels unless stated otherwise.
 */

/** How far a piece dragged by touch floats above the finger, in cells. */
export const TOUCH_LIFT_CELLS = 1.5;
/**
 * Near the top of the board the lift fades out over this many cells, so a finger in the top rows
 * can still put a piece in row 0 instead of pushing it off the board.
 */
export const LIFT_RAMP_CELLS = 3;

/** Where the board's cells are on screen. `pitch` is one cell plus one gap. */
export type BoardGeometry = { left: number; top: number; pitch: number };

/** A point within a piece, in pitches from the top-left of its bounding box. */
export type PiecePoint = { x: number; y: number };

/** A `[row, col]` pair on the board. Can be off the board while a piece hangs over an edge. */
export type RowCol = readonly [row: number, col: number];

/**
 * Board geometry from the measured box of the board's cell area (6 cells and 5 gaps).
 *
 * @param rect - The cell area's bounding client rect.
 */
export function geometryOf(rect: { left: number; top: number; width: number }): BoardGeometry {
  return { left: rect.left, top: rect.top, pitch: (rect.width / BOARD_SPAN) * (1 + CELL_GAP) };
}

/** Width of one board cell (without its gap) in pixels. */
export const cellSizeOf = ({ pitch }: BoardGeometry) => pitch / (1 + CELL_GAP);

/**
 * Where a pointer is within a piece drawn in `rect`, in pitches.
 *
 * @param rect - The drawn piece's bounding client rect.
 * @param shape - The piece's shape in the orientation it is drawn in.
 * @param gap - The gap between cells the piece is drawn with, in cell units.
 */
export function pointInPiece(
  point: ClientPoint,
  rect: { left: number; top: number; width: number },
  shape: Shape,
  gap: number,
): PiecePoint {
  const cols = Math.max(...shape.map(([, c]) => c)) + 1;
  const unit = rect.width / (cols + (cols - 1) * gap);
  const pitch = unit * (1 + gap);
  return { x: (point.x - rect.left) / pitch, y: (point.y - rect.top) / pitch };
}

/**
 * The grab point: `point` moved onto the nearest of the piece's cells, so the grabbed cell stays
 * under the pointer even when the press landed on a gap or an empty corner of the tray tile.
 */
export function grabPoint(shape: Shape, point: PiecePoint): PiecePoint {
  let best = point;
  let bestDistance = Infinity;
  for (const [row, col] of shape) {
    const x = Math.min(Math.max(point.x, col), col + 1);
    const y = Math.min(Math.max(point.y, row), row + 1);
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance < bestDistance) {
      best = { x, y };
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The piece's cell under a grab point (from `grabPoint`, so it lies on one of the cells), as
 * `[row, col]` within the piece.
 */
export function grabbedCell(shape: Shape, grab: PiecePoint): RowCol {
  const containing = shape.find(
    ([r, c]) => grab.x >= c && grab.x <= c + 1 && grab.y >= r && grab.y <= r + 1,
  );
  return containing ?? shape[0]!;
}

/**
 * How far to lift the piece above the pointer, in pixels. Full lift once the unlifted piece is
 * `LIFT_RAMP_CELLS` below the top of the board, fading to none at the top edge and above it.
 * The ramp keeps the piece moving with the finger (at half speed), with no dead zone.
 *
 * @param fullLift - The lift away from the top edge: `TOUCH_LIFT_CELLS` pitches for touch, 0 for
 *   mouse and pen.
 */
export function liftAt(
  pointerY: number,
  grab: PiecePoint,
  board: BoardGeometry,
  fullLift: number,
): number {
  const unliftedTop = pointerY - grab.y * board.pitch;
  const ramp = (unliftedTop - board.top) / (LIFT_RAMP_CELLS * board.pitch);
  return fullLift * Math.min(Math.max(ramp, 0), 1);
}

/**
 * The floating piece's top-left corner for a pointer position, keeping the grab point under the
 * pointer, raised by the lift.
 */
export function pieceTopLeft(
  pointer: ClientPoint,
  grab: PiecePoint,
  board: BoardGeometry,
  fullLift: number,
): ClientPoint {
  return {
    x: pointer.x - grab.x * board.pitch,
    y: pointer.y - grab.y * board.pitch - liftAt(pointer.y, grab, board, fullLift),
  };
}

/** The snap preview for the board to draw: the dragged piece's cells on the board. */
export type Preview = { piece: PieceId; cells: RowCol[]; valid: boolean };

/** Where a piece would land if dropped now. */
export type Snap = {
  /** Board row and column of the shape's top-left, rounded to the nearest cell. */
  row: number;
  col: number;
  /** The piece's cells that fall on the board. Empty when it doesn't overlap the board. */
  cellsOnBoard: RowCol[];
  /**
   * Whether the cell being held lands on the board. When it doesn't, the piece counts as dragged
   * off the board and a drop sends it to the tray, even if other cells still overlap the board.
   */
  overBoard: boolean;
  /** The placement, when every cell is on the board and free (the piece's own cells count as free). */
  origin: Cell | null;
};

/** Whether a row and column are on the board. */
const onBoard = (row: number, col: number) =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

/**
 * Snaps a floating piece to the board (specs/2026-09-25-single-player/SPEC.md §6): rounds its top-left to the nearest cell and
 * checks whether it can be placed there.
 *
 * @param state - The board. When moving a placed piece, its current cells count as free.
 * @param shape - `shapeOf(piece, orientation)`.
 * @param topLeft - The floating piece's top-left corner.
 * @param grabbed - The held cell within the piece (`grabbedCell`), which decides `overBoard`.
 */
export function snap(
  state: BoardState,
  piece: PieceId,
  orientation: Orientation,
  shape: Shape,
  topLeft: ClientPoint,
  board: BoardGeometry,
  grabbed: RowCol,
): Snap {
  const row = Math.round((topLeft.y - board.top) / board.pitch);
  const col = Math.round((topLeft.x - board.left) / board.pitch);
  const cells = shape.map(([r, c]) => [row + r, col + c] as const);
  const cellsOnBoard = cells.filter(([r, c]) => onBoard(r, c));
  const fits =
    cellsOnBoard.length === cells.length &&
    canPlace(state, piece, { orientation, origin: cellAt(row, col) });
  const overBoard = onBoard(row + grabbed[0], col + grabbed[1]);
  return { row, col, cellsOnBoard, overBoard, origin: fits ? cellAt(row, col) : null };
}

/** The board cell under a point, or null when the point is off the board. */
export function cellUnder(point: ClientPoint, board: BoardGeometry): RowCol | null {
  const row = Math.floor((point.y - board.top) / board.pitch);
  const col = Math.floor((point.x - board.left) / board.pitch);
  return onBoard(row, col) ? [row, col] : null;
}

/** Client position of a board cell's top-left corner. */
export const cellPosition = ([row, col]: RowCol, board: BoardGeometry): ClientPoint => ({
  x: board.left + col * board.pitch,
  y: board.top + row * board.pitch,
});
