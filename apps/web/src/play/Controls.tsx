import { useEffect, useState } from 'react';
import styles from './Controls.module.css';

/** How long "Tap again to skip" waits for the second tap (specs/2026-09-25-single-player/SPEC.md §5). */
export const SKIP_CONFIRM_MS = 3000;

type ControlsProps = {
  /** Whether a tray piece is selected, which enables Rotate and Flip. */
  hasSelection: boolean;
  /** Pieces on the board. Clear needs at least one; New grid asks for confirmation if any. */
  placedCount: number;
  onRotate: () => void;
  onFlip: () => void;
  onClear: () => void;
  /** Disables every button, e.g. once a multiplayer round has ended. */
  disabled?: boolean;
  /** Without it there is no New grid button, as in multiplayer. */
  onNewGrid?: (() => void) | undefined;
};

/**
 * The play screen's buttons (specs/2026-09-25-single-player/SPEC.md §5): Rotate and Flip act on the selected tray piece,
 * Clear returns placed pieces to the tray, and New grid (solo only) skips to another grid. Once any piece is
 * placed, New grid needs a second tap within {@link SKIP_CONFIRM_MS} to avoid accidental skips.
 */
export function Controls({
  hasSelection,
  placedCount,
  onRotate,
  onFlip,
  onClear,
  onNewGrid,
  disabled = false,
}: ControlsProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), SKIP_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  // Clearing the board while confirming makes the confirmation moot.
  const askingToSkip = confirming && placedCount > 0;

  /** Skips to a new grid, or asks for a second tap first if any piece is placed. */
  const newGrid = () => {
    if (placedCount === 0 || askingToSkip) onNewGrid?.();
    else setConfirming(true);
  };

  return (
    <div className={styles.controls} data-buttons={onNewGrid ? 4 : 3}>
      <button
        type="button"
        className={styles.primary}
        onClick={onRotate}
        disabled={disabled || !hasSelection}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v5h-5" />
        </svg>
        Rotate
      </button>
      <button
        type="button"
        className={styles.primary}
        onClick={onFlip}
        disabled={disabled || !hasSelection}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18" />
          <path d="M8 7l-5 5 5 5" />
          <path d="M16 7l5 5-5 5" />
        </svg>
        Flip
      </button>
      <button
        type="button"
        className={styles.secondary}
        onClick={onClear}
        disabled={disabled || placedCount === 0}
      >
        Clear
      </button>
      {onNewGrid && (
        <button
          type="button"
          className={askingToSkip ? styles.confirm : styles.secondary}
          onClick={newGrid}
        >
          {askingToSkip ? 'Tap again to skip' : 'New grid'}
        </button>
      )}
      {/* A separate live region: announcements from a focused button's own text are unreliable. */}
      <span role="status" className="visually-hidden">
        {askingToSkip ? 'Tap New grid again within 3 seconds to skip this grid.' : ''}
      </span>
    </div>
  );
}
