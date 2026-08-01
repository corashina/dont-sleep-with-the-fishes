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
    const { mount, ui } = createUI();
    await ui.setSleepCoverProfile('dive');
    const pending = ui.setSleepCovered(true);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;
    expect(cover.dataset.profile).toBe('dive');
    cover.dispatchEvent(new TransitionEvent('transitionend', {
      propertyName: 'opacity', bubbles: true,
    }));
    await pending;
  });

  it('shows and announces the exact dive result, then settles its hold', async () => {
    vi.useFakeTimers();
    const { mount, ui } = createUI();
    const hold = ui.showDiveResult({
      title: 'DIVE RESULT',
      lines: ['FOOD +1', 'HEALTH -10'],
    });
    expect(mount.querySelector('[data-dive-result]')?.textContent)
      .toContain('FOOD +1');
    await Promise.resolve();
    expect(mount.querySelector('[data-survival-announcer]')?.textContent)
      .toContain('HEALTH -10');
    await vi.advanceTimersByTimeAsync(2_600);
    await hold;
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
