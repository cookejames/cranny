import { useEffect } from 'react';
import styles from './Toast.module.css';

/** How long a toast stays up. */
export const TOAST_MS = 2500;

type ToastProps = {
  /** The message, or null for no toast. */
  message: string | null;
  /** Called when the toast has been up for `TOAST_MS`. */
  onDone: () => void;
};

/**
 * A short message at the bottom of the screen, such as "Link copied". It is always in the DOM
 * as a status region, so screen readers announce each new message.
 */
export function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div className={styles.region} role="status">
      {message !== null && <span className={styles.toast}>{message}</span>}
    </div>
  );
}
