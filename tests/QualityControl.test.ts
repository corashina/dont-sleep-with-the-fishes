// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects configurable quality choices and input validation.

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createVisualQualityPreference,
  parseVisualQuality,
} from '../src/rendering/visualQuality';
import { createWaterQualityPreference } from '../src/rendering/waterQuality';
import { createAntiAliasingQualityPreference } from '../src/rendering/antiAliasingQuality';
import { createShadowQualityPreference } from '../src/rendering/shadowQuality';
import { AntiAliasingQualityControl } from '../src/ui/AntiAliasingQualityControl';
import { ShadowQualityControl } from '../src/ui/ShadowQualityControl';
import {
  QualityControl,
  type QualityPreference,
} from '../src/ui/QualityControl';
import { VisualQualityControl } from '../src/ui/VisualQualityControl';
import { WaterQualityControl } from '../src/ui/WaterQualityControl';

const mainStyles = readFileSync('src/styles/main.css', 'utf8');

function qualityValues(element: Element): string[] {
  return [...element.querySelectorAll<HTMLButtonElement>('[data-quality]')]
    .map((button) => button.dataset.quality!);
}

type TestQuality = 'low' | 'high' | 'ultra';

describe('QualityControl', () => {
  it('shows water, visual, anti-aliasing, and shadow choices', () => {
    const water = new WaterQualityControl(
      createWaterQualityPreference(() => undefined, null),
    );
    const ao = new VisualQualityControl(
      createVisualQualityPreference(() => undefined, null),
    );
    const antiAliasing = new AntiAliasingQualityControl(
      createAntiAliasingQualityPreference(() => undefined, null),
    );
    const shadows = new ShadowQualityControl(
      createShadowQualityPreference(() => undefined, null),
    );

    expect(qualityValues(water.element)).toEqual(['low', 'high', 'ultra']);
    expect(qualityValues(ao.element)).toEqual(['low', 'medium', 'high']);
    expect(qualityValues(antiAliasing.element)).toEqual(['low', 'high']);
    expect(qualityValues(shadows.element)).toEqual(['low', 'high']);
    expect(water.element.querySelector('p')?.textContent)
      .toBe('Ultra adds a natural ocean surface at high GPU cost.');
    expect(mainStyles).toMatch(
      /\.visual-quality-control__choices\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s,
    );
    expect(mainStyles).toMatch(
      /\.visual-quality-control\[data-quality-control="water"\]\s+\.visual-quality-control__choices\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s,
    );
    expect(mainStyles).toMatch(
      /\.visual-quality-control\[data-quality-control="anti-aliasing"\]\s+\.visual-quality-control__choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
    expect(mainStyles).toMatch(
      /\.visual-quality-control\[data-quality-control="shadows"\]\s+\.visual-quality-control__choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
    const consoleQualityRowRule = mainStyles.match(
      /^\.post-processing-console__quality-row\s*\{([^}]*)\}/m,
    )?.[1];
    expect(consoleQualityRowRule).toContain(
      'grid-template-columns: minmax(0, 1fr);',
    );

    water.dispose();
    ao.dispose();
    antiAliasing.dispose();
    shadows.dispose();
  });

  it('accepts the medium visual quality preference', () => {
    expect(parseVisualQuality('medium')).toBe('medium');
    expect(parseVisualQuality('high')).toBe('high');
    expect(parseVisualQuality('unknown')).toBe('low');
  });

  it('renders ordered choices and accepts only configured values', () => {
    let selected: TestQuality = 'low';
    const set = vi.fn((value: TestQuality) => {
      selected = value;
    });
    const preference: QualityPreference<TestQuality> = {
      get: () => selected,
      set,
    };
    const control = new QualityControl(preference, {
      kind: 'test',
      label: 'TEST QUALITY',
      note: 'Test quality note.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
        { value: 'ultra', label: 'ULTRA' },
      ],
    });
    const buttons = [
      ...control.element.querySelectorAll<HTMLButtonElement>('[data-quality]'),
    ];

    expect(buttons.map((button) => [
      button.dataset.quality,
      button.textContent,
    ])).toEqual([
      ['low', 'LOW'],
      ['high', 'HIGH'],
      ['ultra', 'ULTRA'],
    ]);
    expect(control.element.querySelector('legend')?.textContent)
      .toBe('TEST QUALITY');

    buttons[2]!.click();

    expect(set).toHaveBeenCalledWith('ultra');
    expect(buttons.map((button) => button.getAttribute('aria-pressed')))
      .toEqual(['false', 'false', 'true']);
    expect(buttons[2]!.classList).toContain('is-selected');

    const invalid = document.createElement('button');
    invalid.dataset.quality = 'extreme';
    control.element.append(invalid);
    invalid.click();

    expect(set).toHaveBeenCalledTimes(1);
    control.dispose();
  });
});
