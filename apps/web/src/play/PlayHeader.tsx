import { PIECE_IDS, PIECES, type PieceId } from '@tessel/engine';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { formatTime } from '../game/formatTime.ts';
import styles from './PlayHeader.module.css';

type PlayHeaderProps = {
  /** Canonical grid code, shown as "Grid <code>". */
  code: string;
  /** True when the grid was opened from a link rather than dealt by Play (SPEC.md §5). */
  shared: boolean;
  elapsedMs: number;
  isPlaced: (piece: PieceId) => boolean;
};

/**
 * The play screen's header (back link, mode and grid, stopwatch) and progress row ("N of 9
 * placed" plus a pip per piece in its colour once placed).
 */
export function PlayHeader({ code, shared, elapsedMs, isPlaced }: PlayHeaderProps) {
  const placed = PIECE_IDS.filter(isPlaced).length;
  const time = formatTime(elapsedMs);
  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.back} aria-label="Home">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className={styles.title}>
          <span className={styles.mode}>{shared ? 'Shared grid' : 'Beat the clock'}</span>
          <h1 className={styles.grid}>Grid {code}</h1>
        </div>
        <span className={styles.timer} role="timer" aria-label={`Time ${time}`}>
          {time}
        </span>
      </header>
      <div className={styles.progress}>
        <span className={styles.count}>
          {placed} of {PIECE_IDS.length} placed
        </span>
        <div className={styles.pips} aria-hidden="true">
          {PIECE_IDS.map((id) => (
            <span
              key={id}
              className={styles.pip}
              style={
                isPlaced(id)
                  ? ({ background: `var(--${PIECES[id].colorToken})` } as CSSProperties)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
