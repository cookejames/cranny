import { cleanPlayerName, cryptoRandom, randomPlayerName } from '@cranny/multiplayer';
import { loadPlayerName, savePlayerName } from '../storage/storage.ts';

// The player's name (specs/2026-09-25-multiplayer/SPEC.md §2 Names): remembered on the device
// for next time, and kept in memory too so it carries from screen to screen when storage is
// blocked.

let current: string | null = null;

/** The player's name: this session's, else the remembered one, else a new random name. */
export function playerName(): string {
  current ??= loadPlayerName() ?? randomPlayerName(cryptoRandom);
  return current;
}

/**
 * The player's name if they have one (this session's, else the remembered one), without making
 * up a random one as {@link playerName} does. Null for someone who has never had a name, e.g. a
 * solo player who hasn't opened Multiplayer.
 */
export function knownPlayerName(): string | null {
  return current ?? loadPlayerName();
}

/**
 * Sets and remembers the player's name, cleaned first.
 *
 * @returns The name as stored, or null if it cleaned to nothing (and nothing changed).
 */
export function setPlayerName(name: string): string | null {
  const cleaned = cleanPlayerName(name);
  if (!cleaned) return null;
  current = cleaned;
  savePlayerName(cleaned);
  return cleaned;
}

/** Forgets the in-memory name, so the next read comes from storage. For tests. */
export function resetPlayerName(): void {
  current = null;
}
