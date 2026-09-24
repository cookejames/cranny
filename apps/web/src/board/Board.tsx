import {
  BOARD_SIZE,
  cellAt,
  cellsOf,
  colOf,
  occupancy,
  PIECE_IDS,
  PIECES,
  rowOf,
  type BoardState,
  type Occupant,
  type PieceId,
} from '@cranny/engine';
import {
  useId,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
} from 'react';
import type { Preview } from '../drag/snap.ts';
import styles from './Board.module.css';
import { BOARD_SPAN, boardMetricsStyle, CELL_GAP, PIECE_RADIUS } from './metrics.ts';
import { outlinePath } from './outline.ts';

const INDICES = Array.from({ length: BOARD_SIZE }, (_, i) => i);

/** Describes a cell for screen readers, e.g. "Row 2, column 5: Tee". */
function cellLabel(row: number, col: number, occupant: Occupant) {
  const what = occupant === 'X' ? 'blocked' : occupant ? PIECES[occupant].name : 'empty';
  return `Row ${row + 1}, column ${col + 1}: ${what}`;
}

type BoardProps = {
  board: BoardState;
  /**
   * Draw every cell as empty and leave the blocked cells out of the DOM entirely, so the layout
   * can't be read before the clock starts (SPEC.md §5, pre-start).
   */
  hideBlocked?: boolean;
  /** A piece being dragged (or flying back): drawn by the floating layer, so left off the board. */
  lifted?: PieceId | null;
  /** Where the dragged piece would land: a tinted ghost if valid, red cell outlines if not. */
  preview?: Preview | null;
  /** Attached to the cell area, which drag maths measures. */
  ref?: Ref<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  /** Drawn over the board, e.g. the Start button before the clock starts. */
  overlay?: ReactNode;
  /** Play the completion celebration: a sweep of light and a pulse of the pieces. */
  celebrating?: boolean;
};

/** CSS variable pointing a shape at its piece colour. */
const pieceColour = (id: PieceId) =>
  ({ '--piece': `var(--${PIECES[id].colorToken})` }) as CSSProperties;

/** Start of cell `index` along either axis, in board units. */
const cellStart = (index: number) => index * (1 + CELL_GAP);

/**
 * The 6×6 board (SPEC.md §9): a CSS grid of empty and blocked cells, with placed pieces drawn on
 * top as merged SVG shapes so each piece reads as one outlined shape, not just a colour.
 */
export function Board({
  board,
  hideBlocked = false,
  lifted = null,
  preview = null,
  ref,
  onPointerDown,
  overlay,
  celebrating = false,
}: BoardProps) {
  const clipPrefix = useId();
  const occ = occupancy(board);
  return (
    <div
      className={styles.board}
      style={boardMetricsStyle}
      onPointerDown={onPointerDown}
      data-celebrating={celebrating ? '' : undefined}
    >
      <div className={styles.cells} role="grid" aria-label="Board" ref={ref}>
        {INDICES.map((row) => (
          <div role="row" className={styles.row} key={row}>
            {INDICES.map((col) => {
              const raw = occ[cellAt(row, col)] ?? null;
              const occupant = hideBlocked && raw === 'X' ? null : raw;
              return (
                <div
                  role="gridcell"
                  key={col}
                  aria-label={cellLabel(row, col, occupant)}
                  className={occupant === 'X' ? styles.blocked : styles.cell}
                  data-occupied={occupant && occupant !== 'X' ? '' : undefined}
                >
                  {occupant === 'X' && <span className={styles.peg} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <svg className={styles.pieces} viewBox={`0 0 ${BOARD_SPAN} ${BOARD_SPAN}`} aria-hidden="true">
        {PIECE_IDS.map((id) => {
          const placement = board.placements[id];
          const cells = id !== lifted && placement && cellsOf(id, placement);
          if (!cells) return null;
          const d = outlinePath(
            cells.map((cell) => [rowOf(cell), colOf(cell)] as const),
            CELL_GAP,
            PIECE_RADIUS,
          );
          const clipId = `${clipPrefix}-${id}`;
          // The stroke is clipped to the shape so the outline sits inside it and doesn't eat
          // into the gap between neighbouring pieces.
          return (
            <g key={id} style={pieceColour(id)} data-piece={id}>
              <clipPath id={clipId}>
                <path d={d} />
              </clipPath>
              <path d={d} className={styles.piece} clipPath={`url(#${clipId})`} />
            </g>
          );
        })}
        {preview?.valid && (
          <path
            className={styles.ghost}
            style={pieceColour(preview.piece)}
            d={outlinePath(preview.cells, CELL_GAP, PIECE_RADIUS)}
            data-preview="valid"
          />
        )}
        {preview &&
          !preview.valid &&
          preview.cells.map(([row, col]) => (
            <rect
              key={`${row},${col}`}
              className={styles.invalid}
              x={cellStart(col)}
              y={cellStart(row)}
              width={1}
              height={1}
              rx={PIECE_RADIUS}
              data-preview="invalid"
            />
          ))}
      </svg>
      {overlay}
    </div>
  );
}
