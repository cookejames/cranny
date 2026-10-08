import { useEffect } from 'react';

/**
 * The site's address, as index.html's canonical link, og:url, robots.txt and sitemap.xml give it
 * (specs/2026-10-08-seo/SPEC.md §3). `seo.test.ts` checks they all agree.
 */
export const SITE_ORIGIN = 'https://cranny.cooke.ing';

/**
 * Gives the current page its own tab title and canonical URL while it's mounted, then puts back
 * what was there. Pages that don't call it keep index.html's, which point at Home: grid and room
 * links count as Home for search engines.
 *
 * @param title - The whole tab title.
 * @param path - The page's path from the site root, such as `/how-to-play`.
 */
export function usePageMeta({ title, path }: { title: string; path: string }): void {
  useEffect(() => {
    const canonical = document.head.querySelector('link[rel="canonical"]');
    const ogUrl = document.head.querySelector('meta[property="og:url"]');
    const previous = {
      title: document.title,
      canonical: canonical?.getAttribute('href'),
      ogUrl: ogUrl?.getAttribute('content'),
    };
    document.title = title;
    canonical?.setAttribute('href', SITE_ORIGIN + path);
    ogUrl?.setAttribute('content', SITE_ORIGIN + path);
    return () => {
      document.title = previous.title;
      if (previous.canonical != null) canonical?.setAttribute('href', previous.canonical);
      if (previous.ogUrl != null) ogUrl?.setAttribute('content', previous.ogUrl);
    };
  }, [title, path]);
}
