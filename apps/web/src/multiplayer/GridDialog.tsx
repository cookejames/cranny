import type { BoardState } from '@cranny/engine';
import { useEffect, useId, useRef, type CSSProperties, type MouseEvent } from 'react';
import { Board } from '../board/Board.tsx';
import styles from './Room.module.css';

/** What the modal shows: whose grid, how they did, and the board. */
export type GridView = {
  /** "Teal Otter’s grid" or "Your grid". */
  title: string;
  /** "1st · 0:42.3" or "Didn’t finish · 6 of 9 pieces". */
  summary: string;
  board: BoardState;
};

type GridDialogProps = {
  /** Null while closed. */
  view: GridView | null;
  onClose: () => void;
};

/** Sizes the board to fit a phone, leaving room for the heading and the dialog's padding. */
const boardStyle = { '--board-size': 'min(360px, calc(100vw - 64px), 60dvh)' } as CSSProperties;

/**
 * A player's grid after a round (specs/2026-09-26-player-grids/SPEC.md §4.2): a native modal
 * `<dialog>`, so the browser traps focus and gives it back to the button that opened it. The ×
 * button, Escape and a tap outside the grid all close it. The board is read-only.
 */
export function GridDialog({ view, onClose }: GridDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const summaryId = useId();
  const open = view !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** A click on the backdrop lands on the dialog itself, outside its content box. */
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles.gridDialog}`}
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={onClick}
    >
      {view && (
        <div className={styles.gridDialogBody}>
          <div className={styles.gridDialogHeader}>
            <div className={styles.gridDialogHeading}>
              <h2 id={titleId} className={styles.dialogTitle}>
                {view.title}
              </h2>
              <p id={summaryId} className={styles.gridDialogSummary}>
                {view.summary}
              </p>
            </div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close"
              onClick={onClose}
              autoFocus
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className={styles.gridDialogBoard} style={boardStyle}>
            <Board board={view.board} />
          </div>
        </div>
      )}
    </dialog>
  );
}
