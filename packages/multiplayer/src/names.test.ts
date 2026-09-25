import { describe, expect, it } from 'vitest';
import {
  cleanPlayerName,
  displayNames,
  generateRoomName,
  isValidRoomName,
  normaliseRoomName,
  PLAYER_NAME_WORDS,
  randomPlayerName,
} from './names.ts';
import { seededRandom } from './testing/random.ts';
import { ROOM_WORDS } from './words.ts';

describe('ROOM_WORDS', () => {
  it('has no duplicates and only 3–6 lowercase letters per word', () => {
    expect(new Set(ROOM_WORDS).size).toBe(ROOM_WORDS.length);
    for (const word of ROOM_WORDS) expect(word).toMatch(/^[a-z]{3,6}$/);
  });

  it('is sorted', () => {
    expect([...ROOM_WORDS].sort()).toEqual(ROOM_WORDS);
  });

  it('gives at least 30 bits for three words', () => {
    expect(3 * Math.log2(ROOM_WORDS.length)).toBeGreaterThanOrEqual(30);
  });

  it('avoids words that sound like another word', () => {
    // A sample of homophones, including UK non-rhotic ones; the list must contain neither side.
    const homophones =
      'bear bare sun son sea see tail tale sort sought paw pour court caught flower flour knight night mail male fair fare pair pear hare hair road rode'.split(
        ' ',
      );
    expect(ROOM_WORDS.filter((w) => homophones.includes(w))).toEqual([]);
  });
});

describe('generateRoomName', () => {
  it('joins three list words with hyphens', () => {
    const name = generateRoomName(() => [0, 1, 2]);
    expect(name).toBe(`${ROOM_WORDS[0]}-${ROOM_WORDS[1]}-${ROOM_WORDS[2]}`);
  });

  it('always makes valid canonical names', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const name = generateRoomName(random);
      expect(isValidRoomName(name)).toBe(true);
      expect(normaliseRoomName(name)).toBe(name);
    }
  });
});

describe('normaliseRoomName', () => {
  it.each([
    ['Amber Otter Quilt', 'amber-otter-quilt'],
    ['  amber   otter ', 'amber-otter'],
    ['amber_otter__quilt', 'amber-otter-quilt'],
    ['--Pizza--', 'pizza'],
    ['a - b', 'a-b'],
    ['ROOM 42', 'room-42'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normaliseRoomName(input)).toBe(expected);
  });
});

describe('isValidRoomName', () => {
  it.each(['abc', 'pizza', 'amber-otter-quilt', 'room-42', 'a'.repeat(32)])('accepts %j', (n) => {
    expect(isValidRoomName(n)).toBe(true);
  });

  it.each(['', 'ab', 'a'.repeat(33), 'Pizza', 'café', 'a b', '-abc', 'abc-', 'a--b', 'a_b', 'a.b'])(
    'rejects %j',
    (n) => {
      expect(isValidRoomName(n)).toBe(false);
    },
  );
});

describe('randomPlayerName', () => {
  it('makes a colour and an animal', () => {
    expect(randomPlayerName(() => [0, 0])).toBe(
      `${PLAYER_NAME_WORDS.colours[0]} ${PLAYER_NAME_WORDS.animals[0]}`,
    );
  });

  it('only makes names that are already clean, for every combination', () => {
    for (const colour of PLAYER_NAME_WORDS.colours) {
      for (const animal of PLAYER_NAME_WORDS.animals) {
        const name = `${colour} ${animal}`;
        expect(cleanPlayerName(name)).toBe(name);
      }
    }
  });
});

describe('cleanPlayerName', () => {
  it.each([
    ['Teal Otter', 'Teal Otter'],
    ['  Teal   Otter  ', 'Teal Otter'],
    ['Teal\u0000Otter\u0007', 'TealOtter'],
    ['Tab\tand\nnewline', 'Tab and newline'],
    ['a \u0000 b', 'a b'],
    ['‮evil‬', 'evil'],
    ['abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnop'],
    ['abcdefghijklmno pq', 'abcdefghijklmno'],
    ['🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦🦦', '🦦'.repeat(16)],
    ['Zoë', 'Zoë'],
  ])('%j → %j', (input, expected) => {
    expect(cleanPlayerName(input)).toBe(expected);
  });

  it.each(['', '   ', '\u0000\u0001', '‎'])('returns null for %j', (input) => {
    expect(cleanPlayerName(input)).toBeNull();
  });
});

describe('displayNames', () => {
  it('numbers repeated names in joining order', () => {
    const labels = displayNames([
      { id: 'c', name: 'Teal Otter', joinOrder: 3 },
      { id: 'a', name: 'Teal Otter', joinOrder: 1 },
      { id: 'b', name: 'Rose Wren', joinOrder: 2 },
      { id: 'd', name: 'Teal Otter', joinOrder: 4 },
    ]);
    expect(labels.get('a')).toBe('Teal Otter');
    expect(labels.get('b')).toBe('Rose Wren');
    expect(labels.get('c')).toBe('Teal Otter 2');
    expect(labels.get('d')).toBe('Teal Otter 3');
  });

  it("skips a number that is someone's real name", () => {
    const labels = displayNames([
      { id: 'a', name: 'Sam', joinOrder: 1 },
      { id: 'b', name: 'Sam 2', joinOrder: 2 },
      { id: 'c', name: 'Sam', joinOrder: 3 },
    ]);
    expect(labels.get('c')).toBe('Sam 3');
    expect(new Set(labels.values()).size).toBe(3);
  });
});
