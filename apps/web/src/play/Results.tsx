import type { BoardState } from '@tessel/engine';
import { useCallback, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Board } from '../board/Board.tsx';
import { formatTime } from '../game/formatTime.ts';
import type { SolveOutcome } from '../game/stats.ts';
import { shareGrid, shareText } from '../share/share.ts';
import styles from './Results.module.css';
import { Toast } from './Toast.tsx';

type ResultsProps = {
  /** Canonical grid code, for the label and the share link. */
  code: string;
  /** True when the grid came from a shared link. */
  shared: boolean;
  /** The solved board, shown as a thumbnail. */
  board: BoardState;
  outcome: SolveOutcome;
  onNextGrid: () => void;
};

/** The thumbnail's size: 220 px as designed, smaller on short screens so everything fits. */
const thumbnailStyle = { '--board-size': 'min(220px, 28dvh)' } as CSSProperties;

/** Toast text for a share that needs one. */
const SHARE_TOASTS: Partial<Record<Awaited<ReturnType<typeof shareGrid>>, string>> = {
  copied: 'Link copied',
  failed: 'Couldn’t copy the link',
};

/**
 * The Results view after a solve (SPEC.md §5, `design/Complete.dc.html`): the final time, a
 * personal-best flag, the solved board, stats cards, and Next grid, Share grid and Home.
 */
export function Results({ code, shared, board, outcome, onNextGrid }: ResultsProps) {
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  /** Shares the grid link, with a toast if it was copied instead or couldn't be shared. */
  const share = async () => {
    const url = new URL(`/g/${code}`, window.location.origin).href;
    const result = await shareGrid(shareText(outcome.ms), url);
    setToast(SHARE_TOASTS[result] ?? null);
  };

  return (
    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.column}>
        <div className={styles.heading}>
          <span className={styles.label}>
            {shared ? 'Shared grid' : 'Beat the clock'} · Grid {code}
          </span>
          <h1 id="results-title" className={styles.title}>
            Grid complete
          </h1>
        </div>

        <div className={styles.timeBlock}>
          <p className={styles.time}>
            <span className="visually-hidden">Time </span>
            {formatTime(outcome.ms, { tenths: true })}
          </p>
          {outcome.newBest && (
            <p className={styles.best}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="M6 11l6-6 6 6" />
              </svg>
              New personal best
            </p>
          )}
        </div>

        <div className={styles.thumbnail} style={thumbnailStyle} aria-hidden="true">
          <Board board={board} />
        </div>

        <dl className={styles.cards}>
          <div className={styles.card}>
            <dt>Previous best</dt>
            <dd>{outcome.previousBestMs === null ? '—' : formatTime(outcome.previousBestMs)}</dd>
          </div>
          <div className={styles.card}>
            <dt>Average</dt>
            <dd>{formatTime(outcome.averageMs)}</dd>
          </div>
          <div className={styles.card}>
            <dt>Solved</dt>
            <dd>{outcome.solved}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onNextGrid}>
            Next grid
          </button>
          <div className={styles.secondaryRow}>
            <button type="button" className={styles.secondary} onClick={() => void share()}>
              Share grid
            </button>
            <Link to="/" className={styles.secondary}>
              Home
            </Link>
          </div>
        </div>
      </div>
      <Toast message={toast} onDone={hideToast} />
    </section>
  );
}
