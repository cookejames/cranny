import type { LiveRound } from '@cranny/multiplayer';
import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  orderProgress,
  ordinal,
  progressEntries,
  type ProgressEntry,
} from './progress.ts';

const seats = ['a', 'b', 'c', 'd'].map((id, joinOrder) => ({ id, joinOrder }));

/** An entry still playing with `placed` pieces down. */
const playing = (id: string, placed: number): ProgressEntry => ({ id, placed, place: null });

describe('orderProgress', () => {
  it('puts finishers first in finishing order, then the rest by pieces placed', () => {
    const entries = [
      playing('a', 3),
      { id: 'b', placed: 9, place: 2 },
      playing('c', 7),
      { id: 'd', placed: 9, place: 1 },
    ];
    expect(orderProgress(entries, [], seats)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('breaks ties by join order the first time', () => {
    const entries = [playing('c', 2), playing('a', 2), playing('b', 5)];
    expect(orderProgress(entries, [], seats)).toEqual(['b', 'a', 'c']);
  });

  it('keeps tied bars in their current order rather than swapping them', () => {
    const entries = [playing('a', 4), playing('b', 4), playing('c', 4)];
    expect(orderProgress(entries, ['c', 'a', 'b'], seats)).toEqual(['c', 'a', 'b']);
    // b overtakes; a and c keep their order behind it.
    const next = [playing('a', 4), playing('b', 5), playing('c', 4)];
    expect(orderProgress(next, ['c', 'a', 'b'], seats)).toEqual(['b', 'c', 'a']);
  });
});

describe('progressEntries', () => {
  it('lists every participant but me, with their places', () => {
    const round = {
      participants: ['a', 'b', 'c'],
      progress: { a: 9, b: 4, c: 9 },
      finishes: [
        { id: 'c', ms: 1 },
        { id: 'a', ms: 2 },
      ],
    } as unknown as LiveRound;
    expect(progressEntries(round, 'a')).toEqual([
      { id: 'b', placed: 4, place: null },
      { id: 'c', placed: 9, place: 1 },
    ]);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
  ])('%i is %s', (n, text) => {
    expect(ordinal(n)).toBe(text);
  });
});

describe('formatCountdown', () => {
  it('rounds up to whole seconds', () => {
    expect(formatCountdown(24_001)).toBe('0:25');
    expect(formatCountdown(24_000)).toBe('0:24');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatCountdown(90_000)).toBe('1:30');
  });
});
