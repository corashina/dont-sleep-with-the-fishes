// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as downloads from '../src/app/AssetDownloads';
import { initializeLanguage } from '../src/i18n/language';
import { createSystemScreen, observeSystemScreenDownloads } from '../src/ui/SystemScreen';

afterEach(() => { vi.restoreAllMocks(); initializeLanguage(null); });

function observeScreen() {
  let publish!: (value: downloads.DownloadProgress) => void;
  const stop = vi.fn();
  vi.spyOn(downloads, 'observeAssetDownloads').mockImplementation(callback => {
    publish = callback;
    callback({ loaded: 0, total: 0 });
    return stop;
  });
  const screen = createSystemScreen({ kind: 'loading' });
  const dispose = observeSystemScreenDownloads(screen);
  return { screen, progress: screen.querySelector('progress')!, publish, stop, dispose };
}

describe('loading screen state', () => {
  it('uses downloaded bytes for both the bar and its label', () => {
    const { screen, progress, publish, dispose, stop } = observeScreen();
    publish({ loaded: 12_300_000, total: 24_600_000 });
    expect(progress.position).toBe(0.5);
    expect(screen.textContent).toBe('12.3 / 24.6 MB');
    expect(progress.getAttribute('aria-valuetext')).toBe(screen.textContent);
    // Rounded numbers must not claim completion while bytes remain.
    publish({ loaded: 64_499_999, total: 64_500_000 });
    expect(progress.position).toBeLessThan(1);
    expect(screen.textContent).not.toBe('64.5 / 64.5 MB');
    dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('shows activity for unknown totals and preparation, including cached assets', () => {
    const { screen, progress, publish } = observeScreen();
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Preparing scene');
    publish({ loaded: 12_300_000, total: null });
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Downloaded 12.3 MB');
    publish({ loaded: 12_300_000, total: 12_300_000 });
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Preparing scene');
    expect(progress.getAttribute('aria-valuetext')).toBe('Preparing scene');
    // A later download must restore measured progress.
    publish({ loaded: 12_300_000, total: 24_600_000 });
    expect(progress.position).toBe(0.5);
  });
});
