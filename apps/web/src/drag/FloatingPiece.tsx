import type { CSSProperties, Ref } from 'react';
import { CELL_GAP, PIECE_RADIUS } from '../board/metrics.ts';
import { PieceShape } from '../board/PieceShape.tsx';
import styles from './FloatingPiece.module.css';
import type { Floating } from './useDrag.ts';

type FloatingPieceProps = {
  floating: Floating | null;
  /** `useDrag` positions the piece by setting this element's transform directly. */
  ref: Ref<HTMLDivElement>;
};

/**
 * The piece under the pointer during a drag, drawn at board scale in a fixed layer over the whole
 * screen so it can move between the tray and the board.
 */
export function FloatingPiece({ floating, ref }: FloatingPieceProps) {
  if (!floating) return null;
  const style = { '--shape-cell': `${floating.cellSize}px` } as CSSProperties;
  return (
    <div className={styles.floating} style={style} ref={ref} aria-hidden="true" data-floating>
      <PieceShape
        piece={floating.piece}
        orientation={floating.orientation}
        gap={CELL_GAP}
        radius={PIECE_RADIUS}
      />
    </div>
  );
}
