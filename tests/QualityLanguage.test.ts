// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import { createVisualQualityPreference } from '../src/rendering/visualQuality';
import { createWaterQualityPreference } from '../src/rendering/waterQuality';
import { createAntiAliasingQualityPreference } from '../src/rendering/antiAliasingQuality';
import { createShadowQualityPreference } from '../src/rendering/shadowQuality';
import { VisualQualityControl } from '../src/ui/VisualQualityControl';
import { WaterQualityControl } from '../src/ui/WaterQualityControl';
import { AntiAliasingQualityControl } from '../src/ui/AntiAliasingQualityControl';
import { ShadowQualityControl } from '../src/ui/ShadowQualityControl';

beforeEach(() => initializeLanguage(null));
afterEach(() => { setLanguage('en'); document.body.replaceChildren(); });

describe('quality label language changes', () => {
  it('updates all open controls without replacing buttons, focus, or selection', () => {
    const apply = vi.fn();
    const controls = [
      new VisualQualityControl(createVisualQualityPreference(apply, null)),
      new WaterQualityControl(createWaterQualityPreference(apply, null)),
      new AntiAliasingQualityControl(createAntiAliasingQualityPreference(apply, null)),
      new ShadowQualityControl(createShadowQualityPreference(apply, null)),
    ];
    document.body.append(...controls.map(({ element }) => element));
    const buttons = controls.flatMap(({ element }) => [...element.querySelectorAll('button')]);
    const english = ['LOW', 'MEDIUM', 'HIGH', 'LOW', 'HIGH', 'ULTRA', 'LOW', 'HIGH', 'LOW', 'HIGH'];
    const polish = ['NISKA', 'ŚREDNIA', 'WYSOKA', 'NISKA', 'WYSOKA', 'ULTRA', 'NISKA', 'WYSOKA', 'NISKA', 'WYSOKA'];
    buttons[0]!.click();
    buttons[0]!.focus();
    apply.mockClear();
    const selected = buttons.map((button) => button.getAttribute('aria-pressed'));
    try {
      expect(buttons.map((button) => button.textContent)).toEqual(english);
      for (const [language, labels] of [['pl', polish], ['en', english]] as const) {
        setLanguage(language);
        expect(buttons.map((button) => button.textContent)).toEqual(labels);
        const current = controls.flatMap(({ element }) => [...element.querySelectorAll('button')]);
        current.forEach((button, index) => expect(button).toBe(buttons[index]));
        expect(document.activeElement).toBe(buttons[0]);
        expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(selected);
        expect(apply).not.toHaveBeenCalled();
      }
    } finally {
      controls.forEach((control) => control.dispose());
    }
  });
});
