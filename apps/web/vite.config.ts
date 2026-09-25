import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import securityHeaders from './security-headers.json' with { type: 'json' };

/** The values `VITE_ROOM_TRANSPORT` may take; `ably` joins them in Phase 6 (src/net/adapters.ts). */
const ROOM_TRANSPORTS = ['local'];

/** Fails the build if `VITE_ROOM_TRANSPORT` names adapters that don't exist. */
function checkRoomTransport(): Plugin {
  return {
    name: 'cranny:check-room-transport',
    configResolved({ env }) {
      const value: unknown = env.VITE_ROOM_TRANSPORT;
      if (value === undefined || value === '' || ROOM_TRANSPORTS.includes(value as string)) return;
      throw new Error(
        `VITE_ROOM_TRANSPORT=${String(value)} isn't supported: use ${ROOM_TRANSPORTS.join(' or ')}, or leave it unset to turn multiplayer off.`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), checkRoomTransport()],
  build: {
    // Never inline assets as data: URIs, which the CSP (security-headers.json) doesn't allow.
    assetsInlineLimit: 0,
  },
  // `pnpm preview` serves the production build with the same headers CloudFront will send
  // (specs/2026-09-25-single-player/SPEC.md §11), so CSP problems show up before deploying.
  preview: { headers: securityHeaders },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // CSS is stubbed out in tests, except the tokens, which the contrast test reads.
    css: { include: [/tokens\.css/] },
  },
});
