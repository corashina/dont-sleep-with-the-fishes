// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
import { SurvivalUI } from '../src/ui/SurvivalUI';

beforeEach(() => initializeLanguage(null));
afterEach(() => { initializeLanguage(null); document.body.replaceChildren(); });

describe('survival announcement language', () => {
  it('updates the current announcement once per language change without replay during rendering', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const live = mount.querySelector<HTMLElement>('[data-survival-announcer]')!;
    const snapshot = new SurvivalSession([], { seed: 7, initialEventId: 'drifting-supplies' }).snapshot();
    const english = 'Safe event. Useful supplies drift within reach of the boat.';
    const publications: string[] = [];
    const observer = new MutationObserver(() => publications.push(live.textContent ?? ''));
    try {
      ui.render(snapshot, () => null);
      await ui.showEventReveal(survivalEventById('drifting-supplies')!);
      expect(live.textContent).toBe(english);
      ui.setPaused(true);
      observer.observe(live, { childList: true, subtree: true, characterData: true });

      setLanguage('pl');
      await Promise.resolve();
      expect(live.textContent).toBe('Bezpieczne zdarzenie. Przydatne zapasy dryfują w zasięgu łodzi.');
      expect(publications).toEqual([live.textContent]);
      expect(live.getAttribute('aria-live')).toBe('polite');
      expect(live.classList.contains('survival-announcer')).toBe(true);

      ui.render(snapshot, () => null);
      ui.render(snapshot, () => null);
      setLanguage('pl');
      await Promise.resolve();
      expect(publications).toHaveLength(1);

      setLanguage('en');
      await Promise.resolve();
      expect(live.textContent).toBe(english);
      expect(publications).toHaveLength(2);

      ui.clearEventPresentation();
      expect(live.textContent).toBe('');
      await Promise.resolve();
      publications.length = 0;
      setLanguage('pl');
      await Promise.resolve();
      expect(publications).toEqual([]);
      ui.dispose();
      setLanguage('en');
      await Promise.resolve();
      expect(publications).toEqual([]);
    } finally {
      observer.disconnect();
      ui.dispose();
    }
  });

  it('resolves a pending announcement in the current language', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    try {
      const reveal = ui.showEventReveal(survivalEventById('drifting-supplies')!);
      setLanguage('pl');
      await reveal;
      expect(mount.querySelector('[data-survival-announcer]')!.textContent)
        .toBe('Bezpieczne zdarzenie. Przydatne zapasy dryfują w zasięgu łodzi.');
    } finally {
      ui.dispose();
    }
  });
});
