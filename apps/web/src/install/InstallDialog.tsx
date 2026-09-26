import { useEffect, useId, useRef, type MouseEvent } from 'react';
import styles from './Install.module.css';

type InstallDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * How to install on iPhone and iPad (specs/2026-09-25-installable/SPEC.md §5), where Safari has
 * no install dialog to open. A native modal `<dialog>`, as the multiplayer leave dialog, so the
 * browser traps and restores focus; Escape and a tap outside close it.
 */
export function InstallDialog({ open, onClose }: InstallDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** A click on the backdrop lands on the dialog itself, outside its content box. */
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={onClick}
    >
      <div className={styles.dialogBody}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Install Cranny
        </h2>
        <ol className={styles.steps}>
          <li>
            Tap <strong>Share</strong>
            <svg
              className={styles.shareIcon}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="M8 7l4-4 4 4" />
              <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
            </svg>
            in Safari’s toolbar, or in its <strong>⋯</strong> menu.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
        </ol>
        <p className={styles.dialogNote}>
          The app keeps its own stats, separate from the ones in Safari.
        </p>
        <button type="button" className={styles.done} onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </dialog>
  );
}
