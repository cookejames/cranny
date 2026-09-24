import { useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Board } from '../board/Board.tsx';
import { formatTime } from '../game/formatTime.ts';
import { averageMs } from '../game/stats.ts';
import { SHOWCASE_BOARD } from '../home/showcase.ts';
import { loadStats } from '../storage/storage.ts';
import styles from './HomePage.module.css';

/**
 * The decorative board: 300 px as designed, smaller on short or narrow screens. Sized from the
 * column width (set by AppFrame) rather than `100%`, which the board's height can't resolve.
 */
const boardStyle = {
  '--board-size': 'min(300px, 38dvh, var(--column-width) - 40px)',
} as CSSProperties;

/**
 * Home screen (SPEC.md §5, `design/Home.dc.html`): wordmark, tagline, a solved board, the
 * player's stats once they have solved a grid, and Play. There's no Race card in v1.
 */
export function HomePage() {
  const [stats] = useState(loadStats);
  const average = averageMs(stats);
  const titleId = useId();
  const blurbId = useId();

  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <h1 className={styles.wordmark}>Tessel</h1>
        <p className={styles.tagline}>Nine pieces. Seven blocked squares. One grid to fill.</p>
      </header>

      <div className={styles.showcase} style={boardStyle} aria-hidden="true">
        <Board board={SHOWCASE_BOARD} />
      </div>

      <div className={styles.bottom}>
        {stats.solved > 0 && (
          <dl className={styles.stats} aria-label="Your stats">
            <div className={styles.stat}>
              <dt>Best</dt>
              <dd>{stats.bestMs === null ? '—' : formatTime(stats.bestMs)}</dd>
            </div>
            <div className={styles.stat}>
              <dt>Average</dt>
              <dd>{average === null ? '—' : formatTime(average)}</dd>
            </div>
            <div className={styles.stat}>
              <dt>Solved</dt>
              <dd>{stats.solved}</dd>
            </div>
          </dl>
        )}

        <Link
          to="/play"
          className={styles.play}
          aria-labelledby={titleId}
          aria-describedby={blurbId}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2" />
            <path d="M10 2h4" />
          </svg>
          <span className={styles.playText}>
            <span id={titleId} className={styles.playTitle}>
              Play
            </span>
            <span id={blurbId} className={styles.playBlurb}>
              Beat the clock · fill the grid as fast as you can
            </span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </main>
  );
}
