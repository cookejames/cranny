import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './App.tsx';
import { listenForInstall } from './install/install.ts';
import { AppFrame } from './layout/AppFrame.tsx';
import './styles/fonts.ts';
import './styles/global.css';

// Before rendering: the browser may offer the install before React mounts.
listenForInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppFrame>
        <AppRoutes />
      </AppFrame>
    </BrowserRouter>
  </StrictMode>,
);
