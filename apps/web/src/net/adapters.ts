import type { RoomDirectory, RoomTransport } from '@cranny/multiplayer';
import { LocalDirectory } from './localDirectory.ts';
import { LocalTransport } from './localTransport.ts';

// The one place that picks the multiplayer adapters (specs/2026-09-25-multiplayer/SPEC.md §3).
// `VITE_ROOM_TRANSPORT` is fixed at build time: `local` (the default for `pnpm dev`, from
// `.env.development`) or unset, which turns multiplayer off. `ably` arrives in Phase 6.
// vite.config.ts rejects any other value.

/** The transport and directory a build uses. */
export type RoomAdapters = { transport: RoomTransport; directory: RoomDirectory };

/** Whether this build has multiplayer. When false, its routes and Home button are absent. */
export const multiplayerEnabled = import.meta.env.VITE_ROOM_TRANSPORT === 'local';

let adapters: RoomAdapters | undefined;

/**
 * The build's adapters, created on first use and shared from then on, or null when multiplayer
 * is off. Written so that a build without multiplayer leaves the adapters out of the bundle.
 */
export function roomAdapters(): RoomAdapters | null {
  if (import.meta.env.VITE_ROOM_TRANSPORT !== 'local') return null;
  adapters ??= { transport: new LocalTransport(), directory: new LocalDirectory() };
  return adapters;
}
