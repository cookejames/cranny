/**
 * Generates the app icons in `public/` from one definition (specs/2026-09-25-installable/SPEC.md
 * §4): a capital C in Bricolage Grotesque 800, as an outline path, cream on ink. Run it with
 * `pnpm --filter @cranny/web icons` when the icon changes, and commit what it writes.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { Glyph, Path } from 'opentype.js';

// opentype.js ships as a UMD bundle, which Node can't import by name from an ES module.
const { parse } = createRequire(import.meta.url)('opentype.js') as typeof import('opentype.js');

const FONT = '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff';
const TOKENS = new URL('../src/styles/tokens.css', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);

/** How one icon file is drawn. */
interface IconStyle {
  /** Corner radius as a fraction of the side: 0 for full-bleed icons the platform masks itself. */
  readonly radius: number;
  /** Height of the C's outline as a fraction of the side. */
  readonly letterHeight: number;
}

/** Rounded square with the C filling about 60% of the height, for icons shown as they are. */
const ANY: IconStyle = { radius: 0.22, letterHeight: 0.6 };
/** Full bleed, for iOS, which rounds the corners itself. */
const FULL_BLEED: IconStyle = { radius: 0, letterHeight: 0.56 };
/**
 * Full bleed with the C inside the central 80% circle, so Android's masks never clip it: 0.46 of
 * the side keeps the corners of the C's bounding box within that circle.
 */
const MASKABLE: IconStyle = { radius: 0, letterHeight: 0.46 };

/** The PNG files and the style and size of each. */
const PNGS: readonly { file: string; size: number; style: IconStyle }[] = [
  { file: 'favicon-32.png', size: 32, style: ANY },
  { file: 'apple-touch-icon.png', size: 180, style: FULL_BLEED },
  { file: 'icon-192.png', size: 192, style: ANY },
  { file: 'icon-512.png', size: 512, style: ANY },
  { file: 'icon-maskable-512.png', size: 512, style: MASKABLE },
];

/** Side of the SVG coordinate space; the PNGs are rendered from it at their own size. */
const VIEW = 512;

/**
 * Reads a colour token from `tokens.css`, so the icon follows the app's palette.
 *
 * @throws If the token isn't defined as a hex colour.
 */
function token(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} isn't a hex colour in tokens.css`);
  return match[1];
}

/**
 * Writes a glyph outline as SVG path data, to two decimal places. Not opentype.js's `toPathData`,
 * whose optimisation drops some of this glyph's straight edges.
 */
function pathData(path: Path): string {
  const n = (value: number) => value.toFixed(2);
  return path.commands
    .map((command) => {
      switch (command.type) {
        case 'M':
        case 'L':
          return `${command.type}${n(command.x)} ${n(command.y)}`;
        case 'Q':
          return `Q${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}`;
        case 'C':
          return `C${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join('');
}

/**
 * Draws the icon as SVG markup on a `VIEW`-sized square.
 *
 * @param glyph - The C, from the display font.
 * @param unitsPerEm - The font's design units per em, which the glyph's coordinates use.
 */
function iconSvg(
  glyph: Glyph,
  unitsPerEm: number,
  style: IconStyle,
  colors: { ground: string; ink: string },
): string {
  // Measure at 1 unit per font unit, then scale so the outline is the wanted height and centre
  // its bounding box (y grows downwards in SVG, so the path is drawn from the baseline at y=0).
  const measured = glyph.getPath(0, 0, unitsPerEm).getBoundingBox();
  const scale = (style.letterHeight * VIEW) / (measured.y2 - measured.y1);
  const width = (measured.x2 - measured.x1) * scale;
  const height = (measured.y2 - measured.y1) * scale;
  const x = (VIEW - width) / 2 - measured.x1 * scale;
  const y = (VIEW - height) / 2 - measured.y1 * scale;
  const path = pathData(glyph.getPath(x, y, unitsPerEm * scale));
  const rx = style.radius * VIEW;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">`,
    `<rect width="${VIEW}" height="${VIEW}" rx="${rx}" fill="${colors.ink}"/>`,
    `<path d="${path}" fill="${colors.ground}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** Writes `favicon.svg` and every PNG in `PNGS` to `public/`. */
async function main(): Promise<void> {
  const fontFile = await readFile(fileURLToPath(import.meta.resolve(FONT)));
  const font = parse(
    fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength),
  );
  const glyph = font.charToGlyph('C');
  const css = await readFile(TOKENS, 'utf8');
  const colors = { ground: token(css, 'color-ground'), ink: token(css, 'color-ink') };

  await writeFile(new URL('favicon.svg', PUBLIC), iconSvg(glyph, font.unitsPerEm, ANY, colors));
  for (const { file, size, style } of PNGS) {
    const svg = iconSvg(glyph, font.unitsPerEm, style, colors);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    await writeFile(new URL(file, PUBLIC), png);
  }
  console.log(`Wrote favicon.svg and ${PNGS.length} PNGs to ${fileURLToPath(PUBLIC)}`);
}

await main();
