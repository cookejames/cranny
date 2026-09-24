import { decodeGridCode, encodeGridCode, GridCodeError } from '@tessel/engine';
import { Link, Navigate, useParams } from 'react-router';
import styles from './GridPage.module.css';

/**
 * `/g/:code`: the play screen for one grid. Placeholder shell for Phase 2: it validates the
 * code, normalises the URL, and lays out the sized board area. The board, tray, controls and
 * game flow are built in Phases 3–5.
 */
export function GridPage() {
  const { code = '' } = useParams();
  const decoded = decodeGridCode(code);

  if (decoded instanceof GridCodeError) {
    return (
      <main className={styles.error}>
        <p>{decoded.message}</p>
        <Link to="/play" className={styles.newGrid}>
          Play a new grid
        </Link>
      </main>
    );
  }

  // Show one canonical URL per grid (e.g. `1xdwt5h` or `IXDWT5H` → `1XDWT5H`).
  const canonical = encodeGridCode(decoded);
  if (canonical !== code) return <Navigate to={`/g/${canonical}`} replace />;

  return (
    <main className={styles.play}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} aria-label="Home">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className={styles.title}>
          <span className={styles.mode}>Beat the clock</span>
          <span className={styles.grid}>Grid {canonical}</span>
        </div>
        <span className={styles.timer}>0:00</span>
      </header>
      <div className={styles.board} data-testid="board-area" />
    </main>
  );
}
