import {
  decodeGridCode,
  GridCodeError,
  isPieceId,
  isValidCell,
  isValidOrientation,
  type Orientation,
  type PieceId,
  type Placement,
} from '@cranny/engine';
import { isCleanPlayerName, isPlayerId, isValidRoomName, type PlayerId } from '@cranny/multiplayer';

// Device-only persistence (specs/2026-09-25-single-player/SPEC.md §5, §8). Storage can be missing, full, blocked (private
// browsing, disabled cookies) or hold stale or hand-edited data, so every access is wrapped in
// try/catch and every value read back is validated. The game must work without storage.
// Multiplayer seats and boards are per tab, so they live in session storage
// (specs/2026-09-25-multiplayer/SPEC.md §10); everything else is in local storage.

export const STATS_KEY = 'cranny.stats.v1';
export const ROUND_KEY = 'cranny.round.v1';
/** How many recent solve times feed the average (specs/2026-09-25-single-player/SPEC.md §8). */
export const RECENT_LIMIT = 10;

/** Which storage a key lives in: shared by the browser's tabs, or private to this tab. */
export type StorageArea = 'local' | 'session';

/** The storage for `area`, or null if it is unavailable (merely accessing it can throw). */
function storage(area: StorageArea): Storage | null {
  try {
    return (area === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

/** Parsed JSON stored under `key`, or undefined if missing, unreadable or not valid JSON. */
export function readJson(key: string, area: StorageArea = 'local'): unknown {
  try {
    const raw = storage(area)?.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

/** Stores `value` as JSON. Returns false if storage is unavailable or full. */
export function writeJson(key: string, value: unknown, area: StorageArea = 'local'): boolean {
  try {
    const store = storage(area);
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes `key`, ignoring storage errors. */
export function removeKey(key: string, area: StorageArea = 'local'): void {
  try {
    storage(area)?.removeItem(key);
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

/** Personal stats kept on the device (specs/2026-09-25-single-player/SPEC.md §8). Times are in milliseconds. */
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

/** The round in progress, saved after every change so a reload can restore it (specs/2026-09-25-single-player/SPEC.md §5). */
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

// ---------------------------------------------------------------------------------------------
// Multiplayer (specs/2026-09-25-multiplayer/SPEC.md §10)

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The player's name, offered by default next time (local storage, shared by tabs). */
export const PLAYER_KEY = 'cranny.player.v1';
/** This tab's seat (session storage). */
export const SEAT_KEY = 'cranny.seat.v1';
/** This tab's board for the multiplayer round in progress (session storage). */
export const MULTIPLAYER_ROUND_KEY = 'cranny.multiplayerRound.v1';
/** Multiplayer display preferences (local storage). */
export const MULTIPLAYER_PREFS_KEY = 'cranny.multiplayerPrefs.v1';

/** The remembered player name, or null if there is none or it isn't a clean name. */
export function loadPlayerName(): string | null {
  const raw = readJson(PLAYER_KEY);
  return isRecord(raw) && typeof raw.name === 'string' && isCleanPlayerName(raw.name)
    ? raw.name
    : null;
}

/** Remembers the player name for next time. Returns false if it couldn't be stored. */
export function savePlayerName(name: string): boolean {
  return writeJson(PLAYER_KEY, { name });
}

/** This tab's seat: the room it's in and its player id there. */
export type SavedSeat = { room: string; playerId: PlayerId };

/** This tab's seat, or null if it has none or the stored one doesn't validate. */
export function loadSeat(): SavedSeat | null {
  const raw = readJson(SEAT_KEY, 'session');
  if (!isRecord(raw) || typeof raw.room !== 'string' || typeof raw.playerId !== 'string') {
    return null;
  }
  if (!isValidRoomName(raw.room) || !isPlayerId(raw.playerId)) return null;
  return { room: raw.room, playerId: raw.playerId };
}

/** Saves this tab's seat, replacing any other. Returns false if it couldn't be stored. */
export function saveSeat(seat: SavedSeat): boolean {
  return writeJson(SEAT_KEY, seat, 'session');
}

/** Forgets this tab's seat. */
export function clearSeat(): void {
  removeKey(SEAT_KEY, 'session');
}

/**
 * This tab's board for one multiplayer round, saved after every change so a reload can restore it.
 * `revealedAt` is when this tab revealed the grid (`Date.now()`), which starts its stopwatch;
 * `finishedMs` is the stopwatch reading when it filled the grid, or null while playing.
 */
export type SavedMultiplayerRound = {
  room: string;
  round: number;
  version: number;
  seed: number;
  revealedAt: number;
  orientations: Partial<Record<PieceId, Orientation>>;
  placements: Partial<Record<PieceId, Placement>>;
  finishedMs: number | null;
};

const isWhole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * This tab's saved multiplayer board, or null if there is none or its room, round, grid or times
 * don't validate. As with {@link loadRound}, malformed placements and orientations are dropped
 * and the caller re-checks the rest against the board.
 */
export function loadMultiplayerRound(): SavedMultiplayerRound | null {
  const raw = readJson(MULTIPLAYER_ROUND_KEY, 'session');
  if (!isRecord(raw) || typeof raw.room !== 'string' || !isValidRoomName(raw.room)) return null;
  if (!isWhole(raw.round) || !isWhole(raw.version) || !isWhole(raw.seed)) return null;
  if (!isTime(raw.revealedAt)) return null;
  if (raw.finishedMs !== null && !isDuration(raw.finishedMs)) return null;
  return {
    room: raw.room,
    round: raw.round,
    version: raw.version,
    seed: raw.seed,
    revealedAt: raw.revealedAt,
    orientations: pieceRecord(raw.orientations, isValidOrientation),
    placements: pieceRecord(raw.placements, isPlacement),
    finishedMs: raw.finishedMs,
  };
}

/** Saves this tab's multiplayer board. Returns false if it couldn't be stored. */
export function saveMultiplayerRound(round: SavedMultiplayerRound): boolean {
  return writeJson(MULTIPLAYER_ROUND_KEY, round, 'session');
}

/** Forgets this tab's multiplayer board. */
export function clearMultiplayerRound(): void {
  removeKey(MULTIPLAYER_ROUND_KEY, 'session');
}

/** How the player likes the multiplayer screens. */
export type MultiplayerPrefs = { hideProgress: boolean };

/** The stored multiplayer preferences, with defaults for anything missing or invalid. */
export function loadMultiplayerPrefs(): MultiplayerPrefs {
  const raw = readJson(MULTIPLAYER_PREFS_KEY);
  return { hideProgress: isRecord(raw) && raw.hideProgress === true };
}

/** Saves the multiplayer preferences. Returns false if they couldn't be stored. */
export function saveMultiplayerPrefs(prefs: MultiplayerPrefs): boolean {
  return writeJson(MULTIPLAYER_PREFS_KEY, prefs);
}
