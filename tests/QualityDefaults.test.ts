import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHADOW_QUALITY,
  parseShadowQuality,
} from '../src/rendering/shadowQuality';
import {
  DEFAULT_VISUAL_QUALITY,
  parseVisualQuality,
} from '../src/rendering/visualQuality';
import { DEFAULT_WATER_QUALITY } from '../src/rendering/waterQuality';

describe('quality defaults', () => {
  it('uses the requested quality levels', () => {
    expect(DEFAULT_VISUAL_QUALITY).toBe('medium');
    expect(DEFAULT_WATER_QUALITY).toBe('high');
    expect(DEFAULT_SHADOW_QUALITY).toBe('high');
  });

  it('preserves saved low quality values', () => {
    expect(parseVisualQuality('low')).toBe('low');
    expect(parseShadowQuality('low')).toBe('low');
  });
});
