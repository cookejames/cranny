import { Link } from 'react-router';
import { formatTime } from '../game/formatTime.ts';
import styles from './Results.module.css';

type ResultsProps = {
  /** The final time on the clock. */
  elapsedMs: number;
  onNextGrid: () => void;
};

/**
 * Shown once a grid is complete (SPEC.md §5): the final time and the way on. Phase 6 (TASKS.md
 * T6.2) adds personal bests, stats, the board thumbnail and sharing.
 */
export function Results({ elapsedMs, onNextGrid }: ResultsProps) {
  return (
    <section className={styles.results} aria-labelledby="results-title">
      <h2 id="results-title" className={styles.title}>
        Grid complete
      </h2>
      <p className={styles.time}>{formatTime(elapsedMs, { tenths: true })}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onNextGrid}>
          Next grid
        </button>
        <Link to="/" className={styles.secondary}>
          Home
        </Link>
      </div>
    </section>
  );
}
