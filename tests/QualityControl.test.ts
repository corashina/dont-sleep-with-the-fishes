// @vitest-environment jsdom
// Importance: 4/5. Protects configurable quality choices and input validation.

import { describe, expect, it, vi } from 'vitest';
import {
  QualityControl,
  type QualityPreference,
} from '../src/ui/QualityControl';

type TestQuality = 'low' | 'high' | 'ultra';

describe('QualityControl', () => {
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
