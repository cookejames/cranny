import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import securityHeaders from './security-headers.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
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
