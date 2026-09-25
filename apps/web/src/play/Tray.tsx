import { PIECE_IDS, PIECES, type Orientation, type PieceId } from '@cranny/engine';
import type { MouseEvent, PointerEvent, Ref } from 'react';
import { PieceShape } from '../board/PieceShape.tsx';
import styles from './Tray.module.css';

type TrayProps = {
  orientations: Record<PieceId, Orientation>;
  isPlaced: (piece: PieceId) => boolean;
  selected: PieceId | null;
  /** Selects a piece from the keyboard. Pointer taps come through `onPiecePointerDown`. */
  onSelect: (piece: PieceId) => void;
  /** A pointer went down on a piece's tile: the start of a tap or a drag (see `useDrag`). */
  onPiecePointerDown?: (piece: PieceId, event: PointerEvent<HTMLElement>) => void;
  /**
   * A piece being dragged or flying back: an unplaced piece's tile shows an empty slot meanwhile.
   * A placed piece moved on the board keeps its faded "Placed" tile.
   */
  lifted?: PieceId | null;
  /** Attached to the tray; tiles carry `data-piece` so a returning piece can find its slot. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * The 3×3 tray of pieces in spec order (specs/2026-09-25-single-player/SPEC.md §5), each shown in its current orientation.
 * Placed pieces are faded and can't be selected.
 *
 * Pointer input is handed to `onPiecePointerDown`, which tells taps (select) from drags, so a
 * drag that ends on its own tile can't also select it. `click` is only used for keyboard
 * activation (Enter/Space), which has no pointer.
 */
export function Tray({
  orientations,
  isPlaced,
  selected,
  onSelect,
  onPiecePointerDown,
  lifted = null,
  ref,
}: TrayProps) {
  /** Keyboard activation only: a click with `detail === 0` didn't come from a pointer. */
  const onClick = (piece: PieceId) => (event: MouseEvent) => {
    if (event.detail === 0) onSelect(piece);
  };

  return (
    <div className={styles.tray} role="group" aria-label="Pieces" ref={ref}>
      {PIECE_IDS.map((id) => {
        const placed = isPlaced(id);
        const { name, cells } = PIECES[id];
        return (
          <button
            key={id}
            type="button"
            className={styles.tile}
            aria-pressed={selected === id}
            aria-label={`${name}, ${cells.length} ${cells.length === 1 ? 'square' : 'squares'}${placed ? ', placed' : ''}`}
            disabled={placed}
            data-piece={id}
            onPointerDown={(event) => onPiecePointerDown?.(id, event)}
            onClick={onClick(id)}
          >
            <span className={styles.shape} data-lifted={id === lifted && !placed ? '' : undefined}>
              <PieceShape piece={id} orientation={orientations[id]} />
            </span>
            <span className={styles.label} aria-hidden="true">
              {placed ? 'Placed' : `${name} · ${cells.length}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
