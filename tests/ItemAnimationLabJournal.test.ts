// @vitest-environment jsdom
import { afterEach,describe,expect,it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

afterEach(() => setLanguage('en'));

function fixture(lab: boolean) {
  const mount = document.createElement('main');
  document.body.append(mount);
  const session = new SurvivalSession([], { seed: 19 });
  const ui = new SurvivalUI(mount);
  const phase = SurvivalPhase.forTest({ session, ui, world: {} }, lab ? 'item-animation-lab' : undefined);
  const button = (selector: string) => mount.querySelector<HTMLButtonElement>(selector)!;
  phase.start();
  return { mount, session, phase, button, dispose: () => { phase.dispose(); mount.remove(); } };
}

describe('Item Animation Lab journal examples', () => {
  it.each(['en', 'pl', 'es-AR'] as const)('opens sample days and item changes through the journal button in %s', (language) => {
    setLanguage(language);
    const rig = fixture(true);
    const before = rig.session.snapshot();
    try {
      expect(rig.mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(false);
      rig.button('[data-journal-open]').click();
      const journal = rig.mount.querySelector<HTMLElement>('[data-journal]')!;
      expect(journal.getAttribute('aria-hidden')).toBe('false');
      const observed: string[][] = [];
      for (let page = 5; page >= 1; page -= 1) {
        expect(journal.querySelector('[data-journal-title]')!.textContent).toContain(String(page));
        for (const section of ['day', 'night']) {
          const text = journal.querySelector(`[data-journal-${section}]`)!.textContent!;
          expect(text.length).toBeGreaterThan(15);
          expect(text).not.toMatch(/\d|undefined|health\s*[+-]/);
        }
        observed.push([...journal.querySelectorAll<HTMLElement>('[data-item-change]')]
          .map((item) => `${item.dataset.itemChange}:${item.dataset.itemType}`));
        rig.button('[data-journal-previous]').click();
      }
      expect(observed).toEqual([
        ['consume:cannedFood', 'gain:flareGun', 'consume:flareGun'],
        ['repair:knife', 'consume:ductTape', 'lose:fishingNet', 'gain:umbrella'],
        ['consume:medicalKit', 'gain:cannedFood', 'consume:baitTin', 'break:knife'],
        ['gain:medicalKit', 'lose:map'],
        [],
      ]);
      expect(rig.button('[data-journal-previous]').disabled).toBe(true);
      expect(journal.querySelector<HTMLElement>('[data-journal-day-items]')!.hidden).toBe(true);
      expect(journal.querySelector<HTMLElement>('[data-journal-night-items]')!.hidden).toBe(true);
      rig.button('[data-journal-next]').click();
      expect(journal.querySelector('[data-journal-day-items] [data-item-change="gain"]')).not.toBeNull();
      expect(journal.querySelector('[data-journal-night-items] [data-item-change="lose"]')).not.toBeNull();
      rig.button('[data-journal-close]').click();
      rig.phase.update(0, 0);
      expect(rig.mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(true);
      expect(rig.session.snapshot()).toBe(before);
      expect(rig.phase.getSurvivalCheckpoint()).toBeNull();
    } finally {
      rig.dispose();
    }
  });
});
