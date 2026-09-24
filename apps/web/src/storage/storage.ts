import {
  decodeGridCode,
  GridCodeError,
  isPieceId,
  isValidCell,
  isValidOrientation,
  type Orientation,
  type PieceId,
  type Placement,
} from '@tessel/engine';

// Device-only persistence (SPEC.md §5, §8). Storage can be missing, full, blocked (private
// browsing, disabled cookies) or hold stale or hand-edited data, so every access is wrapped in
// try/catch and every value read back is validated. The game must work without storage.

export const STATS_KEY = 'tessel.stats.v1';
export const ROUND_KEY = 'tessel.round.v1';
/** How many recent solve times feed the average (SPEC.md §8). */
export const RECENT_LIMIT = 10;

/** `localStorage`, or null if it is unavailable (merely accessing it can throw). */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Parsed JSON stored under `key`, or undefined if missing, unreadable or not valid JSON. */
export function readJson(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Stores `value` as JSON. Returns false if storage is unavailable or full. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes `key`, ignoring storage errors. */
export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do: the value is either gone or unreachable.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// ---------------------------------------------------------------------------------------------
// Stats

/** Personal stats kept on the device (SPEC.md §8). Times are in milliseconds. */
export type Stats = { solved: number; bestMs: number | null; recentMs: number[] };

export const EMPTY_STATS: Stats = { solved: 0, bestMs: null, recentMs: [] };

/**
 * Stored stats, or {@link EMPTY_STATS} if there are none. Invalid fields are replaced with their
 * empty values individually, so one bad field doesn't wipe the rest.
 */
export function loadStats(): Stats {
  const raw = readJson(STATS_KEY);
  if (!isRecord(raw)) return EMPTY_STATS;
  const solved =
    typeof raw.solved === 'number' && Number.isInteger(raw.solved) && raw.solved >= 0
      ? raw.solved
      : 0;
  const bestMs = isDuration(raw.bestMs) ? raw.bestMs : null;
  const recentMs = Array.isArray(raw.recentMs)
    ? raw.recentMs.filter(isDuration).slice(-RECENT_LIMIT)
    : [];
  return { solved, bestMs, recentMs };
}

/** Saves stats. Returns false if they couldn't be stored. */
export function saveStats(stats: Stats): boolean {
  return writeJson(STATS_KEY, stats);
}

// ---------------------------------------------------------------------------------------------
// Round in progress

/** The round in progress, saved after every change so a reload can restore it (SPEC.md §5). */
export type SavedRound = {
  /** Canonical grid code, e.g. `1XDWT5H`. */
  code: string;
  /** Wall-clock start time (`Date.now()`), set when the player pressed Start. */
  startedAt: number;
  placements: Partial<Record<PieceId, Placement>>;
  /** Orientation of each piece, including pieces in the tray. */
  orientations: Partial<Record<PieceId, Orientation>>;
};

/**
 * Keeps the entries of `value` whose key is a piece id and whose value passes `isValid`. Drops
 * anything else, so a partly corrupted save still restores what it can.
 */
function pieceRecord<T>(
  value: unknown,
  isValid: (entry: unknown) => entry is T,
): Partial<Record<PieceId, T>> {
  const out: Partial<Record<PieceId, T>> = {};
  if (!isRecord(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (isPieceId(key) && isValid(entry)) out[key] = entry;
  }
  return out;
}

const isPlacement = (value: unknown): value is Placement =>
  isRecord(value) && isValidCell(value.origin) && isValidOrientation(value.orientation);

/**
 * The saved round, or null if there is none or it can't be trusted (bad grid code or start
 * time). Malformed placements and orientations are dropped rather than failing the whole round.
 * Placements are not checked against each other or the grid; the caller must validate them
 * against the board (e.g. with `canPlace`) before use.
 */
export function loadRound(): SavedRound | null {
  const raw = readJson(ROUND_KEY);
  if (!isRecord(raw) || typeof raw.code !== 'string') return null;
  if (decodeGridCode(raw.code) instanceof GridCodeError) return null;
  if (typeof raw.startedAt !== 'number' || !Number.isFinite(raw.startedAt)) return null;
  return {
    code: raw.code,
    startedAt: raw.startedAt,
    placements: pieceRecord(raw.placements, isPlacement),
    orientations: pieceRecord(raw.orientations, isValidOrientation),
  };
}

/** Saves the round in progress, replacing any other. Returns false if it couldn't be stored. */
export function saveRound(round: SavedRound): boolean {
  return writeJson(ROUND_KEY, round);
}

/** Forgets the round in progress. */
export function clearRound(): void {
  removeKey(ROUND_KEY);
}
