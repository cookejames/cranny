import { PIECE_IDS, PIECES, type Orientation, type PieceId } from '@tessel/engine';
import { useRef, type MouseEvent, type PointerEvent } from 'react';
import { PieceShape } from '../board/PieceShape.tsx';
import { isTap, type ClientPoint } from '../drag/tap.ts';
import styles from './Tray.module.css';

type TrayProps = {
  orientations: Record<PieceId, Orientation>;
  isPlaced: (piece: PieceId) => boolean;
  selected: PieceId | null;
  onSelect: (piece: PieceId) => void;
};

/**
 * The 3×3 tray of pieces in spec order (SPEC.md §5), each shown in its current orientation.
 * Tapping a piece selects it for Rotate/Flip; placed pieces are faded and can't be selected.
 *
 * Taps are recognised from pointer events (down and up within `TAP_SLOP_PX`), not from
 * `click`, so a drag that ends on its own tile won't also select it. `click` is only used for
 * keyboard activation (Enter/Space), which has no pointer.
 */
export function Tray({ orientations, isPlaced, selected, onSelect }: TrayProps) {
  const pressed = useRef<{ piece: PieceId; at: ClientPoint } | null>(null);

  /** Remembers where a primary pointer went down on a tile. */
  const onPointerDown = (piece: PieceId) => (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    pressed.current = { piece, at: { x: event.clientX, y: event.clientY } };
  };

  /** Selects the tile if the pointer comes up close to where it went down. */
  const onPointerUp = (piece: PieceId) => (event: PointerEvent) => {
    const start = pressed.current;
    pressed.current = null;
    if (start?.piece === piece && isTap(start.at, { x: event.clientX, y: event.clientY })) {
      onSelect(piece);
    }
  };

  /** Keyboard activation only: a click with `detail === 0` didn't come from a pointer. */
  const onClick = (piece: PieceId) => (event: MouseEvent) => {
    if (event.detail === 0) onSelect(piece);
  };

  return (
    <div className={styles.tray} role="group" aria-label="Pieces">
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
            onPointerDown={onPointerDown(id)}
            onPointerUp={onPointerUp(id)}
            onPointerCancel={() => (pressed.current = null)}
            onClick={onClick(id)}
          >
            <span className={styles.shape}>
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
