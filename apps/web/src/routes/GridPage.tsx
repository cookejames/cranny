import { decodeGridCode, encodeGridCode, GridCodeError } from '@cranny/engine';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { PlayScreen } from '../play/PlayScreen.tsx';
import styles from './GridPage.module.css';

/** Router state set by `/play`, marking a grid the game dealt rather than one from a link. */
export type DealtState = { dealt: true };

/** Whether router state marks the grid as dealt by `/play`. */
const isDealt = (state: unknown): state is DealtState =>
  typeof state === 'object' && state !== null && (state as DealtState).dealt === true;

/**
 * `/g/:code`: validates the grid code, normalises the URL to the canonical code, and shows the
 * play screen for that grid. A malformed or too-new code gets an explanation and a way out.
 */
export function GridPage() {
  const { code = '' } = useParams();
  const location = useLocation();
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

  // Show one canonical URL per grid (e.g. `1xdwt5h` or `IXDWT5H` → `1XDWT5H`), keeping the
  // router state so a dealt grid stays marked as dealt.
  const canonical = encodeGridCode(decoded);
  if (canonical !== code) {
    return <Navigate to={`/g/${canonical}`} replace state={location.state as unknown} />;
  }

  const startSolved = import.meta.env.DEV && new URLSearchParams(location.search).has('solve');
  return (
    <PlayScreen
      // A new grid gets a fresh screen and round state.
      key={canonical}
      version={decoded.version}
      seed={decoded.seed}
      code={canonical}
      shared={!isDealt(location.state)}
      startSolved={startSolved}
    />
  );
}
