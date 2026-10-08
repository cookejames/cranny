import { PIECE_IDS, PIECES } from '@cranny/engine';
import { useId } from 'react';
import { Link } from 'react-router';
import { PieceShape } from '../board/PieceShape.tsx';
import { usePageMeta } from '../seo/pageMeta.ts';
import styles from './HowToPlayPage.module.css';

/** The orientation pieces are shown in: as the engine defines them. */
const UPRIGHT = { rot: 0, flip: false } as const;

/**
 * `/how-to-play` (specs/2026-10-08-seo/SPEC.md §4): the rules, the piece set, the controls and
 * the modes, as text search engines can index, with a way into a game. Multiplayer is described
 * only in builds that have it.
 */
export function HowToPlayPage({ multiplayer = false }: { multiplayer?: boolean }) {
  usePageMeta({ title: 'How to play Cranny – a quick block puzzle game', path: '/how-to-play' });
  const rulesId = useId();
  const piecesId = useId();
  const controlsId = useId();
  const modesId = useId();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} aria-label="Home">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className={styles.title}>How to play Cranny</h1>
      </header>

      <p className={styles.lede}>
        Cranny is a quick block puzzle game. Each grid is a 6×6 board with seven blocked squares and
        nine pieces to fit around them. Fill every gap to solve it.
      </p>

      <section className={styles.section} aria-labelledby={rulesId}>
        <h2 id={rulesId} className={styles.heading}>
          The rules
        </h2>
        <ul className={styles.list}>
          <li>
            Place all nine pieces on the grid, without overlapping or covering a blocked square.
          </li>
          <li>
            The pieces cover exactly the 29 open squares, so a solved grid has no gaps left over.
          </li>
          <li>Pieces can be rotated and flipped. Every grid has at least one solution.</li>
          <li>The clock starts when you press Start and stops when the last piece goes in.</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={piecesId}>
        <h2 id={piecesId} className={styles.heading}>
          The pieces
        </h2>
        <ul className={styles.pieces}>
          {PIECE_IDS.map((id) => (
            <li key={id} className={styles.piece}>
              <PieceShape piece={id} orientation={UPRIGHT} />
              <span>
                {PIECES[id].name}, {PIECES[id].cells.length}{' '}
                {PIECES[id].cells.length === 1 ? 'square' : 'squares'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={controlsId}>
        <h2 id={controlsId} className={styles.heading}>
          Controls
        </h2>
        <ul className={styles.list}>
          <li>Drag a piece from the tray onto the grid. It snaps into place where it fits.</li>
          <li>Tap a piece in the tray to select it, then use Rotate and Flip to turn it.</li>
          <li>Drag a placed piece to move it, or off the grid to take it back.</li>
          <li>Clear takes every piece off, and New grid deals a fresh one.</li>
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={modesId}>
        <h2 id={modesId} className={styles.heading}>
          Ways to play
        </h2>
        <ul className={styles.list}>
          <li>
            <strong>Solo:</strong> race the clock. Your best and average times are kept on this
            device, and you can share a grid you've solved as a link to challenge a friend.
          </li>
          {multiplayer && (
            <li>
              <strong>Multiplayer:</strong> create a room and share its name. Everyone gets the same
              grid each round, and points go by finishing order.
            </li>
          )}
        </ul>
      </section>

      <Link to="/play" className={styles.play}>
        Play a grid
      </Link>
    </main>
  );
}
