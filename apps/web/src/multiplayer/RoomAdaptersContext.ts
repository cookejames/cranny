import { createContext, useContext } from 'react';
import { roomAdapters, type RoomAdapters } from '../net/adapters.ts';

/**
 * Overrides the build's multiplayer adapters, for tests (fakes, or null to turn multiplayer off).
 * Left unset, the app uses {@link roomAdapters}.
 */
export const RoomAdaptersContext = createContext<RoomAdapters | null | undefined>(undefined);

/** The multiplayer adapters to use, or null when this build has no multiplayer. */
export function useRoomAdapters(): RoomAdapters | null {
  const provided = useContext(RoomAdaptersContext);
  return provided === undefined ? roomAdapters() : provided;
}
