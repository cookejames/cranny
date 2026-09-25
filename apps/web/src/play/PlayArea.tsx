import type { PieceId } from '@cranny/engine';
import type { ReactNode } from 'react';
import { Board } from '../board/Board.tsx';
import { FloatingPiece } from '../drag/FloatingPiece.tsx';
import { useDrag } from '../drag/useDrag.ts';
import { isPlaced, placedCount, type RoundAction, type RoundState } from '../game/round.ts';
import { Controls } from './Controls.tsx';
import { Tray } from './Tray.tsx';

type PlayAreaProps = {
  round: RoundState;
  dispatch: (action: RoundAction) => void;
  /** Freezes the board, tray and controls mid-round (multiplayer, when time is up). */
  locked?: boolean;
  /** Draw the board without its blocked cells, which stay out of the DOM (before the reveal). */
  hideBlocked?: boolean;
  /** Drawn over the board, e.g. the Start button or the 3-2-1. */
  overlay?: ReactNode;
  /** Play the completion celebration. */
  celebrating?: boolean;
  /** Shows New grid, which calls this; without it there is no New grid button (multiplayer). */
  onNewGrid?: (() => void) | undefined;
};

/**
 * The play area shared by solo and multiplayer (specs/2026-09-25-multiplayer/SPEC.md §9): the
 * board, the controls, the tray and drag and drop. The caller owns the round state and the
 * header above it.
 */
export function PlayArea({
  round,
  dispatch,
  locked = false,
  hideBlocked = false,
  overlay,
  celebrating = false,
  onNewGrid,
}: PlayAreaProps) {
  const active = round.status === 'playing' && !locked;
  const placed = (piece: PieceId) => isPlaced(round, piece);
  const select = (piece: PieceId) => {
    if (active) dispatch({ type: 'select', piece });
  };
  const {
    boardRef,
    trayRef,
    floatingRef,
    lifted,
    floating,
    preview,
    onBoardPointerDown,
    onTrayPointerDown,
  } = useDrag({ round, active, dispatch, onTrayTap: select });

  return (
    <>
      <Board
        board={round.board}
        hideBlocked={hideBlocked}
        ref={boardRef}
        lifted={lifted}
        preview={preview}
        onPointerDown={onBoardPointerDown}
        celebrating={celebrating}
        overlay={overlay}
      />
      <Controls
        hasSelection={round.selected !== null}
        placedCount={placedCount(round)}
        disabled={locked}
        onRotate={() => dispatch({ type: 'rotate' })}
        onFlip={() => dispatch({ type: 'flip' })}
        onClear={() => dispatch({ type: 'clear' })}
        onNewGrid={onNewGrid}
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
    </>
  );
}
