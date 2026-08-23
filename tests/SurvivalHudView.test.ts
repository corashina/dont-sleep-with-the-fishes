// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { DayActionId, SurvivalSnapshot } from '../src/survival/survivalTypes';
import { SurvivalHudView } from '../src/ui/SurvivalHudView';
import { sequenceRandom } from './helpers/random';

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    ...new SurvivalSession([], {
      seed: 17,
      random: sequenceRandom([0.5]),
    }).snapshot(),
    ...overrides,
  };
}

function mountView(): { readonly mount: HTMLElement; readonly view: SurvivalHudView } {
  const mount = document.createElement('main');
  document.body.append(mount);
  const view = new SurvivalHudView();
  mount.append(...view.roots);
  return { mount, view };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SurvivalHudView', () => {
  it('owns the exact top-control and meter roots without a wrapper', () => {
    const { mount, view } = mountView();

    expect([...mount.children]).toEqual([view.topControls, view.meters]);
    expect(view.topControls.className).toBe('survival-top');
    expect(view.meters.className).toBe('survival-meters');
    expect([...view.meters.children].map((meter) => meter.getAttribute('data-meter')))
      .toEqual(['health', 'hunger', 'energy', 'hull']);
    expect(view.topControls.querySelector('[data-journal-open]')?.getAttribute('aria-label'))
      .toBe('Open journal');
    expect(view.topControls.querySelector('[data-camera-turn]')?.getAttribute('aria-label'))
      .toBe('Look behind at the chest');
  });

  it('renders meter values, artwork, fill boundaries, and danger thresholds', () => {
    const { mount, view } = mountView();
    const reasons = new Map<DayActionId, string | null>();

    view.render(snapshot({ day: 4, health: 20, hunger: 70, energy: 1, hull: 21 }), reasons);

    expect(mount.querySelector('[data-day]')?.textContent).toBe('DAY 4');
    const expected = { health: '20', hunger: '30', energy: '1', hull: '21' };
    Object.entries(expected).forEach(([id, value]) => {
      const meter = mount.querySelector<HTMLElement>(`[data-meter="${id}"]`)!;
      expect(meter.getAttribute('aria-valuenow')).toBe(value);
      expect(meter.querySelectorAll(`[data-ui-artwork="${id}"]`)).toHaveLength(2);
      expect(meter.style.getPropertyValue('--meter-fill-height')).not.toBe('');
    });
    expect(mount.querySelector('[data-meter="health"]')?.classList).toContain('is-danger');
    expect(mount.querySelector('[data-meter="hunger"]')?.classList).toContain('is-danger');
    expect(mount.querySelector('[data-meter="energy"]')?.classList).toContain('is-danger');
    expect(mount.querySelector('[data-meter="hull"]')?.classList).not.toContain('is-danger');
  });

  it('does not rewrite unchanged meter attributes or styles', async () => {
    const { mount, view } = mountView();
    const state = snapshot({ health: 47 });
    const reasons = new Map<DayActionId, string | null>();
    view.render(state, reasons);
    const meter = mount.querySelector<HTMLElement>('[data-meter="health"]')!;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(meter, { attributes: true, childList: true, subtree: true });

    view.render(state, reasons);
    await Promise.resolve();

    expect(mutations).toEqual([]);
    observer.disconnect();
  });

  it('owns unread and camera controls with local busy, pause, and modal state', () => {
    const { mount, view } = mountView();
    const journal = vi.fn();
    const camera = vi.fn();
    view.onJournal = journal;
    view.onCameraTurn = camera;
    view.setJournalUnread(true);
    view.setCameraTurnState(true, true);

    const journalButton = mount.querySelector<HTMLButtonElement>('[data-journal-open]')!;
    const cameraButton = mount.querySelector<HTMLButtonElement>('[data-camera-turn]')!;
    expect(journalButton.dataset.unread).toBe('true');
    expect(journalButton.getAttribute('aria-label')).toBe('Open journal, new entry available');
    expect(cameraButton.getAttribute('aria-pressed')).toBe('true');
    expect(cameraButton.querySelector('[data-camera-turn-tooltip]')?.textContent)
      .toBe('LOOK FORWARD');

    journalButton.click();
    cameraButton.click();
    expect(journal).toHaveBeenCalledOnce();
    expect(camera).toHaveBeenCalledOnce();

    view.setBusy(true);
    expect(journalButton.disabled).toBe(true);
    cameraButton.click();
    view.setBusy(false);
    view.setPaused(true);
    cameraButton.click();
    view.setPaused(false);
    view.setModalOpen(true);
    journalButton.click();
    cameraButton.click();
    expect(journal).toHaveBeenCalledOnce();
    expect(camera).toHaveBeenCalledOnce();
  });

  it('removes its listeners once during independent disposal', () => {
    const { mount, view } = mountView();
    const journal = vi.fn();
    const camera = vi.fn();
    view.onJournal = journal;
    view.onCameraTurn = camera;
    view.setCameraTurnState(true, false);

    view.dispose();
    view.dispose();
    mount.querySelector<HTMLButtonElement>('[data-journal-open]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-camera-turn]')!.click();

    expect(journal).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('preserves a %s cleanup error and continues all cleanup', (_label, firstError) => {
    const { mount, view } = mountView();
    const journal = vi.fn();
    const camera = vi.fn();
    view.onJournal = journal;
    view.onCameraTurn = camera;
    view.setCameraTurnState(true, false);
    const remove = vi.spyOn(view.topControls, 'removeEventListener');
    let storedJournal = view.onJournal;
    let storedCamera = view.onCameraTurn;
    Object.defineProperty(view, 'onJournal', {
      configurable: true,
      get: () => storedJournal,
      set: (callback: typeof storedJournal) => {
        storedJournal = callback;
        throw firstError;
      },
    });
    Object.defineProperty(view, 'onCameraTurn', {
      configurable: true,
      get: () => storedCamera,
      set: (callback: typeof storedCamera) => {
        storedCamera = callback;
        throw new Error('later callback cleanup failed');
      },
    });
    const notThrown = Symbol('not thrown');
    let thrown: unknown = notThrown;

    try {
      view.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstError);
    expect(remove).toHaveBeenCalledOnce();
    expect(() => view.dispose()).not.toThrow();
    mount.querySelector<HTMLButtonElement>('[data-journal-open]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-camera-turn]')!.click();
    expect(journal).not.toHaveBeenCalled();
    expect(camera).not.toHaveBeenCalled();
  });
});
