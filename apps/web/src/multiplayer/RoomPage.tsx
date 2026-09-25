import { isValidRoomName, normaliseRoomName } from '@cranny/multiplayer';
import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import type { RoomAdapters } from '../net/adapters.ts';
import type { JoinErrorState } from './MultiplayerPage.tsx';
import { RoomScreen } from './RoomScreen.tsx';
import type { SessionOptions } from './session.ts';

type RoomPageProps = {
  adapters: RoomAdapters;
  /** Test seams for the session. */
  sessionOptions?: SessionOptions | undefined;
};

/**
 * `/m/:room` (specs/2026-09-25-multiplayer/SPEC.md §4, §9): redirects a non-canonical name to
 * the canonical one, sends an invalid one back to the Multiplayer screen, and shows the room.
 */
export function RoomPage({ adapters, sessionOptions }: RoomPageProps) {
  const { room = '' } = useParams();
  const location = useLocation();
  const [attempt, setAttempt] = useState(0);
  const canonical = normaliseRoomName(room);

  if (!isValidRoomName(canonical)) {
    const state: JoinErrorState = { joinError: 'invalid', room };
    return <Navigate to="/multiplayer" replace state={state} />;
  }
  if (canonical !== room) {
    return <Navigate to={{ pathname: `/m/${canonical}`, search: location.search }} replace />;
  }
  const startSolved = import.meta.env.DEV && new URLSearchParams(location.search).has('solve');
  return (
    <RoomScreen
      // A new room, or Try again, gets a fresh session.
      key={`${canonical}:${attempt}`}
      room={canonical}
      adapters={adapters}
      onRetry={() => setAttempt((n) => n + 1)}
      sessionOptions={sessionOptions}
      startSolved={startSolved}
    />
  );
}
