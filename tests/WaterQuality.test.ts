import { describe,expect,it,vi } from 'vitest';
import {
  createWaterQualityPreference
} from '../src/rendering/waterQuality';

describe('water quality preference', () => {

  it('loads the saved value and applies a changed choice', () => {
    const apply = vi.fn();
    const storage = {
      getItem: vi.fn(() => 'low'),
      setItem: vi.fn(),
    };
    const preference = createWaterQualityPreference(apply, storage);

    expect(preference.get()).toBe('low');
    expect(apply).not.toHaveBeenCalled();
    preference.set('high');
    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(storage.setItem).toHaveBeenCalledWith(
      'dont-sleep-with-the-fishes.water-quality',
      'high',
    );
  });
});
