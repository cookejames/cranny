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
} from '@tessel/engine';
import { useId, type CSSProperties } from 'react';
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
};

/**
 * The 6×6 board (SPEC.md §9): a CSS grid of empty and blocked cells, with placed pieces drawn on
 * top as merged SVG shapes so each piece reads as one outlined shape, not just a colour.
 */
export function Board({ board, hideBlocked = false }: BoardProps) {
  const clipPrefix = useId();
  const occ = occupancy(board);
  return (
    <div className={styles.board} style={boardMetricsStyle}>
      <div className={styles.cells} role="grid" aria-label="Board">
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
          const cells = placement && cellsOf(id, placement);
          if (!cells) return null;
          const d = outlinePath(
            cells.map((cell) => [rowOf(cell), colOf(cell)] as const),
            CELL_GAP,
            PIECE_RADIUS,
          );
          const clipId = `${clipPrefix}-${id}`;
          const style = { '--piece': `var(--${PIECES[id].colorToken})` } as CSSProperties;
          // The stroke is clipped to the shape so the outline sits inside it and doesn't eat
          // into the gap between neighbouring pieces.
          return (
            <g key={id} style={style} data-piece={id}>
              <clipPath id={clipId}>
                <path d={d} />
              </clipPath>
              <path d={d} className={styles.piece} clipPath={`url(#${clipId})`} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
