import { Stopwatch } from '../play/Stopwatch.tsx';
import { formatCountdown } from './progress.ts';
import styles from './Room.module.css';
import { useNow } from './useNow.ts';

/** The close-out in progress: who finished first, and when the round ends (local time). */
export type CloseOut = { leader: string; closesAt: number };

type RoomHeaderProps = {
  room: string;
  /** The small line above the room name, e.g. "Round 2 · 4 players". */
  label: string;
  closeOut: CloseOut | null;
  /** This player's stopwatch, or null for none (sitting out). */
  stopwatch: { startedAt: number | null; finishedAt: number | null } | null;
  hideProgress: boolean;
  onToggleProgress: () => void;
  /** The back button: asks to leave the room. */
  onBack: () => void;
};

/**
 * The header of a room's play, waiting and sitting-out views
 * (specs/2026-09-25-multiplayer/SPEC.md §9): back (leave), the room name, or the close-out
 * banner counting down while it runs, the stopwatch and the Hide progress toggle.
 */
export function RoomHeader({
  room,
  label,
  closeOut,
  stopwatch,
  hideProgress,
  onToggleProgress,
  onBack,
}: RoomHeaderProps) {
  const now = useNow(closeOut !== null);
  return (
    <header className={styles.playHeader}>
      <button type="button" className={styles.back} aria-label="Leave the room" onClick={onBack}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      {closeOut ? (
        <div className={styles.titleBlock} data-closing="">
          <span className={styles.label}>{closeOut.leader} finished first</span>
          <h1 className={styles.playTitle}>
            {formatCountdown(closeOut.closesAt - now)} left
            <span className="visually-hidden"> in {room}</span>
          </h1>
        </div>
      ) : (
        <div className={styles.titleBlock}>
          <span className={styles.label}>{label}</span>
          <h1 className={styles.playTitle}>{room}</h1>
        </div>
      )}
      {stopwatch && (
        <Stopwatch
          className={styles.timer}
          startedAt={stopwatch.startedAt}
          finishedAt={stopwatch.finishedAt}
        />
      )}
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Hide progress"
        aria-pressed={hideProgress}
        onClick={onToggleProgress}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {hideProgress && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </header>
  );
}
