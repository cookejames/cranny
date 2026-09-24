import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareGrid, shareText } from './share.ts';

const URL = 'https://tessel.cooke.ing/g/1XDWT5H';

/** Stubs `navigator.share` and `navigator.clipboard.writeText`; pass undefined to leave one out. */
function stubNavigator(
  share?: (data: ShareData) => Promise<void>,
  write?: (text: string) => Promise<void>,
) {
  vi.stubGlobal('navigator', {
    ...(share && { share: vi.fn(share) }),
    clipboard: { writeText: vi.fn(write ?? (() => Promise.reject(new Error('denied')))) },
  });
  return navigator as unknown as {
    share: ReturnType<typeof vi.fn>;
    clipboard: { writeText: ReturnType<typeof vi.fn> };
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('shareGrid', () => {
  it('writes the message from the spec', () => {
    expect(shareText(68_400)).toBe('I solved this Tessel grid in 1:08.4 — can you beat it?');
  });

  it('uses the share sheet where there is one', async () => {
    const nav = stubNavigator(() => Promise.resolve());
    await expect(shareGrid('Solved!', URL)).resolves.toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ title: 'Tessel', text: 'Solved!', url: URL });
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('does nothing more when the player closes the share sheet', async () => {
    const nav = stubNavigator(() => Promise.reject(new DOMException('closed', 'AbortError')));
    await expect(shareGrid('Solved!', URL)).resolves.toBe('cancelled');
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('copies the text and link when sharing is unavailable or refused', async () => {
    const nav = stubNavigator(undefined, () => Promise.resolve());
    await expect(shareGrid('Solved!', URL)).resolves.toBe('copied');
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(`Solved! ${URL}`);

    stubNavigator(
      () => Promise.reject(new DOMException('no', 'NotAllowedError')),
      () => Promise.resolve(),
    );
    await expect(shareGrid('Solved!', URL)).resolves.toBe('copied');
  });

  it('copies by selection where there is no Clipboard API (e.g. plain HTTP)', async () => {
    vi.stubGlobal('navigator', {});
    let copied = '';
    const execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')!.value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    await expect(shareGrid('Solved!', URL)).resolves.toBe('copied');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copied).toBe(`Solved! ${URL}`);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when no way of copying works', async () => {
    stubNavigator();
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    await expect(shareGrid('Solved!', URL)).resolves.toBe('failed');
  });
});
