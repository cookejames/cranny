import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime.ts';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [68_400, '1:08'],
    [599_999, '9:59'],
    [600_000, '10:00'],
    [3_599_999, '59:59'],
    [3_600_000, '1:00:00'],
    [3_723_000, '1:02:03'],
    [-5, '0:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatTime(ms)).toBe(text);
  });

  it.each([
    [0, '0:00.0'],
    [68_450, '1:08.4'],
    [68_499, '1:08.4'],
    [3_723_900, '1:02:03.9'],
  ])('formats %i ms with tenths as %s', (ms, text) => {
    expect(formatTime(ms, { tenths: true })).toBe(text);
  });
});
