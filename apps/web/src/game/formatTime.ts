/**
 * Formats a duration for display (specs/2026-09-25-single-player/SPEC.md §7): `m:ss`, or `h:mm:ss` from one hour. With
 * `tenths`, adds tenths of a second (`m:ss.s`) for results. Rounds down, so a timer never shows
 * a second before it has passed. Negative input is treated as 0.
 */
export function formatTime(ms: number, { tenths = false }: { tenths?: boolean } = {}): string {
  const totalTenths = Math.floor(Math.max(0, ms) / 100);
  const totalSeconds = Math.floor(totalTenths / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  const base =
    hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
  return tenths ? `${base}.${totalTenths % 10}` : base;
}
