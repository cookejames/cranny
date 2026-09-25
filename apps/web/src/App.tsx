import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useRoomAdapters } from './multiplayer/RoomAdaptersContext.ts';
import { GridPage } from './routes/GridPage.tsx';
import { HomePage } from './routes/HomePage.tsx';
import { PlayRedirect } from './routes/PlayRedirect.tsx';

// The multiplayer screens load on first use, so solo play doesn't download them.
const MultiplayerPage = lazy(() =>
  import('./multiplayer/MultiplayerPage.tsx').then((m) => ({ default: m.MultiplayerPage })),
);
const RoomPage = lazy(() =>
  import('./multiplayer/RoomPage.tsx').then((m) => ({ default: m.RoomPage })),
);

/**
 * The app's routes (specs/2026-09-25-single-player/SPEC.md §5). Rendered inside a router, so
 * tests can use a `MemoryRouter`. The multiplayer routes exist only in builds with multiplayer
 * adapters (specs/2026-09-25-multiplayer/SPEC.md §9 Routes); otherwise they redirect Home.
 */
export function AppRoutes() {
  const adapters = useRoomAdapters();
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomePage multiplayer={adapters !== null} />} />
        <Route path="/play" element={<PlayRedirect />} />
        <Route path="/g/:code" element={<GridPage />} />
        {adapters && (
          <>
            <Route
              path="/multiplayer"
              element={<MultiplayerPage directory={adapters.directory} />}
            />
            <Route path="/m/:room" element={<RoomPage adapters={adapters} />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
