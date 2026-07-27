// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
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

  it('owns a visual quality control inside the pause screen', () => {
    const mount = document.createElement('main');
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, null);
    const ui = new GameUI(mount, preference);
    const high = mount.querySelector<HTMLButtonElement>(
      '[data-visual-quality="high"]',
    )!;
    const control = mount.querySelector('[data-visual-quality-control]');

    high.click();

    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(control).not.toBeNull();
    expect(mount.querySelector('[data-pause]')?.contains(control)).toBe(true);
    expect(mount.querySelector('.hud')?.contains(control)).toBe(false);
    expect(mount.querySelector('[data-start]')?.contains(control)).toBe(false);
    expect(mount.querySelector('[data-result]')?.contains(control)).toBe(false);

    ui.dispose();
    high.click();
    expect(apply).toHaveBeenCalledOnce();
  });
});
