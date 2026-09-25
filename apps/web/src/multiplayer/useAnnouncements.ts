import type { PlayerId, RoomState } from '@cranny/multiplayer';
import { useEffect, useRef, useState } from 'react';

/** When the close-out's last warning is announced, before the round ends. */
export const FINAL_WARNING_MS = 10_000;

/**
 * What the room's polite live region says (specs/2026-09-25-multiplayer/SPEC.md §12): the reveal,
 * who finished first with 30 seconds left, and 10 seconds left. Not every second.
 */
export function useAnnouncements(
  state: RoomState | null,
  self: PlayerId,
  names: ReadonlyMap<PlayerId, string>,
): string {
  const [message, setMessage] = useState('');
  const announced = useRef({ round: -1, first: false });
  const round = state?.round ?? null;
  const number = round?.number ?? -1;
  const first = round?.finishes[0]?.id ?? null;
  const status = round?.status ?? null;
  const closesAt = round?.closesAt ?? null;
  const revealAt = round?.revealAt ?? null;
  const playing = round?.participants.includes(self) ?? false;
  const firstName =
    first === null ? null : first === self ? 'You' : (names.get(first) ?? 'Someone');

  useEffect(() => {
    if (announced.current.round !== number) announced.current = { round: number, first: false };
    if (firstName === null || announced.current.first) return;
    announced.current.first = true;
    setMessage(`${firstName} finished first. 30 seconds left.`);
  }, [number, firstName]);

  useEffect(() => {
    if (status !== 'closing' || closesAt === null) return;
    const wait = closesAt - FINAL_WARNING_MS - Date.now();
    if (wait < 0) return;
    const timer = setTimeout(() => setMessage('10 seconds left.'), wait);
    return () => clearTimeout(timer);
  }, [status, closesAt]);

  useEffect(() => {
    if (status !== 'countdown' || revealAt === null) return;
    const timer = setTimeout(
      () => setMessage(playing ? 'Go! The grid is revealed.' : 'The round has started.'),
      Math.max(0, revealAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [status, revealAt, playing]);

  return message;
}
