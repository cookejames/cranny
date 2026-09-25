import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { computeLayout, type Layout, type Viewport } from './layout.ts';
import styles from './AppFrame.module.css';

/** The visible viewport size, using `visualViewport` where available (it excludes the keyboard). */
function readViewport(): Viewport {
  const vv = window.visualViewport;
  return vv
    ? { width: vv.width, height: vv.height }
    : { width: window.innerWidth, height: window.innerHeight };
}

/** Tracks the viewport size, updating on resize and orientation change. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return viewport;
}

/** A layout as the CSS variables stylesheets read. */
export const layoutVars = (layout: Layout) =>
  ({
    '--column-width': `${layout.columnWidth}px`,
    '--board-size': `${layout.board}px`,
    '--tile-size': `${layout.tile}px`,
  }) as CSSProperties;

/**
 * The app's centred, full-height column. Computes the play-screen layout from the viewport and
 * exposes it to stylesheets as CSS variables (`--column-width`, `--board-size`, `--tile-size`).
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const layout = computeLayout(useViewport());
  return (
    <div className={styles.frame} style={layoutVars(layout)}>
      {children}
    </div>
  );
}
