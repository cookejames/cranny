import { pick, type RandomSource } from './random.ts';
import { ROOM_WORDS } from './words.ts';

export const ROOM_NAME_MIN_LENGTH = 3;
export const ROOM_NAME_MAX_LENGTH = 32;
export const PLAYER_NAME_MAX_LENGTH = 16;

const ROOM_NAME = /^[a-z0-9-]+$/;

/** A generated room name: three words from `ROOM_WORDS` joined with hyphens (SPEC §4). */
export function generateRoomName(random: RandomSource): string {
  const values = random(3);
  return [0, 1, 2].map((i) => pick(ROOM_WORDS, values[i]!)).join('-');
}

/**
 * The canonical form of a typed room name (SPEC §4): lowercase, with runs of spaces, underscores
 * and hyphens made into one hyphen, and leading and trailing hyphens trimmed. The result may still
 * be invalid; check it with {@link isValidRoomName}.
 */
export function normaliseRoomName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Whether a name is canonical and allowed: 3–32 characters of `[a-z0-9-]`. */
export function isValidRoomName(name: string): boolean {
  return (
    name.length >= ROOM_NAME_MIN_LENGTH &&
    name.length <= ROOM_NAME_MAX_LENGTH &&
    ROOM_NAME.test(name) &&
    normaliseRoomName(name) === name
  );
}

const COLOURS = `
Amber Aqua Azure Blue Bronze Coral Cream Crimson Cyan Gold Green Hazel Indigo Ivory Jade Lemon
Lilac Lime Maroon Mint Navy Olive Orange Peach Pink Plum Purple Rose Ruby Rust Sage Scarlet Silver
Slate Teal Violet
`
  .trim()
  .split(/\s+/);

const ANIMALS = `
Badger Beaver Bison Camel Crane Dolphin Duck Eagle Falcon Ferret Finch Fox Frog Gecko Goat Goose
Hare Hawk Heron Hippo Ibis Jay Kitten Koala Lark Lemur Lion Lynx Magpie Moose Newt Orca Otter Owl
Panda Parrot Puffin Puma Quail Rabbit Raven Robin Seal Swan Tiger Toucan Turtle Walrus Whale Wolf
Wombat Wren Yak Zebra
`
  .trim()
  .split(/\s+/);

/** Colours and animals for random player names, exported for tests. */
export const PLAYER_NAME_WORDS = { colours: COLOURS, animals: ANIMALS } as const;

/** A random player name such as "Teal Otter" (SPEC §2 Names). Always valid. */
export function randomPlayerName(random: RandomSource): string {
  const [colour, animal] = Array.from(random(2));
  return `${pick(COLOURS, colour!)} ${pick(ANIMALS, animal!)}`;
}

// Control characters, and the bidirectional controls that could reorder text around a name.
const UNSAFE = /[\p{Cc}‎‏‪-‮⁦-⁩]/gu;

/**
 * A player name made safe to store and show (SPEC §2 Names): whitespace runs (tabs and newlines
 * included) made single spaces, other control and bidi-control characters removed, trimmed, and cut to 16 characters (code points, so
 * an emoji isn't split in half). Returns null if nothing is left.
 */
export function cleanPlayerName(input: string): string | null {
  const cleaned = input.replace(/\s/g, ' ').replace(UNSAFE, '').replace(/ +/g, ' ').trim();
  const cut = Array.from(cleaned).slice(0, PLAYER_NAME_MAX_LENGTH).join('').trimEnd();
  return cut === '' ? null : cut;
}

/** Whether a name is already in the form {@link cleanPlayerName} produces. */
export const isCleanPlayerName = (name: string): boolean => cleanPlayerName(name) === name;

/**
 * The names to show for a room's seats (SPEC §2 Names). When seats share a name, the one who
 * joined first keeps it and the others get a number in joining order ("Teal Otter 2"), skipping
 * any label another seat already uses.
 */
export function displayNames(
  seats: readonly { id: string; name: string; joinOrder: number }[],
): Map<string, string> {
  const ordered = [...seats].sort((a, b) => a.joinOrder - b.joinOrder || (a.id < b.id ? -1 : 1));
  const taken = new Set(ordered.map((s) => s.name));
  const seen = new Set<string>();
  const labels = new Map<string, string>();
  for (const seat of ordered) {
    if (!seen.has(seat.name)) {
      seen.add(seat.name);
      labels.set(seat.id, seat.name);
      continue;
    }
    let n = 2;
    while (taken.has(`${seat.name} ${n}`)) n++;
    const label = `${seat.name} ${n}`;
    taken.add(label);
    labels.set(seat.id, label);
  }
  return labels;
}
