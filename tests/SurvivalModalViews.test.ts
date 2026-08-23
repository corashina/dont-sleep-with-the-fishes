// @vitest-environment jsdom
// Importance: 10/10. Protects repair, pause, ending, input, and cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { SurvivalItemState } from '../src/survival/survivalTypes';
import { SurvivalModalViews } from '../src/ui/SurvivalModalViews';

const activeViews: SurvivalModalViews[] = [];

afterEach(() => {
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function createView(): SurvivalModalViews {
  const view = new SurvivalModalViews();
  document.body.append(view.repairRoot, view.pauseRoot, view.endingRoot);
  activeViews.push(view);
  return view;
}

function item(instanceId: ItemInstanceId, type: SurvivalItemState['type']): SurvivalItemState {
  return { instanceId, type, condition: 'broken' };
}

function activate(root: HTMLElement): void {
  root.classList.add('is-visible');
  root.removeAttribute('inert');
  root.setAttribute('aria-hidden', 'false');
}

describe('SurvivalModalViews', () => {
  it('owns the exact three named roots without a wrapper or generic roots array', () => {
    const view = createView();

    expect(view).not.toHaveProperty('root');
    expect(view).not.toHaveProperty('roots');
    expect([view.repairRoot.className, view.pauseRoot.className, view.endingRoot.className])
      .toEqual([
        'routine-dialog routine-dialog--repair',
        'survival-overlay pause-overlay cinematic-overlay scuba-popup-overlay',
        'survival-overlay ending-overlay cinematic-overlay scuba-popup-overlay',
      ]);
    expect(view.repairRoot.getAttribute('aria-label')).toBe('Repair target');
    expect(view.pauseRoot.getAttribute('aria-label')).toBe('Survival paused');
    expect(view.endingRoot.getAttribute('aria-label')).toBe('Journey ended');
    expect(view.repairTitle.tabIndex).toBe(-1);
    expect(view.resumeButton.textContent?.trim()).toBe('RESUME');
    expect(view.endingTitle.getAttribute('role')).toBe('alert');
  });

  it('renders repair targets with exact labels and descriptions', () => {
    const view = createView();
    view.showRepairOptions([
      item('bucket-1', 'bucket'),
      item('compass-2', 'compass'),
    ]);
    const targets = [...view.repairRoot.querySelectorAll<HTMLButtonElement>(
      '[data-repair-target]',
    )];

    expect(targets.map((button) => button.dataset.repairTarget))
      .toEqual(['bucket-1', 'compass-2']);
    expect(targets.map((button) => button.textContent))
      .toEqual(['BUCKET — BROKEN', 'COMPASS — BROKEN']);
    expect(targets.map((button) => button.getAttribute('aria-description')))
      .toEqual([
        'Repair BUCKET with Duct Tape.',
        'Repair COMPASS with Duct Tape.',
      ]);
  });

  it('routes repair selection and cancel only while the root is usable', () => {
    const view = createView();
    const select = vi.fn();
    const cancel = vi.fn();
    view.onRepairTarget = select;
    view.onRepairCancel = cancel;
    view.showRepairOptions([item('bucket-1', 'bucket')]);
    const target = view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-target]')!;
    const cancelButton = view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-cancel]')!;

    target.click();
    cancelButton.click();
    expect(select).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    activate(view.repairRoot);
    target.click();
    cancelButton.click();
    expect(select).toHaveBeenCalledExactlyOnceWith('bucket-1');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('updates repair busy state without removing focusable targets', () => {
    const view = createView();
    view.showRepairOptions([item('bucket-1', 'bucket')]);
    const target = view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-target]')!;

    view.setRepairBusy(true);
    expect(target.disabled).toBe(true);
    view.showRepairOptions([item('compass-2', 'compass')]);
    expect(view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-target]')?.disabled)
      .toBe(true);
    view.setRepairBusy(false);
    expect(view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-target]')?.disabled)
      .toBe(false);
  });

  it('routes Resume only while the pause root is usable', () => {
    const view = createView();
    const resume = vi.fn();
    view.onResume = resume;

    view.resumeButton.click();
    expect(resume).not.toHaveBeenCalled();
    activate(view.pauseRoot);
    view.resumeButton.click();
    expect(resume).toHaveBeenCalledOnce();
    view.pauseRoot.hidden = true;
    view.resumeButton.click();
    expect(resume).toHaveBeenCalledOnce();
  });

  it.each([
    ['rescued', 'standard', 'Rescue found you.'],
    ['dead', 'standard', 'The sea outlasted you.'],
    ['sunk', 'standard', 'Boat is gone.'],
    ['rescued', 'kidnapped', 'Taken in the dark.'],
    ['dead', 'kidnapped', 'Taken in the dark.'],
    ['sunk', 'kidnapped', 'Taken in the dark.'],
  ] as const)('renders %s with %s ending copy', (state, reason, title) => {
    const view = createView();
    view.showEnding(state, reason);

    expect(view.endingRoot.dataset.ending).toBe(state);
    expect(view.endingTitle.textContent).toBe(title);
    expect(view.endingRoot.querySelector('[data-ending-body]')).toBeNull();
    expect(view.endingRoot.querySelector('[data-ending-stats]')).toBeNull();
  });

  it('fires Restart once per ending display and ignores inert clicks', () => {
    const view = createView();
    const restart = vi.fn();
    view.onRestart = restart;
    view.showEnding('sunk', 'standard');

    view.restartButton.click();
    expect(restart).not.toHaveBeenCalled();
    activate(view.endingRoot);
    view.restartButton.click();
    view.restartButton.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(view.restartButton.disabled).toBe(true);

    view.showEnding('rescued', 'standard');
    expect(view.restartButton.disabled).toBe(false);
    view.restartButton.click();
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('keeps Item Animation Lab out of the static modal view', () => {
    const view = createView();

    expect(view).not.toHaveProperty('showItemAnimationLab');
    expect(document.querySelector('[data-item-animation-lab]')).toBeNull();
    expect(document.querySelector('[data-event-caption]')).toBeNull();
  });

  it('removes all local root listeners and resets callbacks once', () => {
    const view = createView();
    const resume = vi.fn();
    const restart = vi.fn();
    const select = vi.fn();
    const cancel = vi.fn();
    view.onResume = resume;
    view.onRestart = restart;
    view.onRepairTarget = select;
    view.onRepairCancel = cancel;
    view.showRepairOptions([item('bucket-1', 'bucket')]);
    view.showEnding('sunk', 'standard');
    [view.repairRoot, view.pauseRoot, view.endingRoot].forEach(activate);
    const target = view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-target]')!;
    const cancelButton = view.repairRoot.querySelector<HTMLButtonElement>('[data-repair-cancel]')!;

    view.dispose();
    view.dispose();
    target.click();
    cancelButton.click();
    view.resumeButton.click();
    view.restartButton.click();
    expect(select).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['Error', new Error('repair listener cleanup failed')],
  ] as const)(
    'preserves a first %s listener failure and removes later root listeners',
    (_label, firstError) => {
      const view = createView();
      const repairRemove = vi.spyOn(view.repairRoot, 'removeEventListener')
        .mockImplementationOnce(() => { throw firstError; });
      const pauseRemove = vi.spyOn(view.pauseRoot, 'removeEventListener');
      const endingRemove = vi.spyOn(view.endingRoot, 'removeEventListener');
      let thrown: unknown = Symbol('not thrown');

      try {
        view.dispose();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBe(firstError);
      expect(repairRemove).toHaveBeenCalledWith('click', expect.any(Function));
      expect(pauseRemove).toHaveBeenCalledWith('click', expect.any(Function));
      expect(endingRemove).toHaveBeenCalledWith('click', expect.any(Function));
      expect(() => view.dispose()).not.toThrow();
    },
  );
});
