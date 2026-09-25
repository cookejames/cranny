import { PIECE_IDS, PIECES, type PieceId } from '@cranny/engine';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import styles from './PlayHeader.module.css';
import { Stopwatch } from './Stopwatch.tsx';

type PlayHeaderProps = {
  /** Canonical grid code, shown as "Grid <code>". */
  code: string;
  /** True when the grid was opened from a link rather than dealt by Play (specs/2026-09-25-single-player/SPEC.md §5). */
  shared: boolean;
  /** When Start was pressed; null before. */
  startedAt: number | null;
  /** When the grid was completed; the clock stops there. */
  finishedAt: number | null;
  isPlaced: (piece: PieceId) => boolean;
};

/**
 * The play screen's header (back link, mode and grid, stopwatch) and progress row ("N of 9
 * placed" plus a pip per piece in its colour once placed).
 */
export function PlayHeader({ code, shared, startedAt, finishedAt, isPlaced }: PlayHeaderProps) {
  const placed = PIECE_IDS.filter(isPlaced).length;
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
        <Stopwatch className={styles.timer} startedAt={startedAt} finishedAt={finishedAt} />
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
