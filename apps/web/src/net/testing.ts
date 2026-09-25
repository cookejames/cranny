import type { Clock } from '@cranny/multiplayer';
import type { Bus, PageLifecycle } from './localTransport.ts';

// Test doubles for LocalTransport's browser seams. Only tests import this file.

/**
 * An in-memory stand-in for BroadcastChannel on the injected clock: a post reaches every other
 * open bus of the same name (never the sender) after a 0 ms timer, as a structured clone.
 * `raw(channel)` opens a bus on a room's channel directly, to post frames as a stranger would.
 */
export function memoryBuses(clock: Clock) {
  const open = new Map<string, Set<{ deliver: (data: unknown) => void }>>();
  const openBus = (name: string): Bus => {
    const listeners: ((data: unknown) => void)[] = [];
    const self = { deliver: (data: unknown) => listeners.forEach((l) => l(data)) };
    const peers = open.get(name) ?? new Set();
    open.set(name, peers.add(self));
    let closed = false;
    return {
      post: (data) => {
        if (closed) throw new Error('Posted on a closed bus');
        const copy = structuredClone(data);
        for (const peer of peers) {
          if (peer !== self) clock.setTimeout(() => peers.has(peer) && peer.deliver(copy), 0);
        }
      },
      listen: (callback) => listeners.push(callback),
      close: () => {
        closed = true;
        peers.delete(self);
      },
    };
  };
  return { openBus, raw: (channel: string) => openBus(`cranny-room:${channel}`) };
}

/** A stand-in for `window` that records lifecycle listeners so tests can fire them. */
export function fakePage() {
  const listeners: Record<string, ((event: Event) => void)[]> = {};
  const page: PageLifecycle = {
    addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
  };
  /** Fires `pagehide` or `pageshow`; `persisted` means the back/forward cache is involved. */
  const fire = (type: 'pagehide' | 'pageshow', persisted: boolean) => {
    for (const l of listeners[type] ?? []) l({ persisted } as unknown as Event);
  };
  return { page, fire };
}
