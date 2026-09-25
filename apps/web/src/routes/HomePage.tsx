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

/** Smaller, to leave room for the Multiplayer button on short screens (an iPhone SE). */
const smallBoardStyle = {
  '--board-size': 'min(300px, 32dvh, var(--column-width) - 40px)',
} as CSSProperties;

/**
 * Home screen (specs/2026-09-25-single-player/SPEC.md §5, `design/Home.dc.html`): wordmark, tagline, a solved board, the
 * player's stats once they have solved a grid, Play, and Multiplayer in builds that have it
 * (specs/2026-09-25-multiplayer/SPEC.md §9).
 */
export function HomePage({ multiplayer = false }: { multiplayer?: boolean }) {
  const [stats] = useState(loadStats);
  const average = averageMs(stats);
  const titleId = useId();
  const blurbId = useId();
  const multiTitleId = useId();
  const multiBlurbId = useId();

  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <h1 className={styles.wordmark}>Cranny</h1>
        <p className={styles.tagline}>Nine pieces. Seven blocked squares. One grid to fill.</p>
      </header>

      <div
        className={styles.showcase}
        style={multiplayer ? smallBoardStyle : boardStyle}
        aria-hidden="true"
      >
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

        {multiplayer && (
          <Link
            to="/multiplayer"
            className={styles.multiplayer}
            aria-labelledby={multiTitleId}
            aria-describedby={multiBlurbId}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
              <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" />
              <path d="M18 13.8c2.1.8 3.5 3 3.5 5.7" />
            </svg>
            <span className={styles.playText}>
              <span id={multiTitleId} className={styles.playTitle}>
                Multiplayer
              </span>
              <span id={multiBlurbId} className={styles.multiplayerBlurb}>
                Play with friends in a room
              </span>
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        )}
      </div>
    </main>
  );
}
