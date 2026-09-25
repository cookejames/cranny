import { pick, type RandomSource } from './random.ts';
import { ROOM_WORDS } from './words.ts';

// Random room and player names (SPEC §2 Names, §4). Kept apart from names.ts, so bundles that only
// validate names don't include the word lists.

/** A generated room name: three words from `ROOM_WORDS` joined with hyphens (SPEC §4). */
export function generateRoomName(random: RandomSource): string {
  const values = random(3);
  return [0, 1, 2].map((i) => pick(ROOM_WORDS, values[i]!)).join('-');
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
