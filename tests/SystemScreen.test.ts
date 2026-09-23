// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as downloads from '../src/app/AssetDownloads';
import { initializeLanguage } from '../src/i18n/language';
import { createSystemScreen, observeSystemScreenLoading, updateSystemScreenProgress } from '../src/ui/SystemScreen';

const observers: (() => void)[] = [];
afterEach(() => {
  observers.splice(0).forEach(dispose => dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  initializeLanguage(null);
});

function observeScreen() {
  let publish!: (value: downloads.DownloadProgress) => void;
  const stop = vi.fn();
  vi.spyOn(downloads, 'observeAssetDownloads').mockImplementation(callback => {
    publish = callback;
    callback({ loaded: 0, total: 0 });
    return stop;
  });
  const screen = createSystemScreen({ kind: 'loading' });
  const dispose = observeSystemScreenLoading(screen);
  observers.push(dispose);
  return { screen, progress: screen.querySelector('progress')!, publish, stop, dispose };
}

describe('loading screen state', () => {
  // Importance: 95/100. Timers must stop with their screen and never overwrite later stages.
  it('shows elapsed shader time, resets each stage, and stops on disposal', () => {
    vi.useFakeTimers();
    const { screen, progress, publish, dispose } = observeScreen();
    updateSystemScreenProgress(screen, { stage: 'preparingSceneShaders' });
    vi.advanceTimersByTime(8000);
    expect(screen.textContent).toBe('Preparing scene shaders · 8 s');
    expect(progress.position).toBe(-1);
    expect(progress.getAttribute('aria-valuetext')).toBe(screen.textContent);
    publish({ loaded: 100, total: 100 });
    expect(screen.textContent).toBe('Preparing scene shaders · 8 s');
    updateSystemScreenProgress(screen, { stage: 'preparingObjectShaders' });
    expect(screen.textContent).toBe('Preparing object shaders');
    vi.advanceTimersByTime(2000);
    expect(screen.textContent).toBe('Preparing object shaders · 2 s');
    updateSystemScreenProgress(screen, { stage: 'preparingEffects' });
    vi.advanceTimersByTime(1000);
    expect(screen.textContent).toBe('Preparing visual effects · 1 s');
    updateSystemScreenProgress(screen, { stage: 'sceneReady' });
    vi.advanceTimersByTime(2000);
    expect(screen.textContent).toBe('Scene ready');
    expect(progress.position).toBe(1);
    updateSystemScreenProgress(screen, { stage: 'preparingSceneShaders' });
    dispose();
    vi.advanceTimersByTime(5000);
    expect(screen.textContent).toBe('Preparing scene shaders');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses downloaded bytes for both the bar and its label', () => {
    const { screen, progress, publish, dispose, stop } = observeScreen();
    publish({ loaded: 12_300_000, total: 24_600_000 });
    expect(progress.position).toBe(0.5);
    expect(screen.textContent).toBe('Loading assets · 12.3 / 24.6 MB');
    expect(progress.getAttribute('aria-valuetext')).toBe(screen.textContent);
    // Rounded numbers must not claim completion while bytes remain.
    publish({ loaded: 64_499_999, total: 64_500_000 });
    expect(progress.position).toBeLessThan(1);
    expect(screen.textContent).not.toContain('64.5 / 64.5 MB');
    dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('shows activity for unknown totals and preparation, including cached assets', () => {
    const { screen, progress, publish } = observeScreen();
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Loading assets');
    publish({ loaded: 12_300_000, total: null });
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Loading assets · Downloaded 12.3 MB');
    publish({ loaded: 12_300_000, total: 12_300_000 });
    expect(progress.position).toBe(-1);
    expect(screen.textContent).toBe('Loading assets');
    expect(progress.getAttribute('aria-valuetext')).toBe('Loading assets');
    // A later download must restore measured progress.
    publish({ loaded: 12_300_000, total: 24_600_000 });
    expect(progress.position).toBe(0.5);
  });

  // Importance: 95/100. Download completion must not hide unfinished scene work.
  it('shows preparation counts and ignores downloads after the asset stage', () => {
    const { screen, progress, publish } = observeScreen();
    updateSystemScreenProgress(screen, { stage: 'preparingTextures', completed: 24, total: 80 });
    expect(screen.textContent).toBe('Preparing textures: 24 / 80');
    expect(progress.position).toBe(0.3);
    publish({ loaded: 100, total: 100 });
    expect(screen.textContent).toBe('Preparing textures: 24 / 80');
    updateSystemScreenProgress(screen, { stage: 'preparingTextures', completed: 80, total: 80 });
    expect(progress.position).toBe(-1);
    updateSystemScreenProgress(screen, { stage: 'preparingSceneShaders' });
    expect(progress.position).toBe(-1);
    expect(progress.getAttribute('aria-valuetext')).toBe('Preparing scene shaders');
    updateSystemScreenProgress(screen, { stage: 'sceneReady' });
    expect(progress.position).toBe(1);
  });
});
