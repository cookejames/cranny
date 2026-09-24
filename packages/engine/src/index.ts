// Tessel rules engine: pure TypeScript, no DOM or framework dependencies (SPEC.md §4).
export type {
  BoardState,
  Cell,
  Grid,
  Occupant,
  Orientation,
  PieceId,
  Placement,
  Shape,
} from './types.ts';
export {
  BLOCKED_COUNT,
  BOARD_SIZE,
  CELL_COUNT,
  PIECE_IDS,
  PIECES,
  type PieceDef,
} from './pieces.ts';
export {
  cellAt,
  cellsOf,
  colOf,
  isPieceId,
  isValidBlocked,
  isValidCell,
  isValidOrientation,
  orientationsOf,
  rowOf,
  shapeOf,
  uniqueOrientations,
} from './geometry.ts';
export { canPlace, clear, isSolved, newBoard, occupancy, place, remove } from './board.ts';
export { solve } from './solver.ts';
export { MAX_SEED, isValidSeed, mulberry32, randomSeed } from './random.ts';
export { CURRENT_VERSION, SUPPORTED_VERSIONS, generateGrid } from './generator.ts';
export {
  GRID_CODE_LENGTH,
  GridCodeError,
  decodeGridCode,
  encodeGridCode,
  type GridCodeErrorKind,
} from './codes.ts';
