// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { VisualQualityControl } from '../src/ui/VisualQualityControl';

describe('VisualQualityControl', () => {
  it('exposes text, pressed state, focusable buttons, and immediate changes', () => {
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, null);
    const control = new VisualQualityControl(preference);
    const low = control.element.querySelector<HTMLButtonElement>(
      '[data-visual-quality="low"]',
    )!;
    const high = control.element.querySelector<HTMLButtonElement>(
      '[data-visual-quality="high"]',
    )!;

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
});
