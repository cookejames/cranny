import { useEffect, useId, useRef, type MouseEvent } from 'react';
import styles from './Room.module.css';

type LeaveDialogProps = {
  room: string;
  open: boolean;
  /** Leaving is under way: the buttons are disabled. */
  leaving: boolean;
  onLeave: () => void;
  onStay: () => void;
};

/**
 * The leave confirmation (specs/2026-09-25-multiplayer/SPEC.md §9, §12): a native modal
 * `<dialog>`, so focus is trapped and restored by the browser. Stay has focus; Escape and a tap
 * outside also mean Stay.
 */
export function LeaveDialog({ room, open, leaving, onLeave, onStay }: LeaveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** A click on the backdrop lands on the dialog itself, outside its content box. */
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !leaving) onStay();
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!leaving) onStay();
      }}
      onClick={onClick}
    >
      <div className={styles.dialogBody}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Leave {room}?
        </h2>
        <p id={descriptionId} className={styles.dialogText}>
          You’ll leave the game and your score will be removed from the scoreboard. If you rejoin,
          you’ll start again from 0.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondary} onClick={onLeave} disabled={leaving}>
            {leaving ? 'Leaving…' : 'Leave'}
          </button>
          {/* Stay is the safe choice, so it has focus when the dialog opens. */}
          <button
            type="button"
            className={styles.primary}
            onClick={onStay}
            disabled={leaving}
            autoFocus
          >
            Stay
          </button>
        </div>
      </div>
    </dialog>
  );
}
