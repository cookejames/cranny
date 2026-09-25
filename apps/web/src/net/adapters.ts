import type { RoomDirectory, RoomTransport } from '@cranny/multiplayer';
import { AblyTransport } from './ablyTransport.ts';
import { HttpDirectory } from './httpDirectory.ts';
import { LocalDirectory } from './localDirectory.ts';
import { LocalTransport } from './localTransport.ts';

// The one place that picks the multiplayer adapters (specs/2026-09-25-multiplayer/SPEC.md §3).
// `VITE_ROOM_TRANSPORT` is fixed at build time: `local` (tabs of one browser; the default for
// `pnpm dev`, from `.env.development`), `ably` (Ably and the rooms API; production, from
// `.env.production`), or unset, which turns multiplayer off. vite.config.ts rejects any other
// value.

/** The transport and directory a build uses. */
export type RoomAdapters = { transport: RoomTransport; directory: RoomDirectory };

/** Whether this build has multiplayer. When false, its routes and Home button are absent. */
export const multiplayerEnabled =
  import.meta.env.VITE_ROOM_TRANSPORT === 'local' || import.meta.env.VITE_ROOM_TRANSPORT === 'ably';

let adapters: RoomAdapters | undefined;

/**
 * The build's adapters, created on first use and shared from then on, or null when multiplayer
 * is off. The build replaces `VITE_ROOM_TRANSPORT` with its value, so only the chosen adapters
 * end up in the bundle.
 */
export function roomAdapters(): RoomAdapters | null {
  if (import.meta.env.VITE_ROOM_TRANSPORT === 'ably') {
    if (!adapters) {
      const directory = new HttpDirectory();
      adapters = { transport: new AblyTransport({ directory }), directory };
    }
    return adapters;
  }
  if (import.meta.env.VITE_ROOM_TRANSPORT === 'local') {
    if (!adapters) {
      const transport = new LocalTransport();
      adapters = {
        transport,
        directory: new LocalDirectory({ occupied: (c) => transport.occupied(c) }),
      };
    }
    return adapters;
  }
  return null;
}
