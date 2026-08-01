// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const activeUIs: SurvivalUI[] = [];

afterEach(() => {
  vi.useRealTimers();
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  document.body.innerHTML = '';
});

function createUI(): { readonly mount: HTMLElement; readonly ui: SurvivalUI } {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  activeUIs.push(ui);
  return { mount, ui };
}

describe('DiveUI', () => {
  it('uses the event cover with the 750 millisecond dive profile', async () => {
    vi.useFakeTimers();
    const { mount, ui } = createUI();
    await ui.setSleepCoverProfile('dive');
    const pending = ui.setSleepCovered(true);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;
    let settled = false;
    void pending.then(() => { settled = true; });
    expect(cover.dataset.profile).toBe('dive');
    await vi.advanceTimersByTimeAsync(749);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });

  it('shows and announces the exact dive result, then settles its hold', async () => {
    vi.useFakeTimers();
    const { mount, ui } = createUI();
    const focusTarget = document.createElement('button');
    mount.append(focusTarget);
    focusTarget.focus();
    const hold = ui.showDiveResult({
      title: 'DIVE RESULT',
      lines: ['FOOD +1', 'HEALTH -10'],
    });
    const result = mount.querySelector<HTMLElement>('[data-dive-result]')!;
    expect(result.getAttribute('role')).toBe('status');
    expect(result.querySelector('[data-dive-result-title]')?.textContent).toBe('DIVE RESULT');
    expect([...result.querySelectorAll('[data-dive-result-lines] li')]
      .map((line) => line.textContent)).toEqual(['FOOD +1', 'HEALTH -10']);
    expect(document.activeElement).toBe(focusTarget);
    await Promise.resolve();
    expect(mount.querySelector('[data-survival-announcer]')?.textContent)
      .toBe('DIVE RESULT. FOOD +1. HEALTH -10');
    await vi.advanceTimersByTimeAsync(2_600);
    await hold;
  });

  it('settles superseded cover, covered hold, and result promises', async () => {
    vi.useFakeTimers();
    const { ui } = createUI();
    await ui.setSleepCoverProfile('dive');

    const firstCover = ui.setSleepCovered(true);
    const secondCover = ui.setSleepCovered(false);
    await firstCover;
    await vi.advanceTimersByTimeAsync(750);
    await secondCover;

    const firstCoveredHold = ui.holdDiveCovered();
    const secondCoveredHold = ui.holdDiveCovered();
    await firstCoveredHold;
    await vi.advanceTimersByTimeAsync(250);
    await secondCoveredHold;

    const firstResult = ui.showDiveResult({ title: 'DIVE RESULT', lines: ['FOOD +1'] });
    const secondResult = ui.showDiveResult({ title: 'DIVE RESULT', lines: ['NOTHING FOUND'] });
    await firstResult;
    await vi.advanceTimersByTimeAsync(2_600);
    await secondResult;
  });

  it('hides the result, clears its text, and settles its hold', async () => {
    const { mount, ui } = createUI();
    const hold = ui.showDiveResult({ title: 'DIVE RESULT', lines: ['NOTHING FOUND'] });
    ui.hideDiveResult();
    await hold;
    const result = mount.querySelector<HTMLElement>('[data-dive-result]')!;
    expect(result.classList.contains('is-visible')).toBe(false);
    expect(result.getAttribute('aria-hidden')).toBe('true');
    expect(result.querySelector('[data-dive-result-title]')?.textContent).toBe('');
    expect(result.querySelector('[data-dive-result-lines]')?.textContent).toBe('');
  });

  it('settles an active result hold and cover transition during disposal', async () => {
    const { ui } = createUI();
    const cover = ui.setSleepCovered(true);
    const coveredHold = ui.holdDiveCovered();
    const result = ui.showDiveResult({ title: 'DIVE RESULT', lines: ['NOTHING FOUND'] });
    ui.dispose();
    await Promise.all([cover, coveredHold, result]);
  });
});
