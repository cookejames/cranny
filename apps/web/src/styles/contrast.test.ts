import { describe, expect, it } from 'vitest';
import tokens from './tokens.css?raw';

/**
 * Text contrast (specs/2026-09-25-single-player/SPEC.md §10): every text colour the stylesheets use, on every background it
 * sits on, must reach 4.5:1 (WCAG AA for normal text). Read from the real tokens, so a palette
 * change that breaks contrast fails here. Disabled controls are exempt under WCAG.
 */

/** The token's hex value from tokens.css. */
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens);
  if (!match) throw new Error(`No token --${name}`);
  return match[1]!;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [text token, background token, where it's used]. */
const PAIRS: Array<[string, string, string]> = [
  ['color-ink', 'color-ground', 'body text, toast, error screen'],
  ['color-muted', 'color-ground', 'tagline, header label, progress count'],
  ['color-muted', 'color-tile', 'tray labels, Home stat labels, "You" and "away" markers'],
  ['color-muted', 'color-tile-selected', 'selected tray tile label'],
  ['color-ink', 'color-tile', 'Home stat values, multiplayer player rows'],
  ['color-ink', 'color-tile-selected', 'pressed Ready, multiplayer text fields'],
  [
    'color-invalid',
    'color-ground',
    '"Tap again to skip", close-out banner, join and create errors',
  ],
  ['color-ground', 'color-ink', 'primary buttons, Start, Play card'],
  ['color-night-label', 'color-ink', 'Play card description'],
  ['color-night-text', 'color-night', 'Results text and Share/Home'],
  ['color-night-label', 'color-night', 'Results label'],
  ['color-best', 'color-night', '"New personal best"'],
  ['color-night-muted', 'color-night-card', 'Results card labels'],
  ['color-night-text', 'color-night-card', 'Results card values'],
  ['color-night', 'color-night-text', 'Next grid button'],
];

describe('text contrast', () => {
  it.each(PAIRS)('%s on %s (%s) is at least 4.5:1', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });
});
