import { PIECES, shapeOf, type Orientation, type PieceId } from '@tessel/engine';
import type { CSSProperties } from 'react';
import styles from './PieceShape.module.css';
import { outlinePath, spanOf } from './outline.ts';

/** Gap between a piece's cells in small previews (2 px on an 11 px cell in the design). */
export const PREVIEW_GAP = 2 / 11;
/** Corner radius of small previews, as a fraction of a cell. */
export const PREVIEW_RADIUS = 0.2;

type PieceShapeProps = {
  piece: PieceId;
  orientation: Orientation;
  /** Gap between cells as a fraction of a cell. Pass the board's values to draw at board scale. */
  gap?: number;
  /** Corner radius as a fraction of a cell. */
  radius?: number;
};

/**
 * A piece drawn on its own in an orientation, as a merged outlined shape. Its size comes from the
 * `--shape-cell` CSS variable (one cell's width), which the parent sets, so the same component
 * serves tray previews and board-scale pieces.
 */
export function PieceShape({
  piece,
  orientation,
  gap = PREVIEW_GAP,
  radius = PREVIEW_RADIUS,
}: PieceShapeProps) {
  const shape = shapeOf(piece, orientation);
  const cols = spanOf(Math.max(...shape.map(([, c]) => c)) + 1, gap);
  const rows = spanOf(Math.max(...shape.map(([r]) => r)) + 1, gap);
  const style = {
    '--piece': `var(--${PIECES[piece].colorToken})`,
    width: `calc(var(--shape-cell) * ${cols})`,
    height: `calc(var(--shape-cell) * ${rows})`,
  } as CSSProperties;
  return (
    <svg className={styles.shape} viewBox={`0 0 ${cols} ${rows}`} style={style} aria-hidden="true">
      <path d={outlinePath(shape, gap, radius)} />
    </svg>
  );
}
