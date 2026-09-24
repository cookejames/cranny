import { BOARD_SIZE } from '@cranny/engine';
import type { CSSProperties } from 'react';
import { spanOf } from './outline.ts';

/**
 * Board drawing proportions, in cell units (a cell is 1 wide). These are the single source of
 * truth: `boardMetricsStyle` passes them to CSS, so the CSS grid of cells and the SVG piece
 * overlay always agree.
 */

/** Gap between board cells as a fraction of a cell's width. */
export const CELL_GAP = 0.075;
/** Corner radius of pieces on the board, as a fraction of a cell (about 7 px on a 51 px cell). */
export const PIECE_RADIUS = 0.14;
/** Width of the whole 6×6 cell area: 6 cells plus 5 gaps. */
export const BOARD_SPAN = spanOf(BOARD_SIZE, CELL_GAP);

/** CSS variables for Board.module.css: `--cell-gap-ratio`, `--board-span`, `--piece-radius`. */
export const boardMetricsStyle = {
  '--cell-gap-ratio': CELL_GAP,
  '--board-span': BOARD_SPAN,
  '--piece-radius': PIECE_RADIUS,
} as CSSProperties;
