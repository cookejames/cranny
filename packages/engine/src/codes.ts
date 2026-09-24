import { SUPPORTED_VERSIONS } from './generator.ts';
import { isValidSeed } from './random.ts';

/** Crockford base32 alphabet (no I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALIASES: Record<string, string> = { I: '1', L: '1', O: '0' };
const SEED_CHARS = 6;
/** Checked before any case mapping, so characters like 'ß' can't expand into valid ones. */
const RAW_CODE = /^[0-9A-Za-z]{7}$/;
export const GRID_CODE_LENGTH = 1 + SEED_CHARS;

/** Why a grid code couldn't be decoded; the web app shows a different message for each. */
export type GridCodeErrorKind = 'malformed' | 'unsupported-version';

/** A grid code that couldn't be decoded. Returned by {@link decodeGridCode}, not thrown. */
export class GridCodeError extends Error {
  readonly kind: GridCodeErrorKind;

  /**
   * @param kind - Why decoding failed.
   * @param message - User-facing text for the error screen (SPEC.md §4).
   */
  constructor(kind: GridCodeErrorKind, message: string) {
    super(message);
    this.name = 'GridCodeError';
    this.kind = kind;
  }
}

/**
 * Encodes as one version character followed by the 30-bit seed in 6 base32 characters. One
 * character caps the scheme at version 31. Only versions this build supports can be encoded.
 *
 * @throws RangeError if the version is unsupported or the seed isn't a 30-bit integer.
 */
export function encodeGridCode(grid: { version: number; seed: number }): string {
  if (!SUPPORTED_VERSIONS.includes(grid.version) || grid.version >= ALPHABET.length) {
    throw new RangeError(`Grid version ${grid.version} cannot be encoded`);
  }
  if (!isValidSeed(grid.seed)) throw new RangeError(`Seed ${grid.seed} cannot be encoded`);
  let seedChars = '';
  let n = grid.seed;
  for (let i = 0; i < SEED_CHARS; i++) {
    seedChars = ALPHABET[n % 32]! + seedChars;
    n = Math.floor(n / 32);
  }
  return ALPHABET[grid.version]! + seedChars;
}

/** Case-insensitive; reads I and L as 1 and O as 0. Returns a `GridCodeError` rather than throwing. */
export function decodeGridCode(code: string): { version: number; seed: number } | GridCodeError {
  const trimmed = typeof code === 'string' ? code.trim() : '';
  if (!RAW_CODE.test(trimmed)) return new GridCodeError('malformed', "That grid link isn't valid");
  const chars = trimmed
    .toUpperCase()
    .split('')
    .map((ch) => ALIASES[ch] ?? ch);
  const values = chars.map((ch) => ALPHABET.indexOf(ch));
  if (values.length !== GRID_CODE_LENGTH || values.some((v) => v < 0)) {
    return new GridCodeError('malformed', "That grid link isn't valid");
  }
  const [version, ...seedValues] = values as [number, ...number[]];
  if (version === 0) return new GridCodeError('malformed', "That grid link isn't valid");
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return new GridCodeError(
      'unsupported-version',
      'This grid needs a newer version of Tessel. Refresh to update.',
    );
  }
  const seed = seedValues.reduce((acc, v) => acc * 32 + v, 0);
  return { version, seed };
}
