import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import robots from '../public/robots.txt?raw';
import sitemap from '../public/sitemap.xml?raw';
import { SITE_ORIGIN } from './seo/pageMeta.ts';

/**
 * Search engine files and head tags (specs/2026-10-08-seo/SPEC.md §1–§3). The site's address is
 * written out in index.html, robots.txt and sitemap.xml, so these check they agree with
 * `SITE_ORIGIN` and with what's in public/.
 */

const doc = new DOMParser().parseFromString(indexHtml, 'text/html');

/** The `content` of the `<meta>` with the given `property`. */
const property = (name: string) =>
  doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content');

/** The path of each `<loc>` in sitemap.xml, checking it's on the site. */
function sitemapPaths(): string[] {
  const xml = new DOMParser().parseFromString(sitemap, 'application/xml');
  return [...xml.getElementsByTagName('loc')].map((loc) => {
    const url = new URL(loc.textContent);
    expect(url.origin).toBe(SITE_ORIGIN);
    return url.pathname;
  });
}

/** Every PNG in public/, as a data URI, keyed by its path from the site root. */
const PUBLIC: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../public/*.png', {
      query: '?inline',
      import: 'default',
      eager: true,
    }),
  ).map(([path, dataUri]) => [path.replace('../public', ''), dataUri]),
);

/** The width and height in a PNG's IHDR chunk. */
function pngSize(dataUri: string): { width: number; height: number } {
  const bytes = Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (c) =>
    c.charCodeAt(0),
  );
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('robots.txt', () => {
  it('lets crawlers in, except to the rooms API and the analytics relay', () => {
    const lines = robots.split('\n').map((line) => line.trim());
    expect(lines).toEqual(
      expect.arrayContaining(['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /relay/']),
    );
  });

  it('points at the sitemap on the site', () => {
    // sitemap.xml itself is in public/: it's imported above.
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });
});

describe('sitemap.xml', () => {
  it('lists Home and How to play', () => {
    expect(sitemapPaths()).toEqual(['/', '/how-to-play']);
  });
});

describe('index.html', () => {
  it('names the game in the title and description', () => {
    expect(doc.title).toMatch(/^Cranny – .*puzzle game/);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(
      /Cranny is a free block puzzle game/,
    );
  });

  it('points the canonical link and og:url at Home', () => {
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${SITE_ORIGIN}/`,
    );
    expect(property('og:url')).toBe(`${SITE_ORIGIN}/`);
  });

  it('has an og:image in public/ at the size it claims', () => {
    const image = new URL(property('og:image')!);
    expect(image.origin).toBe(SITE_ORIGIN);
    expect(pngSize(PUBLIC[image.pathname]!)).toEqual({
      width: Number(property('og:image:width')),
      height: Number(property('og:image:height')),
    });
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image',
    );
  });

  it('describes the game as structured data, with the same address and image', () => {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0]!.textContent) as Record<string, unknown>;
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: 'Cranny',
      url: `${SITE_ORIGIN}/`,
      image: property('og:image'),
    });
  });

  it('has a static intro that links to pages in the sitemap', () => {
    const intro = doc.querySelector('#root main.prerender');
    expect(intro?.querySelector('h1')?.textContent).toBe('Cranny');
    const links = [...intro!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/play', '/how-to-play']);
    expect(sitemapPaths()).toContain('/how-to-play');
  });
});
