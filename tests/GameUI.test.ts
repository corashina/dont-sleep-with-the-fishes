// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialItemState } from '../src/game/ItemState';
import type { ScavengeSnapshot } from '../src/game/ScavengeSession';
import { getSinkingState } from '../src/game/sinking';
import { GameUI } from '../src/ui/GameUI';

function snapshot(overrides: Partial<ScavengeSnapshot> = {}): ScavengeSnapshot {
  return {
    status: 'running',
    remainingSeconds: 120,
    savedCount: 0,
    carriedItem: null,
    items: createInitialItemState(),
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('GameUI', () => {
  it('reports saved supply names, filled slots, and elapsed time', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const items = createInitialItemState();
    items.flareGun = 'saved';
    items.medicalKit = 'saved';

    ui.showResult(snapshot({
      status: 'success',
      remainingSeconds: 83.2,
      savedCount: 2,
      items,
    }));

    const details = mount.querySelector('[data-result-items]')?.textContent ?? '';
    expect(details).toContain('2 / 5 SUPPLY SLOTS FILLED');
    expect(details).toContain('FLARE GUN');
    expect(details).toContain('MEDICAL KIT');
    expect(details).toContain('00:37 ELAPSED');
  });

  it('shows a distinct failure layer before revealing the result', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);

    ui.showFailureSequence();
    expect(mount.querySelector('[data-failure]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-result]')?.classList).not.toContain('is-visible');

    ui.showResult(snapshot({ status: 'failure', remainingSeconds: 0 }));
    expect(mount.querySelector('[data-failure]')?.classList).not.toContain('is-visible');
    expect(mount.querySelector('[data-result]')?.classList).toContain('is-visible');
  });

  it('keeps slot nodes stable when the saved count has not changed', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const sinking = getSinkingState(0, 120);
    const firstSlot = mount.querySelector('.slot');

    ui.render(snapshot(), sinking);
    ui.render(snapshot({ remainingSeconds: 119 }), getSinkingState(1, 120));

    expect(mount.querySelector('.slot')).toBe(firstSlot);
  });

  it('surfaces pointer-lock rejection on start and pause layers', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);

    ui.showPointerLockError();

    const errors = [...mount.querySelectorAll('[data-pointer-lock-error]')];
    expect(errors).toHaveLength(2);
    errors.forEach((error) => {
      expect(error.textContent).toContain('Mouse look was blocked');
      expect(error.classList).toContain('is-visible');
    });
  });

  it('removes button listeners and its DOM root exactly once on dispose', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const start = vi.fn();
    const resume = vi.fn();
    const replay = vi.fn();
    ui.onStart = start;
    ui.onResume = resume;
    ui.onReplay = replay;
    const startButton = mount.querySelector<HTMLButtonElement>('[data-start-button]')!;
    const resumeButton = mount.querySelector<HTMLButtonElement>('[data-resume-button]')!;
    const replayButton = mount.querySelector<HTMLButtonElement>('[data-replay-button]')!;

    startButton.click();
    resumeButton.click();
    replayButton.click();
    expect(start).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();

    ui.dispose();
    ui.dispose();
    startButton.click();
    resumeButton.click();
    replayButton.click();

    expect(start).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();
    expect(mount.children).toHaveLength(0);
  });
});
