// @vitest-environment node
// ablyTesting must come first: it replaces WebSocket before the Ably SDK captures it.
import { ABLY_KEY, cutPlayer, restorePlayer, roomToken, testTicket } from './ablyTesting.ts';
import { cryptoRandom, randomPlayerId } from '@cranny/multiplayer';
import { describeTransportConformance } from '@cranny/multiplayer/testing';
import { describe, expect, it, vi } from 'vitest';
import { AblyConnection, AblyTransport, statusFor } from './ablyTransport.ts';

describe('statusFor', () => {
  it('maps Ably connection states to room statuses', () => {
    expect(statusFor('initialized', false)).toBe('connecting');
    expect(statusFor('connecting', false)).toBe('connecting');
    expect(statusFor('connecting', true)).toBe('reconnecting');
    expect(statusFor('connected', true)).toBe('connected');
    expect(statusFor('disconnected', true)).toBe('reconnecting');
    expect(statusFor('suspended', true)).toBe('reconnecting');
    for (const state of ['closing', 'closed', 'failed'] as const) {
      expect(statusFor(state, true)).toBe('closed');
    }
  });
});

/** The AblyConnection behind an interface value. */
function ably(connection: unknown): AblyConnection {
  if (!(connection instanceof AblyConnection)) throw new Error('Not an AblyConnection');
  return connection;
}

// Against the real Ably service, in real time, so only with a key (SPEC §14).
if (ABLY_KEY) {
  const key = ABLY_KEY;
  const run = randomPlayerId(cryptoRandom).slice(0, 8);
  vi.setConfig({ testTimeout: 60_000 });

  describeTransportConformance('AblyTransport', () => ({
    transport: new AblyTransport({
      directory: {
        refreshCredential: async (ticket, self) => ({
          value: await roomToken(key, ticket.channel, self),
          expiresInMs: 3_600_000,
        }),
      },
    }),
    ticket: (room, self) => testTicket(key, run, room, self),
    drop: (connection) => cutPlayer(ably(connection).self),
    restore: (connection) => {
      restorePlayer(ably(connection).self);
      ably(connection).client.connection.connect();
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }));
} else {
  describe.skip('AblyTransport conformance (needs ABLY_KEY in the repo-root .env)', () => {
    it('runs against Ably', () => {});
  });
}
