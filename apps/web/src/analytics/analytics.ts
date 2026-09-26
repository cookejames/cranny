import type { PostHog, PostHogConfig } from 'posthog-js';

// Cookieless usage analytics through PostHog (specs/2026-09-26-analytics/SPEC.md). Only the
// events below are sent: no autocapture, no identifiers, nothing stored on the device, and room
// and grid codes are scrubbed from URLs. `VITE_POSTHOG_KEY` is set for production builds only
// (`.env.production`); without it every function here does nothing. posthog-js is loaded with a
// dynamic import once the browser is idle, so it stays out of the main bundle.

/** How long a solve took, in coarse buckets (exact times aren't needed to count plays). */
export type DurationBucket = '<1m' | '1-2m' | '2-5m' | '5-10m' | '10m+';

/**
 * Every event the app sends. A new feature to count gets a member here; keep properties
 * low-cardinality and free of anything that identifies a player, a room or a grid.
 */
export type AnalyticsEvent =
  | { name: 'solo_round_started'; shared: boolean }
  | { name: 'solo_round_completed'; shared: boolean; duration: DurationBucket }
  | { name: 'mp_room_created'; customName: boolean }
  | { name: 'mp_room_joined' }
  | { name: 'mp_round_started'; players: number }
  | { name: 'mp_round_completed'; players: number; duration: DurationBucket }
  | { name: 'install_clicked'; platform: 'android' | 'ios' }
  | {
      name: 'link_shared';
      kind: 'grid' | 'room';
      result: 'shared' | 'copied' | 'cancelled' | 'failed';
    };

/**
 * Where the SDK sends events: CloudFront forwards `/relay/*` to PostHog's EU ingestion and
 * `/relay/static/*` and `/relay/array/*` to its assets (infra/cdn.tf), so the CSP's
 * `connect-src 'self'` covers it and ad blockers don't recognise it.
 */
const API_HOST = '/relay';

const key = import.meta.env.VITE_POSTHOG_KEY;

/** Whether this build sends analytics. */
export const analyticsEnabled = typeof key === 'string' && key !== '';

/** Buckets a solve time. */
export function durationBucket(ms: number): DurationBucket {
  const minutes = ms / 60_000;
  if (minutes < 1) return '<1m';
  if (minutes < 2) return '1-2m';
  if (minutes < 5) return '2-5m';
  if (minutes < 10) return '5-10m';
  return '10m+';
}

/**
 * A URL or path with room names and grid codes replaced by placeholders, and the query and
 * fragment dropped: a room name is enough to join the room, and `?solve` is noise.
 */
export function scrubUrl(value: string): string {
  return value
    .replace(/[?#].*$/, '')
    .replace(/\/m\/[^/]+/, '/m/:room')
    .replace(/\/g\/[^/]+/, '/g/:code');
}

/** Property names PostHog fills with the page's URL, path or referrer. */
const URL_PROPERTY = /url|pathname|referrer/i;

/**
 * Scrubs every URL-like string property of an event before it's sent (`before_send`). Mutates
 * and returns `properties`.
 */
export function scrubProperties(properties: Record<string, unknown>): Record<string, unknown> {
  for (const [name, value] of Object.entries(properties)) {
    if (typeof value === 'string' && URL_PROPERTY.test(name)) properties[name] = scrubUrl(value);
  }
  return properties;
}

/** posthog-js settings: cookieless, events and page views only. */
const CONFIG: Partial<PostHogConfig> = {
  api_host: API_HOST,
  ui_host: 'https://eu.posthog.com',
  defaults: '2026-05-30',
  // PostHog's server counts visitors with a daily-salted hash; nothing is stored on the device.
  // Needs "Cookieless server hash mode" turned on in the project settings.
  cookieless_mode: 'always',
  person_profiles: 'never',
  autocapture: false,
  capture_pageview: 'history_change',
  capture_pageleave: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_exceptions: false,
  capture_performance: false,
  rageclick: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  advanced_disable_flags: true,
  disable_external_dependency_loading: true,
  before_send: (event) => {
    if (event) scrubProperties(event.properties);
    return event;
  },
};

let client: Promise<PostHog | null> | null = null;

/** Loads and starts posthog-js the first time it's asked for; resolves null if that fails. */
function load(): Promise<PostHog | null> {
  client ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key!, CONFIG);
      return posthog;
    })
    .catch(() => null);
  return client;
}

/**
 * Starts analytics once the browser is idle, which also records the first page view (later ones
 * come from history changes). Does nothing when analytics is off.
 */
export function startAnalytics(): void {
  if (!analyticsEnabled) return;
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => void load());
  else setTimeout(() => void load(), 0);
}

/** Sends one event, loading posthog-js first if need be. Never throws; a no-op when off. */
export function track(event: AnalyticsEvent): void {
  if (!analyticsEnabled) return;
  const { name, ...properties } = event;
  void load().then((posthog) => {
    try {
      posthog?.capture(name, properties);
    } catch {
      // Analytics must never break the game.
    }
  });
}
