// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects dive transition promises, confirmation flow, and disposal.

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
    expect([...cover.querySelectorAll<HTMLElement>('[data-dream-eyelid]')]
      .every((eyelid) => eyelid.hidden)).toBe(true);
    await vi.advanceTimersByTimeAsync(749);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });

  it('keeps one result open until the player confirms it', async () => {
    vi.useFakeTimers();
    const { mount, ui } = createUI();
    const focusTarget = document.createElement('button');
    mount.append(focusTarget);
    focusTarget.focus();
    const confirmation = ui.showRewardResult({
      title: 'DIVE RESULT',
      reward: { kind: 'item', id: 'energyBar', quantity: 1 },
      lines: ['YOU SUFFERED SOME INJURIES'],
    });
    let settled = false;
    void confirmation.then(() => { settled = true; });
    const result = mount.querySelector<HTMLElement>('[data-dive-result]')!;
    const close = result.querySelector<HTMLButtonElement>('[data-dive-result-close]')!;
    expect(result.querySelector('.dive-result__paper')).not.toBeNull();
    expect(result.querySelector('.dive-result__eyebrow')).toBeNull();
    expect(result.querySelector('.dive-result__stamp')).toBeNull();
    expect(result.getAttribute('role')).toBe('dialog');
    expect(result.getAttribute('aria-modal')).toBe('true');
    expect(result.querySelector('[data-dive-result-title]')?.textContent).toBe('DIVE RESULT');
    expect([...result.querySelectorAll('[data-dive-result-lines] li')]
      .map((line) => line.textContent)).toEqual(['YOU SUFFERED SOME INJURIES']);
    const reward = result.querySelector<HTMLElement>('[data-dive-result-rewards] .weight-circle')!;
    expect(reward.dataset.itemType).toBe('energyBar');
    expect(reward.querySelector('.weight-circle__thumbnail')).not.toBeNull();
    expect(reward.getAttribute('aria-hidden')).toBe('true');
    expect(result.querySelector('[data-dive-result-reward-name]')?.textContent).toBe('ENERGY BAR');
    expect(result.querySelector('[data-dive-result-reward-quantity]')?.textContent).toBe('×1');
    const paperChildren = [...result.querySelector('.dive-result__paper')!.children];
    expect(paperChildren.indexOf(result.querySelector('[data-dive-result-lines]')!))
      .toBeLessThan(paperChildren.indexOf(result.querySelector('[data-dive-result-rewards]')!));
    expect(close.textContent).toBe('\u00d7');
    expect(close.getAttribute('aria-label')).toBe('Close dive result');
    expect(result.querySelector('[data-dive-result-confirm]')).toBeNull();
    expect(document.activeElement).toBe(close);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled).toBe(false);
    expect(result.classList.contains('is-visible')).toBe(true);
    close.click();
    await confirmation;
    expect(result.classList.contains('is-visible')).toBe(false);
    expect(result.getAttribute('aria-hidden')).toBe('true');
    expect(result.querySelector('[data-dive-result-title]')?.textContent).toBe('');
    expect(result.querySelector('[data-dive-result-lines]')?.textContent).toBe('');
    expect(document.activeElement).toBe(close);
  });

  it('settles a superseded result and waits for confirmation of the later result', async () => {
    const { mount, ui } = createUI();
    const first = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['FOOD +1'] });
    const second = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['BAIT +1'] });
    await first;
    const result = mount.querySelector<HTMLElement>('[data-dive-result]')!;
    expect(result.textContent).toContain('BAIT +1');
    result.querySelector<HTMLButtonElement>('[data-dive-result-close]')!.click();
    await second;
    expect(result.querySelector('[data-dive-result-title]')?.textContent).toBe('');
    expect(result.querySelector('[data-dive-result-lines]')?.textContent).toBe('');
  });

  it('uses the shared reward paper for a recovered chest reward', async () => {
    const { mount, ui } = createUI();
    const confirmation = ui.showRewardResult({
      title: 'CHEST REWARD',
      reward: { kind: 'resource', id: 'food', quantity: 2 },
      lines: [],
    });
    const result = mount.querySelector<HTMLElement>('[data-dive-result]')!;

    expect(result.classList).toContain('is-chest-reward');
    expect(result.querySelector('[data-dive-result-title]')?.textContent)
      .toBe('CHEST REWARD');
    expect(result.querySelector('[data-dive-result-reward-name]')?.textContent)
      .toBe('FOOD');
    expect(result.querySelector('[data-dive-result-reward-quantity]')?.textContent)
      .toBe('×2');
    const close = result.querySelector<HTMLButtonElement>('[data-dive-result-close]')!;
    expect(close.getAttribute('aria-label')).toBe('Close chest reward');

    close.click();
    await confirmation;
    expect(result.classList).not.toContain('is-chest-reward');
  });

  it('settles superseded cover, covered hold, and result promises', async () => {
    vi.useFakeTimers();
    const { mount, ui } = createUI();
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

    const firstResult = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['FOOD +1'] });
    const secondResult = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['NOTHING FOUND'] });
    await firstResult;
    mount.querySelector<HTMLButtonElement>('[data-dive-result-close]')!.click();
    await secondResult;
  });

  it('hides the result, clears its text, and settles its hold', async () => {
    const { mount, ui } = createUI();
    const hold = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['NOTHING FOUND'] });
    ui.hideRewardResult();
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
    const result = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['NOTHING FOUND'] });
    ui.dispose();
    await Promise.all([cover, coveredHold, result]);
  });
});
