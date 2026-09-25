import type { LiveRound, PlayerId, Seat } from '@cranny/multiplayer';

/** One opponent's bar in the progress strip. */
export type ProgressEntry = {
  id: PlayerId;
  /** Pieces placed, 0–9. */
  placed: number;
  /** Finishing position (1 for first), or null while still playing. */
  place: number | null;
};

/** The progress strip's bars: every participant but `self`, with their progress and place. */
export function progressEntries(round: LiveRound, self: PlayerId): ProgressEntry[] {
  return round.participants
    .filter((id) => id !== self)
    .map((id) => {
      const index = round.finishes.findIndex((f) => f.id === id);
      return {
        id,
        placed: round.progress[id] ?? 0,
        place: index === -1 ? null : index + 1,
      };
    });
}

/**
 * Orders the strip's bars by how complete each player is, most complete first
 * (specs/2026-09-25-multiplayer/SPEC.md §9): finishers in finishing order, then everyone else by
 * pieces placed, most first. Ties keep their order in `previous`, so bars never swap without a
 * reason; players not in `previous` (the first ordering) go by join order.
 */
export function orderProgress(
  entries: readonly ProgressEntry[],
  previous: readonly PlayerId[],
  seats: readonly Pick<Seat, 'id' | 'joinOrder'>[],
): PlayerId[] {
  const before = new Map(previous.map((id, i) => [id, i]));
  const joinOrder = new Map(seats.map((s) => [s.id, s.joinOrder]));
  const rank = (e: ProgressEntry) => (e.place !== null ? -100 + e.place : -e.placed);
  return [...entries]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (before.get(a.id) ?? Infinity) - (before.get(b.id) ?? Infinity) ||
        (joinOrder.get(a.id) ?? Infinity) - (joinOrder.get(b.id) ?? Infinity) ||
        (a.id < b.id ? -1 : 1),
    )
    .map((e) => e.id);
}

/** A finishing position as shown on screen: "1st", "2nd", "3rd", "4th"… */
export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th';
  return `${place}${suffix}`;
}

/** A countdown's time left as `m:ss`, rounded up so it shows 0:00 only at the deadline. */
export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
