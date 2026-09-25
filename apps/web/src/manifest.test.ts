import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import manifestText from '../public/manifest.webmanifest?raw';
import securityHeaders from '../security-headers.json';

/**
 * The web app manifest and icons (specs/2026-09-25-installable/SPEC.md §3, §4, §6). CloudFront
 * answers a missing path with index.html and a 200, so a broken icon path would never 404 in
 * production: every file the manifest and index.html point at must be in public/.
 */

/** Every file in public/, as a base64 data URI, keyed by its path from the site root. */
const PUBLIC: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../public/*', { query: '?inline', import: 'default', eager: true }),
  ).map(([path, dataUri]) => [path.replace('../public', ''), dataUri]),
);

/** The width and height in a PNG's IHDR chunk, or null if the data isn't a PNG. */
function pngSize(dataUri: string): { width: number; height: number } | null {
  const bytes = Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (c) =>
    c.charCodeAt(0),
  );
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, i) => bytes[i] === byte)) return null;
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The `href` of every `<link>` in index.html with the given `rel`. */
function linkHrefs(rel: string): string[] {
  const head = new DOMParser().parseFromString(indexHtml, 'text/html');
  return [...head.querySelectorAll(`link[rel="${rel}"]`)].map((link) => link.getAttribute('href')!);
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

const manifest = JSON.parse(manifestText) as Record<string, unknown> & { icons: ManifestIcon[] };

describe('manifest', () => {
  it('has the fields in SPEC §3', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Cranny',
      short_name: 'Cranny',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f3efe6',
      theme_color: '#f3efe6',
    });
  });

  it('matches the page description and theme colour', () => {
    const head = new DOMParser().parseFromString(indexHtml, 'text/html');
    const meta = (name: string) =>
      head.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
    expect(manifest.description).toBe(meta('description'));
    expect(manifest.theme_color).toBe(meta('theme-color')?.toLowerCase());
  });

  it('lists 192 and 512 px icons for any use and a 512 px maskable one', () => {
    const icons = manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`);
    expect(icons).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
  });

  it.each(manifest.icons.map((icon) => [icon.src, icon] as const))(
    'has %s in public/ at the size it claims',
    (src, icon) => {
      expect(icon.type).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(PUBLIC[src] && pngSize(PUBLIC[src])).toEqual({ width, height });
    },
  );
});

describe('index.html', () => {
  it('links the manifest, favicons and the iOS icon, all in public/', () => {
    const hrefs = [
      ...linkHrefs('manifest'),
      ...linkHrefs('icon'),
      ...linkHrefs('apple-touch-icon'),
    ];
    expect(hrefs).toEqual([
      '/manifest.webmanifest',
      '/favicon.svg',
      '/favicon-32.png',
      '/apple-touch-icon.png',
    ]);
    for (const href of hrefs) expect(PUBLIC, href).toHaveProperty([href]);
  });

  it('has PNG icons at the sizes platforms expect', () => {
    expect(pngSize(PUBLIC['/favicon-32.png']!)).toEqual({ width: 32, height: 32 });
    expect(pngSize(PUBLIC['/apple-touch-icon.png']!)).toEqual({ width: 180, height: 180 });
  });
});

describe('Content-Security-Policy', () => {
  it('allows the same-origin manifest', () => {
    const directives = securityHeaders['Content-Security-Policy'].split(';').map((d) => d.trim());
    expect(directives).toContain("manifest-src 'self'");
  });
});
