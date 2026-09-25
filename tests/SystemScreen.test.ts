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
});
