import { generateGrid, PIECE_IDS, solve, type PieceId } from '@tessel/engine';
import { useReducer } from 'react';
import { useNavigate } from 'react-router';
import { Board } from '../board/Board.tsx';
import { FloatingPiece } from '../drag/FloatingPiece.tsx';
import { useDrag } from '../drag/useDrag.ts';
import { isPlaced, newRound, placedCount, roundReducer } from '../game/round.ts';
import { Controls } from './Controls.tsx';
import { PlayHeader } from './PlayHeader.tsx';
import styles from './PlayScreen.module.css';
import { Tray } from './Tray.tsx';

type PlayScreenProps = {
  /** Generator version and seed that identify the grid. */
  version: number;
  seed: number;
  /** Canonical grid code for the header. */
  code: string;
  /** True when opened from a shared link rather than dealt by Play. */
  shared: boolean;
  /** Development only: start with the grid already solved, to check how placed pieces look. */
  startSolved?: boolean;
};

/**
 * Initial round state: generates the grid (which runs the solver, so it happens once per screen,
 * not per render) and optionally pre-fills the solver's solution.
 */
function initialRound({
  version,
  seed,
  startSolved,
}: Pick<PlayScreenProps, 'version' | 'seed' | 'startSolved'>) {
  const grid = generateGrid(seed, version);
  const round = newRound(grid);
  const solution = startSolved ? solve(grid.blocked) : null;
  if (!solution) return round;
  const orientations = { ...round.orientations };
  for (const id of PIECE_IDS) orientations[id] = solution[id].orientation;
  return { ...round, orientations, board: { ...round.board, placements: solution } };
}

/**
 * The play screen for one grid (SPEC.md §5): header, progress, board, controls and tray. Pieces
 * are selected, rotated and flipped in the tray and dragged on and off the board (`useDrag`). The
 * Start button, running clock and completion arrive in Phase 5.
 */
export function PlayScreen({ version, seed, code, shared, startSolved = false }: PlayScreenProps) {
  const [round, dispatch] = useReducer(roundReducer, { version, seed, startSolved }, initialRound);
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
  } = useDrag({ round, dispatch, onTrayTap: select });

  return (
    <main className={styles.play}>
      <PlayHeader code={code} shared={shared} elapsedMs={0} isPlaced={placed} />
      <Board
        board={round.board}
        ref={boardRef}
        lifted={lifted}
        preview={preview}
        onPointerDown={onBoardPointerDown}
      />
      <Controls
        hasSelection={round.selected !== null}
        placedCount={placedCount(round)}
        onRotate={() => dispatch({ type: 'rotate' })}
        onFlip={() => dispatch({ type: 'flip' })}
        onClear={() => dispatch({ type: 'clear' })}
        onNewGrid={() => navigate('/play')}
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
