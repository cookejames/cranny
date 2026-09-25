/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which multiplayer adapters to build in; unset turns multiplayer off (see `src/net/adapters.ts`). */
  readonly VITE_ROOM_TRANSPORT?: 'local' | 'ably';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
