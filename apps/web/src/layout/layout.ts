/**
 * Play-screen sizing (specs/2026-09-25-single-player/SPEC.md §9). The board is the largest square that fits the column width and
 * leaves room for everything else on the screen; tray tiles scale with it. Vertical stack, top to
 * bottom: header, progress row, board, controls row, 3 rows of tray tiles. In multiplayer the
 * progress row is the progress strip (specs/2026-09-25-multiplayer/SPEC.md §9), whose height
 * depends on how many opponents it shows ({@link stripHeight}).
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

/** The multiplayer progress strip: rows of bars, `perRow` to a row. Must match ProgressStrip.module.css. */
export const STRIP = { rowHeight: 20, rowGap: 4, perRow: 4 } as const;

/**
 * The progress strip's height for `opponents` bars, one row when empty, and 0 when hidden (it
 * leaves no line behind). Seven opponents, the most a room can have, take two rows.
 */
export function stripHeight(opponents: number, hidden: boolean): number {
  if (hidden) return 0;
  const rows = Math.max(1, Math.ceil(opponents / STRIP.perRow));
  return rows * STRIP.rowHeight + (rows - 1) * STRIP.rowGap;
}

/**
 * Everything on the play screen that doesn't scale with the board, for a progress row this tall.
 * A 0 px row isn't there at all, so it takes no gap either.
 */
const fixedHeight = (progress: number) =>
  LAYOUT.paddingTop +
  LAYOUT.header +
  (progress > 0 ? LAYOUT.gap + progress : 0) +
  LAYOUT.gap +
  LAYOUT.gap +
  LAYOUT.controls +
  LAYOUT.gap +
  (LAYOUT.trayRows - 1) * LAYOUT.trayGap +
  LAYOUT.paddingBottom;

/** Play-screen height for a given board size and progress row height. */
export function contentHeightFor(board: number, progress: number = LAYOUT.progress): number {
  return fixedHeight(progress) + board + LAYOUT.trayRows * Math.floor(board * LAYOUT.tileRatio);
}

/**
 * Sizes for the play screen at a viewport size, in whole CSS pixels.
 *
 * @param progress - The progress row's height: the solo row by default, or {@link stripHeight}.
 */
export function computeLayout(
  { width, height }: Viewport,
  progress: number = LAYOUT.progress,
): Layout {
  const columnWidth = Math.min(width, LAYOUT.maxColumnWidth);
  const byWidth = columnWidth - 2 * LAYOUT.gutter;
  const byHeight = (height - fixedHeight(progress)) / (1 + LAYOUT.trayRows * LAYOUT.tileRatio);
  const board = Math.max(LAYOUT.minBoard, Math.floor(Math.min(byWidth, byHeight)));
  return {
    columnWidth,
    board,
    tile: Math.floor(board * LAYOUT.tileRatio),
    contentHeight: contentHeightFor(board, progress),
  };
}
