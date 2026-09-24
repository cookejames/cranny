import { describe, expect, it } from 'vitest';
import { GridCodeError, decodeGridCode, encodeGridCode } from './codes.ts';
import { MAX_SEED, mulberry32 } from './random.ts';

describe('encodeGridCode', () => {
  it('writes the version then the seed in 6 Crockford base32 characters', () => {
    expect(encodeGridCode({ version: 1, seed: 0 })).toBe('1000000');
    expect(encodeGridCode({ version: 1, seed: 42 })).toBe('100001A');
    expect(encodeGridCode({ version: 1, seed: MAX_SEED })).toBe('1ZZZZZZ');
    expect(encodeGridCode({ version: 1, seed: 987654321 })).toBe('1XDWT5H');
  });

  it('rejects values it cannot represent', () => {
    expect(() => encodeGridCode({ version: 1, seed: MAX_SEED + 1 })).toThrow(RangeError);
    expect(() => encodeGridCode({ version: 0, seed: 1 })).toThrow(RangeError);
    expect(() => encodeGridCode({ version: 32, seed: 1 })).toThrow(RangeError);
    expect(() => encodeGridCode({ version: 2, seed: 1 })).toThrow(RangeError); // not supported yet
  });
});

describe('decodeGridCode', () => {
  it('round-trips random seeds', () => {
    const rand = mulberry32(2024);
    for (let i = 0; i < 1000; i++) {
      const seed = Math.floor(rand() * (MAX_SEED + 1));
      expect(decodeGridCode(encodeGridCode({ version: 1, seed }))).toEqual({ version: 1, seed });
    }
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(decodeGridCode(' 1xdwt5h ')).toEqual({ version: 1, seed: 987654321 });
  });

  it('reads I and L as 1 and O as 0', () => {
    expect(decodeGridCode('IOOOO1A')).toEqual({ version: 1, seed: 42 });
    expect(decodeGridCode('loooo1a')).toEqual({ version: 1, seed: 42 });
  });

  it.each([
    '',
    '100000',
    '10000000',
    '1U00000',
    '1-00000',
    '0000000',
    '1ABCDß',
    '1ſ00000',
    '1 00000',
  ])('reports %j as malformed', (code) => {
    const result = decodeGridCode(code);
    expect(result).toBeInstanceOf(GridCodeError);
    expect((result as GridCodeError).kind).toBe('malformed');
    expect((result as GridCodeError).message).toBe("That grid link isn't valid");
  });

  it('treats non-string input as malformed', () => {
    expect((decodeGridCode(null as never) as GridCodeError).kind).toBe('malformed');
  });

  it('reports versions this build does not know', () => {
    const result = decodeGridCode('2000000');
    expect(result).toBeInstanceOf(GridCodeError);
    expect((result as GridCodeError).kind).toBe('unsupported-version');
    expect((result as GridCodeError).message).toBe(
      'This grid needs a newer version of Tessel. Refresh to update.',
    );
  });
});
