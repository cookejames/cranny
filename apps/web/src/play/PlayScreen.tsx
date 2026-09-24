import { generateGrid, PIECE_IDS, solve, type PieceId } from '@tessel/engine';
import { useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router';
import { Board } from '../board/Board.tsx';
import { FloatingPiece } from '../drag/FloatingPiece.tsx';
import { useDrag } from '../drag/useDrag.ts';
import {
  elapsedMs,
  isPlaced,
  newRound,
  placedCount,
  resumeRound,
  roundReducer,
  type RoundState,
} from '../game/round.ts';
import { clearRound, loadRound, saveRound } from '../storage/storage.ts';
import { Controls } from './Controls.tsx';
import { PlayHeader } from './PlayHeader.tsx';
import styles from './PlayScreen.module.css';
import { Results } from './Results.tsx';
import { Tray } from './Tray.tsx';

/** How long the completion celebration plays before Results (SPEC.md §5). */
export const CELEBRATION_MS = 700;
/** The celebration's length with `prefers-reduced-motion`: a simple fade. */
export const REDUCED_CELEBRATION_MS = 200;

type PlayScreenProps = {
  /** Generator version and seed that identify the grid. */
  version: number;
  seed: number;
  /** Canonical grid code for the header. */
  code: string;
  /** True when opened from a shared link rather than dealt by Play. */
  shared: boolean;
  /**
   * Development only: skip Start and place every piece but the Single, so one drop completes
   * the grid.
   */
  startSolved?: boolean;
};

/**
 * Initial round state: generates the grid (which runs the solver, so it happens once per screen,
 * not per render), then resumes this grid's saved round if there is one (SPEC.md §5).
 */
function initialRound({
  version,
  seed,
  code,
  startSolved,
}: Pick<PlayScreenProps, 'version' | 'seed' | 'code' | 'startSolved'>): RoundState {
  const grid = generateGrid(seed, version);
  const solution = startSolved ? solve(grid.blocked) : null;
  if (solution) {
    const orientations = Object.fromEntries(PIECE_IDS.map((id) => [id, solution[id].orientation]));
    const allButSingle = Object.fromEntries(
      PIECE_IDS.filter((id) => id !== 'M1').map((id) => [id, solution[id]]),
    );
    return resumeRound(grid, Date.now(), orientations, allButSingle) ?? newRound(grid);
  }
  const saved = loadRound();
  if (saved?.code === code) {
    const resumed = resumeRound(grid, saved.startedAt, saved.orientations, saved.placements);
    if (resumed) return resumed;
  }
  return newRound(grid);
}

/** Whether the player asked for less motion. */
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The play screen for one grid (SPEC.md §5). Before Start the board is hidden under a Start
 * button; Start reveals it and starts the clock. Pieces are selected, rotated and flipped in the
 * tray and dragged on and off the board (`useDrag`). The drop that fills the grid stops the
 * clock, plays the celebration, then shows Results. The round is saved after every change, so a
 * reload resumes it with the clock still running.
 */
export function PlayScreen({ version, seed, code, shared, startSolved = false }: PlayScreenProps) {
  const [round, dispatch] = useReducer(
    roundReducer,
    { version, seed, code, startSolved },
    initialRound,
  );
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();
  const placed = (piece: PieceId) => isPlaced(round, piece);
  const select = (piece: PieceId) => dispatch({ type: 'select', piece });
  const {
    boardRef,
    trayRef,
    floatingRef,
    lifted,
    floating,
    preview,
    onBoardPointerDown,
    onTrayPointerDown,
  } = useDrag({ round, active: round.status === 'playing', dispatch, onTrayTap: select });

  // Keep one round in progress (SPEC.md §5): this one while it's played, none once it's done.
  // Just opening a different grid discards another grid's round.
  useEffect(() => {
    if (round.status === 'playing' && round.startedAt !== null) {
      saveRound({
        code,
        startedAt: round.startedAt,
        placements: round.board.placements,
        orientations: round.orientations,
      });
    } else if (round.status === 'complete') {
      clearRound();
    } else if (loadRound()?.code !== code) {
      clearRound();
    }
  }, [round, code]);

  // Celebrate, then show Results.
  useEffect(() => {
    if (round.status !== 'complete') return;
    const ms = prefersReducedMotion() ? REDUCED_CELEBRATION_MS : CELEBRATION_MS;
    const timer = setTimeout(() => setShowResults(true), ms);
    return () => clearTimeout(timer);
  }, [round.status]);

  const nextGrid = () => navigate('/play');

  if (showResults) {
    return (
      <main className={styles.play}>
        <Results elapsedMs={elapsedMs(round, round.finishedAt ?? 0)} onNextGrid={nextGrid} />
      </main>
    );
  }

  const preStart = round.status === 'pre-start';
  return (
    <main className={styles.play}>
      <PlayHeader
        code={code}
        shared={shared}
        startedAt={round.startedAt}
        finishedAt={round.finishedAt}
        isPlaced={placed}
      />
      <Board
        board={round.board}
        hideBlocked={preStart}
        ref={boardRef}
        lifted={lifted}
        preview={preview}
        onPointerDown={onBoardPointerDown}
        celebrating={round.status === 'complete'}
        overlay={
          preStart && (
            <div className={styles.veil}>
              <button
                type="button"
                className={styles.start}
                onClick={() => dispatch({ type: 'start', at: Date.now() })}
              >
                Start
              </button>
            </div>
          )
        }
      />
      <Controls
        hasSelection={round.selected !== null}
        placedCount={placedCount(round)}
        onRotate={() => dispatch({ type: 'rotate' })}
        onFlip={() => dispatch({ type: 'flip' })}
        onClear={() => dispatch({ type: 'clear' })}
        onNewGrid={nextGrid}
      />
      <Tray
        orientations={round.orientations}
        isPlaced={placed}
        selected={round.selected}
        onSelect={select}
        onPiecePointerDown={onTrayPointerDown}
        lifted={lifted}
        ref={trayRef}
      />
      <FloatingPiece floating={floating} ref={floatingRef} />
    </main>
  );
}
