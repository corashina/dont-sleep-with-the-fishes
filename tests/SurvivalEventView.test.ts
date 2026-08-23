// @vitest-environment jsdom
// Importance: 9/10. Protects event markup, choices, feedback, and timed cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalEventView } from '../src/ui/SurvivalEventView';

const activeViews: SurvivalEventView[] = [];

afterEach(() => {
  vi.useRealTimers();
  activeViews.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
});

function mountView(): SurvivalEventView {
  const view = new SurvivalEventView();
  document.body.append(...view.roots);
  activeViews.push(view);
  return view;
}

const reveal = {
  id: 'ghosts',
  danger: 'dangerous' as const,
  revealText: 'Pale hands rise beside the boat.',
};

describe('SurvivalEventView', () => {
  it('owns three separate roots and preserves the hidden empty reveal copy', async () => {
    const view = mountView();
    const announce = vi.fn();
    view.onAnnouncement = announce;

    await view.showReveal(reveal);

    expect(view.roots.map((root) => root.className)).toEqual([
      'survival-feedback',
      'event-sleep-mask',
      'event-caption',
    ]);
    const title = view.caption.querySelector<HTMLElement>('[data-event-title]')!;
    const detail = view.caption.querySelector<HTMLElement>('[data-event-detail]')!;
    const risk = view.caption.querySelector<HTMLElement>('[data-event-risk]')!;
    expect(title.textContent).toBe('');
    expect(title.hidden).toBe(true);
    expect(detail.textContent).toBe(reveal.revealText);
    expect(detail.hidden).toBe(true);
    expect(risk.textContent).toBe('DANGEROUS');
    expect(risk.hidden).toBe(true);
    expect(view.caption.getAttribute('aria-hidden')).toBe('true');
    expect(announce).toHaveBeenCalledWith(
      'Dangerous event. Pale hands rise beside the boat.',
    );
  });

  it('shows only generic contextual choices and keeps unavailable choices focusable', () => {
    const view = mountView();
    view.begin();
    view.setSelection([
      { id: 'sleep', label: 'Sleep', unavailableReason: null },
      { id: 'bucket', label: 'Use Bucket', unavailableReason: null, anchorId: 'bucket-1' },
      { id: 'watch', label: 'Stand Watch', unavailableReason: 'TOO TIRED' },
      { id: 'endure', label: 'Endure', unavailableReason: null },
    ]);

    const buttons = view.choiceButtonsInOrder();
    expect(buttons.map((button) => button.dataset.eventChoice)).toEqual(['watch', 'endure']);
    expect(buttons[0]!.disabled).toBe(false);
    expect(buttons[0]!.getAttribute('aria-disabled')).toBe('true');
    expect(buttons[0]!.getAttribute('aria-description')).toBe('TOO TIRED');
    expect(buttons[0]!.textContent).toBe('Stand WatchTOO TIRED');
    buttons[0]!.focus();
    expect(document.activeElement).toBe(buttons[0]);

    view.setBusy(true);
    expect(buttons[1]!.disabled).toBe(false);
    expect(buttons[1]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('emits one generic choice and suppresses unavailable, busy, and selected choices', () => {
    const view = mountView();
    const choose = vi.fn();
    view.onChoice = choose;
    view.begin();
    view.setSelection([
      { id: 'blocked', label: 'Blocked', unavailableReason: 'NO' },
      { id: 'accept', label: 'Accept', unavailableReason: null },
    ]);
    const [blocked, accept] = view.choiceButtonsInOrder();

    blocked!.click();
    expect(choose).not.toHaveBeenCalled();
    accept!.click();
    expect(choose).toHaveBeenCalledWith('accept');

    view.setBusy(true);
    accept!.click();
    expect(choose).toHaveBeenCalledOnce();
  });

  it('uses 240 milliseconds and ignores bubbled animation from a target child', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.begin();
    view.setSelection([{ id: 'accept', label: 'Accept', unavailableReason: null }]);
    const target = view.choiceButton('accept')!;
    const child = document.createElement('span');
    target.append(child);
    let settled = false;
    const beat = view.playChoiceBeat('accept', target).then(() => { settled = true; });

    child.dispatchEvent(new Event('animationend', { bubbles: true }));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(target.dataset.eventState).toBe('selected');
    await vi.advanceTimersByTimeAsync(239);
    expect(settled).toBe(false);
    target.dispatchEvent(new Event('animationend', { bubbles: true }));
    await beat;
    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a pending beat when a later beat replaces it', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.begin();
    view.setSelection([{ id: 'accept', label: 'Accept', unavailableReason: null }]);
    let firstSettled = false;
    const first = view.playChoiceBeat('accept', view.choiceButton('accept'))
      .then(() => { firstSettled = true; });
    view.setSelection([{ id: 'again', label: 'Again', unavailableReason: null }]);
    await Promise.resolve();
    expect(firstSettled).toBe(false);

    let secondSettled = false;
    const second = view.playChoiceBeat('again', view.choiceButton('again'))
      .then(() => { secondSettled = true; });
    await first;
    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(240);
    await second;
  });

  it('settles a pending beat during event clear', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.begin();
    view.setSelection([{ id: 'accept', label: 'Accept', unavailableReason: null }]);
    const beat = view.playChoiceBeat('accept', view.choiceButton('accept'));

    view.clear();
    await beat;

    expect(vi.getTimerCount()).toBe(0);
    expect(view.choiceButtonsInOrder()).toHaveLength(0);
    expect(view.caption.getAttribute('aria-hidden')).toBe('true');
  });

  it('settles hidden and disposed beats once', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.begin();
    view.setSelection([{ id: 'accept', label: 'Accept', unavailableReason: null }]);
    const first = view.playChoiceBeat('accept', view.choiceButton('accept'));
    view.settleForVisibilityChange();
    await first;
    expect(vi.getTimerCount()).toBe(0);

    view.setSelection([{ id: 'again', label: 'Again', unavailableReason: null }]);
    const second = view.playChoiceBeat('again', view.choiceButton('again'));
    view.dispose();
    await second;
    expect(vi.getTimerCount()).toBe(0);
    expect(() => view.dispose()).not.toThrow();
  });

  it('keeps the ghost mask exclusive and leaves feedback active during event cleanup', async () => {
    vi.useFakeTimers();
    const view = mountView();
    view.begin();
    view.setSleepMask('bad-sleep', true);
    expect(view.sleepMask.classList).not.toContain('is-visible');
    view.setSleepMask('ghosts', true);
    expect(view.sleepMask.classList).toContain('is-visible');

    view.showFeedback({ accepted: false, message: 'The rope slips.' });
    view.clear();
    expect(view.sleepMask.classList).not.toContain('is-visible');
    expect(view.feedback.classList).toContain('is-visible');
    expect(view.feedback.textContent).toBe('The rope slips.');
    await vi.advanceTimersByTimeAsync(2_599);
    expect(view.feedback.classList).toContain('is-visible');
    view.showFeedback({ accepted: true, message: 'The knot holds.' });
    await vi.advanceTimersByTimeAsync(2_599);
    expect(view.feedback.classList).toContain('is-visible');
    await vi.advanceTimersByTimeAsync(1);
    expect(view.feedback.classList).not.toContain('is-visible');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('preserves a %s cleanup error and completes disposal', (_label, firstError) => {
    const view = mountView();
    const remove = vi.spyOn(view.caption, 'removeEventListener').mockImplementation(() => {
      throw firstError;
    });
    let laterCallback = view.onChoice;
    Object.defineProperty(view, 'onChoice', {
      configurable: true,
      get: () => laterCallback,
      set: (value: typeof laterCallback) => {
        laterCallback = value;
        throw new Error('later cleanup error');
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
    expect(() => view.onChoice('accept')).not.toThrow();
    expect(() => view.dispose()).not.toThrow();
    expect(remove).toHaveBeenCalledOnce();
  });
});
