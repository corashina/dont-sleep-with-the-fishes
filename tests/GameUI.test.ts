// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { GameUI } from '../src/ui/GameUI';

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
