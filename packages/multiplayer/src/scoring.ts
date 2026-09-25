import type { PlayerId, Round, RoundResult, Seat } from './protocol.ts';

/** Points for a finish position, 1-based (SPEC §2 Scoring): 5, 3, 2, then 1 for any other finisher. */
export function pointsFor(place: number): number {
  if (!Number.isInteger(place) || place < 1) throw new RangeError(`Bad place ${place}`);
  return [5, 3, 2][place - 1] ?? 1;
}

/**
 * The result of a round for everyone with a seat (SPEC §2 Scoring): finishers in the order the host
 * received them, then participants who didn't finish (most pieces placed first), then everyone who
 * sat out. Seats that have been removed are left out. Ties can't happen: finishes are ordered.
 */
export function roundResult(
  round: Pick<Round, 'number' | 'participants' | 'progress' | 'finishes'>,
  seats: readonly Seat[],
): RoundResult {
  const seated = new Map(seats.map((s) => [s.id, s]));
  const finished = new Set<PlayerId>();
  const places: RoundResult['places'] = [];
  for (const { id, ms } of round.finishes) {
    if (!seated.has(id) || finished.has(id)) continue;
    finished.add(id);
    places.push({ id, ms, points: pointsFor(finished.size), outcome: 'finished' });
  }
  const byJoin = (a: PlayerId, b: PlayerId) => seated.get(a)!.joinOrder - seated.get(b)!.joinOrder;
  const unfinished = round.participants
    .filter((id) => seated.has(id) && !finished.has(id))
    .sort((a, b) => (round.progress[b] ?? 0) - (round.progress[a] ?? 0) || byJoin(a, b));
  for (const id of unfinished) places.push({ id, ms: null, points: 0, outcome: 'dnf' });
  const playing = new Set(round.participants);
  const satOut = seats
    .map((s) => s.id)
    .filter((id) => !playing.has(id))
    .sort(byJoin);
  for (const id of satOut) places.push({ id, ms: null, points: 0, outcome: 'sat-out' });
  return { number: round.number, places };
}
