import { MAX_SEED } from '@cranny/engine';
import { describe, expect, it } from 'vitest';
import { cryptoRandom, isPlayerId, pick, randomPlayerId, randomSeedFrom } from './random.ts';
import { seededRandom } from './testing/random.ts';

describe('randomPlayerId', () => {
  it('encodes 128 bits as 22 base64url characters', () => {
    expect(randomPlayerId(() => [0, 0, 0, 0])).toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(randomPlayerId(() => [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff])).toBe(
      '_____________________w',
    );
    expect(randomPlayerId(() => [0xfbefbefb, 0xefbefbef, 0xbefbefbe, 0xfbefbefb])).toBe(
      '-'.repeat(21) + 'w',
    );
  });

  it('makes valid, distinct ids', () => {
    const random = seededRandom(1);
    const ids = new Set(Array.from({ length: 1000 }, () => randomPlayerId(random)));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(isPlayerId(id)).toBe(true);
    expect(isPlayerId(randomPlayerId(cryptoRandom))).toBe(true);
  });
});

describe('isPlayerId', () => {
  it.each([undefined, 42, '', 'short', 'A'.repeat(21), 'A'.repeat(23), 'A'.repeat(21) + '='])(
    'rejects %j',
    (value) => {
      expect(isPlayerId(value)).toBe(false);
    },
  );
});

describe('randomSeedFrom', () => {
  it('returns a 30-bit seed', () => {
    expect(randomSeedFrom(() => [0xffffffff])).toBe(MAX_SEED);
    expect(randomSeedFrom(() => [0])).toBe(0);
  });
});

describe('pick', () => {
  it('maps any 32-bit value into the list', () => {
    expect(pick(['a', 'b', 'c'], 0xffffffff)).toBe('a');
    expect(pick(['a', 'b', 'c'], 4)).toBe('b');
  });
});
