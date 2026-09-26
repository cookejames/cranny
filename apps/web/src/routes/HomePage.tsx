import { useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Board } from '../board/Board.tsx';
import { formatTime } from '../game/formatTime.ts';
import { averageMs } from '../game/stats.ts';
import { SHOWCASE_BOARD } from '../home/showcase.ts';
import { InstallDialog } from '../install/InstallDialog.tsx';
import { install, useInstallOption } from '../install/install.ts';
import installStyles from '../install/Install.module.css';
import { loadMultiplayerStats, loadStats, type Stats } from '../storage/storage.ts';
import styles from './HomePage.module.css';

/**
 * The decorative board: 300 px as designed, smaller on short or narrow screens. It takes the
 * height left over once everything else on Home is laid out (`100cqh` of the showcase, a size
 * container that fills the spare space), so Home fits a short screen (an iPhone SE) whichever of
 * the stats and Multiplayer are showing. The board is never smaller than 120 px: below that the
 * page scrolls instead (HomePage.module.css). `--board-cap` (300 px, or less in a narrow column)
 * is defined there too, because on desktops the showcase stops growing at it.
 */
const showcaseStyle = {
  '--board-size': 'min(var(--board-cap), 100cqh)',
} as CSSProperties;

/** Best and Average as shown on Home: whole seconds, or a dash before the first solve. */
function statTimes(stats: Stats): { best: string; average: string } {
  const average = averageMs(stats);
  return {
    best: stats.bestMs === null ? '—' : formatTime(stats.bestMs),
    average: average === null ? '—' : formatTime(average),
  };
}

/** The solo stats on their own: a tile each for Best, Average and Solved. */
function StatTiles({ stats }: { stats: Stats }) {
  const { best, average } = statTimes(stats);
  return (
    <dl className={styles.stats} aria-label="Your stats">
      <div className={styles.stat}>
        <dt>Best</dt>
        <dd>{best}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Average</dt>
        <dd>{average}</dd>
      </div>
      <div className={styles.stat}>
        <dt>Solved</dt>
        <dd>{stats.solved}</dd>
      </div>
    </dl>
  );
}

/**
 * Solo and multiplayer stats together (specs/2026-09-26-multiplayer-stats/SPEC.md §4): Best,
 * Average and Solved headed once, then a row per mode, so both fit where one row of tiles did.
 * A mode with no solves yet has no row.
 */
function StatsTable({ rows }: { rows: { mode: string; stats: Stats }[] }) {
  return (
    <table className={styles.statsTable} aria-label="Your stats">
      <thead>
        <tr>
          <td />
          <th scope="col">Best</th>
          <th scope="col">Average</th>
          <th scope="col">Solved</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ mode, stats }) => {
          const { best, average } = statTimes(stats);
          return (
            <tr key={mode}>
              <th scope="row">{mode}</th>
              <td>{best}</td>
              <td>{average}</td>
              <td>{stats.solved}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Home screen (specs/2026-09-25-single-player/SPEC.md §5, `design/Home.dc.html`): wordmark, with
 * Install app beside it where the app can be installed (specs/2026-09-25-installable/SPEC.md §5),
 * tagline, a solved board, the player's stats once they have solved a grid, with their
 * multiplayer stats alongside once they have finished a multiplayer round
 * (specs/2026-09-26-multiplayer-stats/SPEC.md §4), Play, and Multiplayer in builds that have it
 * (specs/2026-09-25-multiplayer/SPEC.md §9).
 */
export function HomePage({ multiplayer = false }: { multiplayer?: boolean }) {
  const [stats] = useState(loadStats);
  const [multiplayerStats] = useState(loadMultiplayerStats);
  const titleId = useId();
  const blurbId = useId();
  const multiTitleId = useId();
  const multiBlurbId = useId();
  const installOption = useInstallOption();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <div className={styles.titleRow}>
          <h1 className={styles.wordmark}>Cranny</h1>
          {installOption !== 'none' && (
            <button
              type="button"
              className={installStyles.button}
              aria-label="Install app"
              title="Install app"
              onClick={() =>
                installOption === 'ios' ? setInstructionsOpen(true) : void install.prompt()
              }
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4v11" />
                <path d="M7.5 10.5L12 15l4.5-4.5" />
                <path d="M5 19h14" />
              </svg>
            </button>
          )}
        </div>
        <p className={styles.tagline}>Nine pieces. Seven blocked squares. One grid to fill.</p>
      </header>

      <div className={styles.showcase} style={showcaseStyle}>
        <div aria-hidden="true">
          <Board board={SHOWCASE_BOARD} />
        </div>
      </div>

      <div className={styles.bottom}>
        {multiplayerStats.solved > 0 ? (
          <StatsTable
            rows={[
              ...(stats.solved > 0 ? [{ mode: 'Solo', stats }] : []),
              { mode: 'Multiplayer', stats: multiplayerStats },
            ]}
          />
        ) : (
          stats.solved > 0 && <StatTiles stats={stats} />
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

      <InstallDialog open={instructionsOpen} onClose={() => setInstructionsOpen(false)} />
    </main>
  );
}
