import { formatTime } from '../game/formatTime.ts';

/** How a share attempt ended; the caller shows a toast for `copied` and `failed`. */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** The message shared with a grid link (specs/2026-09-25-single-player/SPEC.md §5). */
export const shareText = (ms: number) =>
  `I solved this Cranny grid in ${formatTime(ms, { tenths: true })} — can you beat it?`;

/** The message shared with a room link (specs/2026-09-25-multiplayer/SPEC.md §9). */
export const roomShareText = (room: string) => `Join my Cranny room: ${room}`;

/** Toast text for a share result that needs one. */
export const SHARE_TOASTS: Partial<Record<ShareResult, string>> = {
  copied: 'Link copied',
  failed: 'Couldn’t copy the link',
};

/**
 * Copies text the old way, by selecting it in a hidden textarea: the fallback where the
 * Clipboard API is missing. Browsers leave both `navigator.share` and `navigator.clipboard` out
 * of pages that aren't a secure context (e.g. the dev server opened on a phone over plain HTTP),
 * but still allow this. Must run during the click, while the page has user activation.
 *
 * @returns Whether the browser reported a successful copy.
 */
function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  // Off-screen but still selectable; 16 px stops iOS zooming in on focus.
  area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px';
  document.body.append(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    // Deprecated, but the only way to copy without the Clipboard API.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Shares a link to a grid or a room (specs/2026-09-25-single-player/SPEC.md §5): the system share sheet where there is one, otherwise the text and
 * link are copied to the clipboard (with the Clipboard API, or by selection where that's
 * missing). Never throws.
 *
 * @param url - The absolute link, e.g. `https://cranny.cooke.ing/g/1XDWT5H`.
 */
export async function shareLink(text: string, url: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Cranny', text, url });
      return 'shared';
    } catch (error) {
      // The player closed the share sheet: nothing to report.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Otherwise (not allowed, or no share targets) fall back to copying.
    }
  }
  const message = `${text} ${url}`;
  try {
    await navigator.clipboard.writeText(message);
    return 'copied';
  } catch {
    // No Clipboard API (not a secure context), or permission refused.
    return copyBySelection(message) ? 'copied' : 'failed';
  }
}
