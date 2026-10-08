import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SITE_ORIGIN, usePageMeta } from './pageMeta.ts';

/** A page that sets its own title and address. */
function Page({ path }: { path: string }) {
  usePageMeta({ title: 'A page', path });
  return null;
}

describe('usePageMeta', () => {
  // What index.html provides on the real page.
  beforeEach(() => {
    document.head.innerHTML = `<link rel="canonical" href="${SITE_ORIGIN}/" /><meta property="og:url" content="${SITE_ORIGIN}/" />`;
    document.title = 'Cranny';
  });
  afterEach(() => {
    document.head.innerHTML = '';
  });

  const canonical = () => document.head.querySelector('link')?.getAttribute('href');
  const ogUrl = () => document.head.querySelector('meta')?.getAttribute('content');

  it('sets the title, canonical link and og:url while mounted', () => {
    const { rerender, unmount } = render(<Page path="/how-to-play" />);
    expect(document.title).toBe('A page');
    expect(canonical()).toBe(`${SITE_ORIGIN}/how-to-play`);
    expect(ogUrl()).toBe(`${SITE_ORIGIN}/how-to-play`);

    rerender(<Page path="/elsewhere" />);
    expect(canonical()).toBe(`${SITE_ORIGIN}/elsewhere`);

    unmount();
    expect(document.title).toBe('Cranny');
    expect(canonical()).toBe(`${SITE_ORIGIN}/`);
    expect(ogUrl()).toBe(`${SITE_ORIGIN}/`);
  });

  it('sets just the title when the head has no canonical link', () => {
    document.head.innerHTML = '';
    render(<Page path="/how-to-play" />);
    expect(document.title).toBe('A page');
  });
});
