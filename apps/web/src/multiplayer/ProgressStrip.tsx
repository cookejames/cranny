import { PIECE_COUNT, type LiveRound, type PlayerId, type Seat } from '@cranny/multiplayer';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { orderProgress, ordinal, progressEntries } from './progress.ts';
import styles from './ProgressStrip.module.css';

/** How long a bar takes to slide to its new place. */
export const SLIDE_MS = 200;

type ProgressStripProps = {
  round: LiveRound;
  self: PlayerId;
  seats: readonly Seat[];
  /** Display names by player id. */
  names: ReadonlyMap<PlayerId, string>;
  /** Not shown at all (the player's "Hide progress" choice). */
  hidden: boolean;
};

/** Whether the player asked for less motion. */
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The other participants' progress (specs/2026-09-25-multiplayer/SPEC.md §9, §12): a bar each,
 * with their name and "5/9", or their place once finished, ordered most complete first. A bar
 * that changes place slides there (FLIP: measured before and after the change).
 */
export function ProgressStrip({ round, self, seats, names, hidden }: ProgressStripProps) {
  const [order, setOrder] = useState<readonly PlayerId[]>([]);
  const bars = useRef(new Map<PlayerId, HTMLLIElement>());
  const positions = useRef(new Map<PlayerId, DOMRect>());

  const entries = progressEntries(round, self);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const ids = hidden ? [] : orderProgress(entries, order, seats);
  // Remember the order, so ties keep it next time (React's pattern for state from the last render).
  if (!hidden && (ids.length !== order.length || ids.some((id, i) => id !== order[i]))) {
    setOrder(ids);
  }

  useLayoutEffect(() => {
    const animate = !prefersReducedMotion();
    const next = new Map<PlayerId, DOMRect>();
    for (const [id, bar] of bars.current) {
      const rect = bar.getBoundingClientRect();
      next.set(id, rect);
      const before = positions.current.get(id);
      if (!animate || !before) continue;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (dx === 0 && dy === 0) continue;
      bar.style.transition = 'none';
      bar.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        bar.style.transition = `transform ${SLIDE_MS}ms ease-out`;
        bar.style.transform = '';
      });
    }
    positions.current = next;
  });

  if (hidden) {
    return null;
  }
  if (ids.length === 0) {
    return <p className={styles.empty}>Nobody else is playing this round</p>;
  }
  return (
    <ol className={styles.strip} aria-label="Other players’ progress">
      {ids.map((id) => {
        const { placed, place } = byId.get(id)!;
        const name = names.get(id) ?? 'Player';
        const fill = { '--fill': placed / PIECE_COUNT } as CSSProperties;
        return (
          <li
            key={id}
            className={styles.bar}
            data-finished={place !== null ? '' : undefined}
            ref={(el) => {
              if (el) bars.current.set(id, el);
              else bars.current.delete(id);
            }}
          >
            <span className={styles.line} aria-hidden="true">
              <span className={styles.name}>{name}</span>
              <span className={styles.count}>
                {place !== null ? ordinal(place) : `${placed}/${PIECE_COUNT}`}
              </span>
            </span>
            <span
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={PIECE_COUNT}
              aria-valuenow={placed}
              aria-label={
                place !== null
                  ? `${name}, finished ${ordinal(place)}`
                  : `${name}, ${placed} of ${PIECE_COUNT} pieces`
              }
            >
              <span className={styles.fill} style={fill} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
