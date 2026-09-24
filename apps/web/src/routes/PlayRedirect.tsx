import { CURRENT_VERSION, encodeGridCode, randomSeed } from '@cranny/engine';
import { useState } from 'react';
import { Navigate } from 'react-router';
import type { DealtState } from './GridPage.tsx';

/**
 * `/play`: picks a random seed and replaces the URL with `/g/<code>`, so every grid is shareable
 * and Back skips this route (SPEC.md §5). Router state marks the grid as dealt, not shared.
 */
export function PlayRedirect() {
  // A state initialiser, not a plain call, so re-renders can't pick a different grid.
  const [code] = useState(() => encodeGridCode({ version: CURRENT_VERSION, seed: randomSeed() }));
  const state: DealtState = { dealt: true };
  return <Navigate to={`/g/${code}`} replace state={state} />;
}
