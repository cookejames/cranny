import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import securityHeaders from './security-headers.json' with { type: 'json' };

/** The values `VITE_ROOM_TRANSPORT` may take (src/net/adapters.ts). */
const ROOM_TRANSPORTS = ['local', 'ably'];

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

/**
 * `/api` goes to the deployed rooms API (apps/rooms-api), so `pnpm dev:ably` and a preview of an
 * `ably` build play through real Ably. In production CloudFront routes it (infra/cdn.tf).
 */
const roomsApiProxy = { '/api': { target: 'https://cranny.cooke.ing', changeOrigin: true } };

/**
 * `/relay` goes to PostHog without the prefix, as CloudFront sends it (infra/cdn.tf), so a
 * preview of a production build sends analytics. SDK assets come from a separate host, so
 * those paths come first.
 */
const posthogProxy = Object.fromEntries(
  [
    ['/relay/static', 'https://eu-assets.i.posthog.com'],
    ['/relay/array', 'https://eu-assets.i.posthog.com'],
    ['/relay', 'https://eu.i.posthog.com'],
  ].map(([path, target]) => [
    path,
    { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/relay/, '') },
  ]),
);

export default defineConfig({
  plugins: [react(), checkRoomTransport()],
  build: {
    // Never inline assets as data: URIs, which the CSP (security-headers.json) doesn't allow.
    assetsInlineLimit: 0,
  },
  // `pnpm preview` serves the production build with the same headers CloudFront will send
  // (specs/2026-09-25-single-player/SPEC.md §11), so CSP problems show up before deploying.
  preview: { headers: securityHeaders, proxy: { ...roomsApiProxy, ...posthogProxy } },
  server: { proxy: { ...roomsApiProxy, ...posthogProxy } },
  test: {
    environment: 'jsdom',
    // ABLY_KEY from the repo-root .env (git-ignored), for the Ably conformance run. Tests only:
    // the build reads nothing but VITE_ variables.
    env: loadEnv('test', new URL('../..', import.meta.url).pathname, 'ABLY_'),
    setupFiles: ['./src/test/setup.ts'],
    // CSS is stubbed out in tests, except the tokens, which the contrast test reads.
    css: { include: [/tokens\.css/] },
  },
});
