// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createSystemScreen, observeSystemScreenDownloads, updateSystemScreenProgress } from '../src/ui/SystemScreen';
import { loadAssetBytes } from '../src/app/AssetDownloads';
import { setLanguage } from '../src/i18n/language';

afterEach(() => setLanguage('en'));

describe('loading byte label', () => {
  it('shows decimal MB and preserves byte text when preparation advances', async () => {
    const screen = createSystemScreen({ kind: 'loading' });
    const stop = observeSystemScreenDownloads(screen);
    try {
      await loadAssetBytes('screen.glb', async () => new Response(new Uint8Array(1_250_000)));
      updateSystemScreenProgress(screen, 3, 4);
      expect(screen.querySelector('.system-loading-bytes')?.textContent).toBe('1.3 / 1.3 MB');
      expect(screen.querySelector('progress')?.getAttribute('aria-valuetext')).toBe('75%, 1.3 / 1.3 MB');
      expect(screen.querySelector('progress')?.position).toBe(0.75);
    } finally { stop(); }
  });

  it('uses the selected language for numbers', async () => {
    setLanguage('pl');
    const screen = createSystemScreen({ kind: 'loading' });
    const stop = observeSystemScreenDownloads(screen);
    try {
      await loadAssetBytes('polish.glb', async () => new Response(new Uint8Array(1_500_000)));
      expect(screen.querySelector('.system-loading-bytes')?.textContent).toBe('1,5 / 1,5 MB');
    } finally { stop(); }
  });
});
