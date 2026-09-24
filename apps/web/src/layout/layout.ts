/**
 * Play-screen sizing (SPEC.md §9). The board is the largest square that fits the column width and
 * leaves room for everything else on the screen; tray tiles scale with it. Vertical stack, top to
 * bottom: header, progress row, board, controls row, 3 rows of tray tiles.
 */
export const LAYOUT = {
  /** Side gutter on each side of the column. */
  gutter: 20,
  /** Column width cap on tablets and desktops. */
  maxColumnWidth: 480,
  paddingTop: 16,
  paddingBottom: 16,
  /** Gap between the stacked sections. */
  gap: 12,
  header: 44,
  progress: 20,
  controls: 44,
  trayRows: 3,
  trayGap: 8,
  /** Tray tile height as a fraction of the board size (84 px at a 350 px board in the design). */
  tileRatio: 0.24,
  /** Below this the board would be too fiddly; the page scrolls instead of shrinking further. */
  minBoard: 240,
} as const;

export type Viewport = { width: number; height: number };

export type Layout = {
  /** Width of the centred content column. */
  columnWidth: number;
  /** Board edge length, including its frame padding. */
  board: number;
  /** Tray tile height. */
  tile: number;
  /** Total height of the play screen's content at these sizes. */
  contentHeight: number;
};

/** Everything on the play screen that doesn't scale with the board. */
const FIXED_HEIGHT =
  LAYOUT.paddingTop +
  LAYOUT.header +
  LAYOUT.gap +
  LAYOUT.progress +
  LAYOUT.gap +
  LAYOUT.gap +
  LAYOUT.controls +
  LAYOUT.gap +
  (LAYOUT.trayRows - 1) * LAYOUT.trayGap +
  LAYOUT.paddingBottom;

/** Play-screen height for a given board size. */
export function contentHeightFor(board: number): number {
  return FIXED_HEIGHT + board + LAYOUT.trayRows * Math.floor(board * LAYOUT.tileRatio);
}

/** Sizes for the play screen at a viewport size, in whole CSS pixels. */
export function computeLayout({ width, height }: Viewport): Layout {
  const columnWidth = Math.min(width, LAYOUT.maxColumnWidth);
  const byWidth = columnWidth - 2 * LAYOUT.gutter;
  const byHeight = (height - FIXED_HEIGHT) / (1 + LAYOUT.trayRows * LAYOUT.tileRatio);
  const board = Math.max(LAYOUT.minBoard, Math.floor(Math.min(byWidth, byHeight)));
  return {
    columnWidth,
    board,
    tile: Math.floor(board * LAYOUT.tileRatio),
    contentHeight: contentHeightFor(board),
  };
}
