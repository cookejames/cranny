import { Navigate, Route, Routes } from 'react-router';
import { GridPage } from './routes/GridPage.tsx';
import { HomePage } from './routes/HomePage.tsx';
import { PlayRedirect } from './routes/PlayRedirect.tsx';

/** The app's routes (SPEC.md §5). Rendered inside a router, so tests can use a `MemoryRouter`. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/play" element={<PlayRedirect />} />
      <Route path="/g/:code" element={<GridPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
