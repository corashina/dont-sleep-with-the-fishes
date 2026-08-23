// @vitest-environment jsdom
// Importance: 9/10. Protects cover timing, reward markup, and promise settlement.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalCoverView } from '../src/ui/SurvivalCoverView';

const activeViews: SurvivalCoverView[] = [];

afterEach(() => {
  vi.useRealTimers();
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function mountView(): SurvivalCoverView {
  const view = new SurvivalCoverView();
  document.body.append(...view.roots);
  activeViews.push(view);
  return view;
}

describe('SurvivalCoverView', () => {
  it('owns the exact three separate cover roots and result markup', () => {
    const view = mountView();

    expect(view.roots.map((root) => root.className)).toEqual([
      'sleep-cover',
      'bad-sleep-cue',
      'dive-result',
    ]);
    expect(view.sleepCover.dataset.profile).toBe('solid');
    expect(view.badSleepCue.querySelectorAll('.bad-sleep-cue__eye')).toHaveLength(2);
    expect(view.resultRoot.getAttribute('role')).toBe('dialog');
    expect(view.resultRoot.getAttribute('aria-modal')).toBe('true');
    expect(view.resultClose.textContent).toBe('×');
  });

  it('keeps the solid, midnight-tour, and dive transition timings', async () => {
    vi.useFakeTimers();
    const view = mountView();

    const solid = view.setCovered(true);
    await vi.advanceTimersByTimeAsync(2_499);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await solid;

    await view.setProfile('midnight-tour');
    const tour = view.setCovered(false);
    await vi.advanceTimersByTimeAsync(2_500);
    await tour;

    await view.setProfile('dive');
    const dive = view.setCovered(true);
    await vi.advanceTimersByTimeAsync(749);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await dive;
  });

  it('renders the shared reward paper and emits close without owning focus', async () => {
    const view = mountView();
    const show = vi.fn();
    const hide = vi.fn();
    const close = vi.fn(() => view.confirmRewardResult());
    view.onResultShow = show;
    view.onResultHide = hide;
    view.onResultClose = close;

    const confirmation = view.showRewardResult({
      title: 'CHEST REWARD',
      reward: { kind: 'resource', id: 'food', quantity: 2 },
      lines: [],
    });

    expect(show).toHaveBeenCalledOnce();
    expect(view.resultRoot.classList).toContain('is-chest-reward');
    expect(view.resultRoot.querySelector('[data-dive-result-title]')?.textContent)
      .toBe('CHEST REWARD');
    expect(view.resultRoot.querySelector('[data-dive-result-reward-name]')?.textContent)
      .toBe('FOOD');
    expect(view.resultRoot.querySelector('[data-dive-result-reward-quantity]')?.textContent)
      .toBe('×2');
    expect(view.resultClose.getAttribute('aria-label')).toBe('Close chest reward');
    view.resultClose.click();
    await confirmation;
    expect(close).toHaveBeenCalledOnce();
    expect(hide).toHaveBeenCalledOnce();
    expect(view.resultRoot.classList).not.toContain('is-chest-reward');
    expect(view.resultRoot.querySelector('[data-dive-result-title]')?.textContent).toBe('');
  });

  it('settles a stale result without clearing its replacement', async () => {
    const view = mountView();
    view.onResultShow = () => undefined;
    view.onResultHide = () => undefined;
    const first = view.showRewardResult({
      title: 'DIVE RESULT', reward: null, lines: ['FOOD +1'],
    });
    const internals = view as unknown as {
      readonly pendingRewardConfirmation: { finish(): void } | null;
    };
    const staleFinish = internals.pendingRewardConfirmation!.finish;
    const second = view.showRewardResult({
      title: 'DIVE RESULT', reward: null, lines: ['NOTHING FOUND'],
    });
    await first;

    staleFinish();
    expect(view.resultRoot.textContent).toContain('NOTHING FOUND');
    view.confirmRewardResult();
    await second;
  });

  it('tracks every hold and settles visibility work without blocking later use', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.onResultShow = () => undefined;
    view.onResultHide = () => undefined;
    const cover = view.setCovered(true);
    const dive = view.holdDiveCovered();
    const reward = view.showRewardResult({
      title: 'DIVE RESULT', reward: null, lines: ['NOTHING FOUND'],
    });
    const frames = view.settleCoveredScene();
    const sleep = view.holdSleep();
    const outcome = view.holdEventOutcome();

    view.settleForVisibilityChange();
    await Promise.all([cover, dive, reward, frames, sleep, outcome]);
    expect(vi.getTimerCount()).toBe(0);

    const nextSleep = view.holdSleep();
    await vi.advanceTimersByTimeAsync(450);
    await nextSleep;
    const nextOutcome = view.holdEventOutcome();
    await vi.advanceTimersByTimeAsync(2_000);
    await nextOutcome;
  });

  it('settles replaced holds and completes two browser frames', async () => {
    vi.useFakeTimers();
    const view = mountView();
    const first = view.holdSleep();
    const second = view.holdSleep();
    await first;
    await vi.advanceTimersByTimeAsync(450);
    await second;

    let settled = false;
    const frames = view.settleCoveredScene().then(() => { settled = true; });
    await vi.advanceTimersToNextFrame();
    expect(settled).toBe(false);
    await vi.advanceTimersToNextFrame();
    await frames;
    expect(settled).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('resolves pending work before preserving a %s cleanup error', async (_label, firstError) => {
    const view = mountView();
    view.onResultShow = () => undefined;
    view.onResultHide = () => { throw firstError; };
    const confirmation = view.showRewardResult({
      title: 'DIVE RESULT',
      reward: { kind: 'resource', id: 'food', quantity: 1 },
      lines: ['FOOD +1'],
    });
    const internals = view as unknown as {
      readonly resultLines: HTMLElement;
    };
    const later = vi.spyOn(internals.resultLines, 'replaceChildren')
      .mockImplementation(() => { throw new Error('later cleanup error'); });
    const notThrown = Symbol('not thrown');
    let thrown: unknown = notThrown;

    try {
      view.settleForVisibilityChange();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstError);
    await confirmation;
    expect(later).toHaveBeenCalledOnce();
    expect(() => view.settleForVisibilityChange()).not.toThrow();
  });

  it('removes its close listener once and settles pending work during disposal', async () => {
    vi.useFakeTimers();
    const view = mountView();
    const close = vi.fn();
    view.onResultClose = close;
    const cover = view.setCovered(true);
    const sleep = view.holdSleep();
    const remove = vi.spyOn(view.resultClose, 'removeEventListener');

    view.dispose();
    await Promise.all([cover, sleep]);
    view.resultClose.click();
    expect(close).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
    expect(() => view.dispose()).not.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('preserves a %s disposal error and resets callbacks', (_label, firstError) => {
    const view = mountView();
    const show = vi.fn();
    view.onResultShow = show;
    const remove = vi.spyOn(view.resultClose, 'removeEventListener').mockImplementation(() => {
      throw firstError;
    });
    let storedShow = view.onResultShow;
    Object.defineProperty(view, 'onResultShow', {
      configurable: true,
      get: () => storedShow,
      set: (value: typeof storedShow) => {
        storedShow = value;
        throw new Error('later callback cleanup error');
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
    view.onResultShow();
    expect(show).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
    expect(() => view.dispose()).not.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });
});
