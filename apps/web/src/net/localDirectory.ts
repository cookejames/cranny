import { StatelessDirectory, systemClock, type PlayerId } from '@cranny/multiplayer';

// A development-only room directory (specs/2026-09-25-multiplayer/SPEC.md §7): the real rules
// from StatelessDirectory, with presence from LocalTransport and credentials that aren't secret.

/** How long a local credential lasts, matching the Ably token lifetime. */
export const LOCAL_CREDENTIAL_TTL_MS = 60 * 60_000;

/** What a local credential holds: the one channel and player it's good for. */
export type LocalCredential = { channel: string; self: PlayerId; expiresAt: number };

/** Whether a credential value is a local credential for this channel and player. */
export function isLocalCredentialFor(value: unknown, channel: string, self: PlayerId): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<LocalCredential>;
  return c.channel === channel && c.self === self;
}

export type LocalDirectoryOptions = {
  /** Whether any tab is on a channel: `LocalTransport.occupied` in the browser. */
  occupied: (channel: string) => Promise<boolean>;
  clock?: { now(): number };
};

/**
 * {@link StatelessDirectory} for `VITE_ROOM_TRANSPORT=local`. It keeps nothing: tabs find each
 * other's rooms through the transport's presence.
 */
export class LocalDirectory extends StatelessDirectory {
  /** @param options - Presence, and a clock for credential expiry. */
  constructor({ occupied, clock = systemClock }: LocalDirectoryOptions) {
    super({
      occupied,
      credential: async (channel, self) => {
        const value: LocalCredential = {
          channel,
          self,
          expiresAt: clock.now() + LOCAL_CREDENTIAL_TTL_MS,
        };
        return { value, expiresInMs: LOCAL_CREDENTIAL_TTL_MS };
      },
    });
  }
}
