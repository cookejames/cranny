import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Fresh copies of the modules, so `adapters.ts` reads `VITE_ROOM_TRANSPORT` as currently stubbed
 * and the adapter classes are the ones it uses.
 */
async function load() {
  vi.resetModules();
  return {
    ...(await import('./adapters.ts')),
    ...(await import('./localDirectory.ts')),
    ...(await import('./localTransport.ts')),
    ...(await import('./ablyTransport.ts')),
    ...(await import('./httpDirectory.ts')),
  };
}

describe('room adapters', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('turns multiplayer off when VITE_ROOM_TRANSPORT is unset', async () => {
    vi.stubEnv('VITE_ROOM_TRANSPORT', undefined);
    const { multiplayerEnabled, roomAdapters } = await load();
    expect(multiplayerEnabled).toBe(false);
    expect(roomAdapters()).toBeNull();
  });

  it('uses the local adapters, created once, for VITE_ROOM_TRANSPORT=local', async () => {
    vi.stubEnv('VITE_ROOM_TRANSPORT', 'local');
    const { multiplayerEnabled, roomAdapters, LocalDirectory, LocalTransport } = await load();
    expect(multiplayerEnabled).toBe(true);
    const adapters = roomAdapters();
    expect(adapters?.transport).toBeInstanceOf(LocalTransport);
    expect(adapters?.directory).toBeInstanceOf(LocalDirectory);
    expect(roomAdapters()).toBe(adapters);
  });

  it('uses Ably and the rooms API, created once, for VITE_ROOM_TRANSPORT=ably', async () => {
    vi.stubEnv('VITE_ROOM_TRANSPORT', 'ably');
    const { multiplayerEnabled, roomAdapters, AblyTransport, HttpDirectory } = await load();
    expect(multiplayerEnabled).toBe(true);
    const adapters = roomAdapters();
    expect(adapters?.transport).toBeInstanceOf(AblyTransport);
    expect(adapters?.directory).toBeInstanceOf(HttpDirectory);
    expect(roomAdapters()).toBe(adapters);
  });
});
