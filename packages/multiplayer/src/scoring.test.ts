import { describe, expect, it } from 'vitest';
import type { Seat } from './protocol.ts';
import { pointsFor, roundResult } from './scoring.ts';

describe('pointsFor', () => {
  it('gives 5, 3, 2, then 1 for every later finisher', () => {
    expect([1, 2, 3, 4, 5, 8, 16].map(pointsFor)).toEqual([5, 3, 2, 1, 1, 1, 1]);
  });

  it.each([0, -1, 1.5, NaN])('rejects place %d', (place) => {
    expect(() => pointsFor(place)).toThrow(RangeError);
  });
});

describe('roundResult', () => {
  const seats: Seat[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, joinOrder) => ({
    id,
    name: id,
    joinOrder,
    score: 0,
  }));

  it('places finishers in arrival order, then unfinished by progress, then those who sat out', () => {
    const result = roundResult(
      {
        number: 4,
        participants: ['a', 'b', 'c', 'd', 'e'],
        progress: { a: 3, b: 9, c: 7, d: 9, e: 7 },
        finishes: [
          { id: 'd', ms: 70_000 },
          { id: 'b', ms: 65_000 }, // faster stopwatch, but arrived second
        ],
      },
      seats,
    );
    expect(result).toEqual({
      number: 4,
      places: [
        { id: 'd', ms: 70_000, points: 5, outcome: 'finished' },
        { id: 'b', ms: 65_000, points: 3, outcome: 'finished' },
        { id: 'c', ms: null, points: 0, outcome: 'dnf' },
        { id: 'e', ms: null, points: 0, outcome: 'dnf' },
        { id: 'a', ms: null, points: 0, outcome: 'dnf' },
        { id: 'f', ms: null, points: 0, outcome: 'sat-out' },
      ],
    });
  });

  it('gives 1 point to every finisher after the third', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = roundResult(
      {
        number: 1,
        participants: ids,
        progress: {},
        finishes: ids.map((id, i) => ({ id, ms: i })),
      },
      seats,
    );
    expect(result.places.map((p) => p.points)).toEqual([5, 3, 2, 1, 1, 0]);
  });

  it('leaves out players whose seats are gone', () => {
    const result = roundResult(
      {
        number: 1,
        participants: ['a', 'x'],
        progress: {},
        finishes: [{ id: 'x', ms: 1 }],
      },
      seats.slice(0, 1),
    );
    expect(result.places).toEqual([{ id: 'a', ms: null, points: 0, outcome: 'dnf' }]);
  });
});
