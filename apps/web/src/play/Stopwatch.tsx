import { useEffect, useState } from 'react';
import { formatTime } from '../game/formatTime.ts';
import { elapsedMs } from '../game/round.ts';

/** How often the running clock redraws. It shows whole seconds, so 4 times a second is plenty. */
export const TICK_MS = 250;

type StopwatchProps = {
  /** When Start was pressed (`Date.now()`); null shows 0:00. */
  startedAt: number | null;
  /** When the grid was completed; the clock stops there. */
  finishedAt: number | null;
  className?: string | undefined;
};

/**
 * The wall-clock stopwatch (specs/2026-09-25-single-player/SPEC.md §7): `Date.now() - startedAt`, so it stays right across a
 * hidden tab, a locked phone or a reload. Only this component re-renders as it ticks.
 */
export function Stopwatch({ startedAt, finishedAt, className }: StopwatchProps) {
  const running = startedAt !== null && finishedAt === null;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, TICK_MS);
    // Timers are throttled in hidden tabs: catch up the moment the page is visible again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);

  const time = formatTime(elapsedMs({ startedAt, finishedAt }, now));
  return (
    <span className={className} role="timer" aria-label={`Time ${time}`}>
      {time}
    </span>
  );
}
