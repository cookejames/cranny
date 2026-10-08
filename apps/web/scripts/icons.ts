/**
 * Generates the app icons and the social preview image in `public/` from one definition
 * (specs/2026-10-08-seo/SPEC.md §6, replacing specs/2026-09-25-installable/SPEC.md §4's letter
 * mark): a small solved 3×3 board in the piece colours, with one blocked square, drawn the way the
 * game draws its board. Run it with `pnpm --filter @cranny/web icons` when the icon changes, and
 * commit what it writes.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cellsOf, colOf, PIECES, rowOf, type PieceId } from '@cranny/engine';
import { Resvg } from '@resvg/resvg-js';
import type { Font, Path } from 'opentype.js';
import { CELL_GAP, PIECE_RADIUS } from '../src/board/metrics.ts';
import { outlinePath, spanOf } from '../src/board/outline.ts';
import { SHOWCASE_BOARD } from '../src/home/showcase.ts';

// opentype.js ships as a UMD bundle, which Node can't import by name from an ES module.
const { parse } = createRequire(import.meta.url)('opentype.js') as typeof import('opentype.js');

const DISPLAY_FONT =
  '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff';
const BODY_FONT = '@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff';
const TOKENS = new URL('../src/styles/tokens.css', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);

/** A board to draw: its side in cells, its blocked cells, and each piece's cells. */
interface Drawing {
  readonly size: number;
  readonly blocked: ReadonlyArray<readonly [number, number]>;
  readonly pieces: ReadonlyArray<{
    readonly id: PieceId;
    readonly cells: ReadonlyArray<readonly [number, number]>;
  }>;
}

/**
 * The icon's board, one string per row: piece ids, and `X` for the blocked square in the middle
 * (the cranny). Every piece is a real piece in one of its orientations.
 */
const ICON_ROWS = ['V3 V3 D2', 'V3 X  D2', 'I3 I3 I3'];

/** How one icon file is drawn. */
interface IconStyle {
  /** Corner radius of the tile as a fraction of the side: 0 for icons the platform masks. */
  readonly radius: number;
  /** Width of the 3×3 cell area as a fraction of the side. */
  readonly boardWidth: number;
  /** Gap between cells as a fraction of a cell. */
  readonly gap: number;
}

/** Rounded tile, for icons shown as they are, at the game's own cell gap. */
const ANY: IconStyle = { radius: 0.22, boardWidth: 0.8, gap: CELL_GAP };
/**
 * As `ANY` with wider gaps, for favicons: at 16–32 px the game's gap is under a pixel and the
 * pieces would run together.
 */
const SMALL: IconStyle = { radius: 0.22, boardWidth: 0.84, gap: 0.16 };
/** Full bleed, for iOS, which rounds the corners itself. */
const FULL_BLEED: IconStyle = { radius: 0, boardWidth: 0.76, gap: CELL_GAP };
/**
 * Full bleed with the board inside the central 80% circle, so Android's masks never clip it: a
 * square's corners reach the circle at 0.8 / √2 ≈ 0.566 of the side.
 */
const MASKABLE: IconStyle = { radius: 0, boardWidth: 0.56, gap: CELL_GAP };

/** The PNG files and the style and size of each. */
const PNGS: readonly { file: string; size: number; style: IconStyle }[] = [
  { file: 'favicon-32.png', size: 32, style: SMALL },
  { file: 'apple-touch-icon.png', size: 180, style: FULL_BLEED },
  { file: 'icon-192.png', size: 192, style: ANY },
  { file: 'icon-512.png', size: 512, style: ANY },
  { file: 'icon-maskable-512.png', size: 512, style: MASKABLE },
];

/** Side of the icons' SVG coordinate space; the PNGs are rendered from it at their own size. */
const VIEW = 512;

/** The social preview image's size, as Open Graph and X recommend. */
const OG = { file: 'og-image.png', width: 1200, height: 630 } as const;

/** Colours from `tokens.css`. */
interface Palette {
  readonly ground: string;
  readonly ink: string;
  readonly muted: string;
  readonly frame: string;
  readonly blocked: string;
  readonly peg: string;
  readonly piece: (id: PieceId) => string;
}

/**
 * Reads a colour token from `tokens.css`, so the images follow the app's palette.
 *
 * @throws If the token isn't defined as a hex colour.
 */
function token(css: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} isn't a hex colour in tokens.css`);
  return match[1];
}

/** Every colour the images use, from `tokens.css`. */
function palette(css: string): Palette {
  return {
    ground: token(css, 'color-ground'),
    ink: token(css, 'color-ink'),
    muted: token(css, 'color-muted'),
    frame: token(css, 'color-board-frame'),
    blocked: token(css, 'color-cell-blocked'),
    peg: token(css, 'color-peg'),
    piece: (id) => token(css, PIECES[id].colorToken),
  };
}

/**
 * A drawing from a text layout like `ICON_ROWS`.
 *
 * @throws If a cell is neither `X` nor a piece id.
 */
function drawingFromRows(rows: readonly string[]): Drawing {
  const blocked: Array<[number, number]> = [];
  const cells = new Map<PieceId, Array<[number, number]>>();
  rows.forEach((line, row) =>
    line
      .trim()
      .split(/\s+/)
      .forEach((key, col) => {
        if (key === 'X') blocked.push([row, col]);
        else if (key in PIECES) {
          const id = key as PieceId;
          cells.set(id, [...(cells.get(id) ?? []), [row, col]]);
        } else throw new Error(`Unknown cell "${key}"`);
      }),
  );
  return { size: rows.length, blocked, pieces: [...cells].map(([id, c]) => ({ id, cells: c })) };
}

/** Home's solved showcase board as a drawing, for the social preview. */
function showcaseDrawing(): Drawing {
  const { grid, placements } = SHOWCASE_BOARD;
  const toRowCol = (cell: number) => [rowOf(cell), colOf(cell)] as const;
  return {
    size: 6,
    blocked: grid.blocked.map(toRowCol),
    pieces: Object.entries(placements).map(([id, placement]) => ({
      id: id as PieceId,
      cells: cellsOf(id as PieceId, placement)!.map(toRowCol),
    })),
  };
}

/**
 * Draws a board's cells as SVG markup: merged piece outlines and blocked squares with their pegs,
 * as the game draws them (Board.tsx). No frame: the caller draws whatever the cells sit on.
 *
 * @param x - Left edge of the cell area, in SVG units.
 * @param y - Top edge of the cell area, in SVG units.
 * @param width - Width of the cell area, in SVG units.
 * @param gap - Gap between cells, as a fraction of a cell.
 */
function cellsSvg(
  drawing: Drawing,
  x: number,
  y: number,
  width: number,
  gap: number,
  colors: Palette,
): string {
  const cell = width / spanOf(drawing.size, gap);
  const step = 1 + gap;
  const pegRadius = 0.135;
  return [
    `<g transform="translate(${x} ${y}) scale(${cell})">`,
    ...drawing.blocked.map(([r, c]) =>
      [
        `<rect x="${c * step}" y="${r * step}" width="1" height="1" rx="${PIECE_RADIUS}" fill="${colors.blocked}"/>`,
        `<circle cx="${c * step + 0.5}" cy="${r * step + 0.5}" r="${pegRadius}" fill="${colors.peg}"/>`,
      ].join(''),
    ),
    ...drawing.pieces.map(
      ({ id, cells }) =>
        `<path d="${outlinePath(cells, gap, PIECE_RADIUS)}" fill="${colors.piece(id)}"/>`,
    ),
    `</g>`,
  ].join('\n');
}

/** Draws an icon as SVG markup on a `VIEW`-sized square: the icon board on a board-frame tile. */
function iconSvg(style: IconStyle, colors: Palette): string {
  const width = style.boardWidth * VIEW;
  const offset = (VIEW - width) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">`,
    `<rect width="${VIEW}" height="${VIEW}" rx="${style.radius * VIEW}" fill="${colors.frame}"/>`,
    cellsSvg(drawingFromRows(ICON_ROWS), offset, offset, width, style.gap, colors),
    `</svg>`,
    '',
  ].join('\n');
}

/**
 * Writes a glyph outline as SVG path data, to two decimal places. Not opentype.js's `toPathData`,
 * whose optimisation drops some straight edges of Bricolage's glyphs.
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
 * A line of text as SVG path data, laid out glyph by glyph with the font's kerning. Not
 * opentype.js's `getPath` for whole strings, which throws on substitutions in Bricolage's tables.
 *
 * @param x - Left edge of the first glyph, in SVG units.
 * @param y - Baseline, in SVG units.
 * @param size - Font size, in SVG units.
 * @param tracking - Extra space between letters, in ems (negative to tighten).
 */
function textPath(font: Font, text: string, x: number, y: number, size: number, tracking = 0) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...text].map((char) => font.charToGlyph(char));
  let pen = x;
  return glyphs
    .map((glyph, i) => {
      const d = pathData(glyph.getPath(pen, y, size));
      const next = glyphs[i + 1];
      const kerning = next ? font.getKerningValue(glyph, next) : 0;
      pen += ((glyph.advanceWidth ?? 0) + kerning) * scale + tracking * size;
      return d;
    })
    .join('');
}

/**
 * Draws the social preview as SVG markup: Home's solved board on the left, the wordmark and
 * tagline on the right, on the app's cream ground. Text is drawn as outlines, so the render needs
 * no fonts.
 */
function ogSvg(fonts: { display: Font; body: Font }, colors: Palette): string {
  const { width, height } = OG;
  const board = 470;
  const padding = 14;
  const boardX = 80;
  const boardY = (height - board) / 2;
  const textX = boardX + board + 70;
  const wordmark = textPath(fonts.display, 'Cranny', textX, 300, 150, -0.03);
  const lines = [
    'A quick block puzzle game.',
    'Nine pieces. Seven blocked',
    'squares. One grid to fill.',
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${colors.ground}"/>`,
    `<rect x="${boardX}" y="${boardY}" width="${board}" height="${board}" rx="26" fill="${colors.frame}"/>`,
    cellsSvg(
      showcaseDrawing(),
      boardX + padding,
      boardY + padding,
      board - 2 * padding,
      CELL_GAP,
      colors,
    ),
    `<path d="${wordmark}" fill="${colors.ink}"/>`,
    ...lines.map(
      (line, i) =>
        `<path d="${textPath(fonts.body, line, textX + 4, 380 + i * 46, 36)}" fill="${i === 0 ? colors.ink : colors.muted}"/>`,
    ),
    `</svg>`,
    '',
  ].join('\n');
}

/** Loads a WOFF font from a package path. */
async function loadFont(specifier: string): Promise<Font> {
  const file = await readFile(fileURLToPath(import.meta.resolve(specifier)));
  return parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}

/** Renders SVG markup to a PNG of the given width. */
const png = (svg: string, width: number) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

/** Writes `favicon.svg`, every PNG in `PNGS` and the social preview to `public/`. */
async function main(): Promise<void> {
  const colors = palette(await readFile(TOKENS, 'utf8'));
  const fonts = { display: await loadFont(DISPLAY_FONT), body: await loadFont(BODY_FONT) };

  await writeFile(new URL('favicon.svg', PUBLIC), iconSvg(SMALL, colors));
  for (const { file, size, style } of PNGS) {
    await writeFile(new URL(file, PUBLIC), png(iconSvg(style, colors), size));
  }
  await writeFile(new URL(OG.file, PUBLIC), png(ogSvg(fonts, colors), OG.width));
  console.log(`Wrote favicon.svg, ${PNGS.length + 1} PNGs to ${fileURLToPath(PUBLIC)}`);
}

await main();
