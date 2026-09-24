import { Link } from 'react-router';
import styles from './HomePage.module.css';

/** Home screen (SPEC.md §5). Placeholder shell: the decorative board and stats row come in Phase 6. */
export function HomePage() {
  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <h1 className={styles.wordmark}>Tessel</h1>
        <p className={styles.tagline}>Nine pieces. Seven blocked squares. One grid to fill.</p>
      </header>
      <Link to="/play" className={styles.play}>
        Play
      </Link>
    </main>
  );
}
