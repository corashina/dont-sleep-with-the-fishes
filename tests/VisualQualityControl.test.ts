// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { createWaterQualityPreference } from '../src/rendering/waterQuality';
import { VisualQualityControl } from '../src/ui/VisualQualityControl';
import { WaterQualityControl } from '../src/ui/WaterQualityControl';

describe('VisualQualityControl', () => {
  it('exposes text, pressed state, focusable buttons, and immediate changes', () => {
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, null);
    const control = new VisualQualityControl(preference);
    const low = control.element.querySelector<HTMLButtonElement>(
      '[data-quality="low"]',
    )!;
    const high = control.element.querySelector<HTMLButtonElement>(
      '[data-quality="high"]',
    )!;

    expect(control.element.textContent).toContain('AO QUALITY');
    expect(low.getAttribute('aria-pressed')).toBe('true');
    expect(high.getAttribute('aria-pressed')).toBe('false');
    high.click();
    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(high.getAttribute('aria-pressed')).toBe('true');

    control.dispose();
    low.click();
    expect(preference.get()).toBe('high');
  });

  it('offers a separate water quality choice', () => {
    const apply = vi.fn();
    const preference = createWaterQualityPreference(apply, null);
    const control = new WaterQualityControl(preference);
    const high = control.element.querySelector<HTMLButtonElement>(
      '[data-quality="high"]',
    )!;

    expect(control.element.dataset.qualityControl).toBe('water');
    expect(control.element.textContent).toContain('WATER QUALITY');
    expect(control.element.textContent).toContain(
      'High adds smoother waves and richer surface detail.',
    );
    high.click();
    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');

    control.dispose();
  });
});
