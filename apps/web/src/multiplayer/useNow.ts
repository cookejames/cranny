import { useEffect, useState } from 'react';

/**
 * The current time (`Date.now()`), redrawn every `intervalMs` while `running`, so countdowns
 * tick. Catches up at once when a hidden tab becomes visible, since its timers are throttled.
 * While not running the value is left as it was, so only read it while running.
 */
export function useNow(running: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running, intervalMs]);
  return now;
}
