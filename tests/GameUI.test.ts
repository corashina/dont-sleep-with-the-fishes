// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import { GameUI } from '../src/ui/GameUI';
import { formatDuration } from '../src/ui/formatDuration';

describe('GameUI scavenging item tooltip', () => {
  it('uses the survival tooltip treatment at the projected item edge', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.setPrompt('BOTTOM PROMPT');
    ui.setItemTooltip({
      text: 'BUCKET',
      x: 420,
      y: 180,
      placement: 'above',
    });

    const tooltip = mount.querySelector<HTMLElement>('[data-item-tooltip]')!;
    expect(tooltip.classList).toContain('boat-tooltip');
    expect(tooltip.classList).toContain('is-visible');
    expect(tooltip.textContent).toBe('BUCKET');
    expect(tooltip.style.left).toBe('420px');
    expect(tooltip.style.top).toBe('180px');
    expect(tooltip.dataset.placement).toBe('above');
    expect(mount.querySelector('[data-prompt]')?.classList).not.toContain('is-visible');

    ui.setItemTooltip(null);
    expect(tooltip.classList).not.toContain('is-visible');
    ui.dispose();
  });

  it('keeps visual quality controls out of the pause screen', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-pause] [data-visual-quality-control]')).toBeNull();
    expect(mount.querySelector('[data-pause] [data-visual-quality]')).toBeNull();
    ui.dispose();
  });

  it('focuses the resume control when the pause screen opens', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;
    const resume = mount.querySelector<HTMLButtonElement>('[data-resume-button]')!;

    ui.setPaused(true);

    expect(pause.getAttribute('aria-hidden')).toBe('false');
    expect(pause.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(resume);

    ui.setPaused(false);
    expect(pause.getAttribute('aria-hidden')).toBe('true');
    expect(pause.hasAttribute('inert')).toBe(true);
    ui.dispose();
    mount.remove();
  });

  it('keeps the pause screen open during normal gameplay frames', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;

    ui.setPaused(true);
    ui.renderEnding('playing', 0);

    expect(pause.classList).toContain('is-visible');
    expect(pause.getAttribute('aria-hidden')).toBe('false');
    expect(pause.hasAttribute('inert')).toBe(false);
    ui.dispose();
    mount.remove();
  });

  it('replaces the crosshair with a pickup hand for a valid pickup target', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const pointer = mount.querySelector<HTMLElement>('[data-pickup-pointer]')!;
    const crosshair = mount.querySelector<HTMLElement>('[data-crosshair]')!;

    ui.setPickupPointer(true);

    expect(pointer.classList).toContain('is-visible');
    expect(crosshair.classList).toContain('is-pickup-hidden');

    ui.setPickupPointer(false);

    expect(pointer.classList).not.toContain('is-visible');
    expect(crosshair.classList).not.toContain('is-pickup-hidden');
    ui.dispose();
  });
});

describe('GameUI scavenging ending', () => {
  it('renders the ending stages and exposes the main-menu action only when ready', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const uiRoot = mount.querySelector<HTMLElement>('.game-ui')!;

    ui.renderEnding('sinking', 0.4);
    expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);
    expect(mount.querySelector('[data-ending]')?.classList.contains('is-visible')).toBe(false);
    expect((mount.querySelector('[data-ending-action]') as HTMLButtonElement).hidden).toBe(true);
    expect(uiRoot.style.getPropertyValue('--scavenge-ending-blackout')).toBe('0.4');

    ui.renderEnding('endingHold', 1);
    expect(mount.querySelector('[data-ending]')?.classList.contains('is-visible')).toBe(true);
    expect((mount.querySelector('[data-ending-action]') as HTMLButtonElement).hidden).toBe(true);

    ui.renderEnding('menuReady', 1);
    const action = mount.querySelector('[data-ending-action]') as HTMLButtonElement;
    expect(action.hidden).toBe(false);
    expect(document.activeElement).toBe(action);
    expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('SUNK WITH DOROTHY');
    ui.dispose();
    mount.remove();
  });

  it('calls replay once and removes the ending action listener on disposal', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const onReplay = vi.fn();
    ui.onReplay = onReplay;
    ui.renderEnding('menuReady', 1);
    const action = mount.querySelector<HTMLButtonElement>('[data-ending-action]')!;

    action.click();
    action.click();
    expect(onReplay).toHaveBeenCalledOnce();

    ui.dispose();
    action.click();
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('preserves title-screen ownership when playing is rendered before the game starts', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.renderEnding('playing', 0);

    expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);
    ui.dispose();
  });

  it('initializes the watch from the scavenging duration rule', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-timer]')?.textContent)
      .toBe(formatDuration(SCAVENGE_DURATION_SECONDS));
    ui.dispose();
  });
});
