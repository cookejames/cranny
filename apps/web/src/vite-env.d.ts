/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which multiplayer adapters to build in; unset turns multiplayer off (see `src/net/adapters.ts`). */
  readonly VITE_ROOM_TRANSPORT?: 'local' | 'ably';
  /** PostHog project key; unset turns analytics off (see `src/analytics/analytics.ts`). */
  readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
