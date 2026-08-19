// Importance: 8/10 (scaled from 4/5). Protects the screen-space binocular filter state and responsive aspect.
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BinocularMaskPass,
  sceneBinocularMaskStrength,
  setSceneBinocularMaskStrength,
} from '../src/rendering/BinocularMaskPass';

describe('BinocularMaskPass', () => {
  it('stores clamped mask strength on the rendered scene', () => {
    const scene = new Scene();

    expect(sceneBinocularMaskStrength(scene)).toBe(0);
    setSceneBinocularMaskStrength(scene, 1.4);
    expect(sceneBinocularMaskStrength(scene)).toBe(1);
    setSceneBinocularMaskStrength(scene, Number.NaN);
    expect(sceneBinocularMaskStrength(scene)).toBe(0);
  });

  it('enables only for a visible mask and tracks the viewport aspect', () => {
    const pass = new BinocularMaskPass();

    expect(pass.enabled).toBe(false);
    pass.setStrength(0.75);
    pass.setSize(1920, 1080);

    expect(pass.enabled).toBe(true);
    expect(pass.uniforms.maskStrength!.value).toBeCloseTo(0.75);
    expect(pass.uniforms.aspect!.value).toBeCloseTo(16 / 9);
    pass.setStrength(0);
    expect(pass.enabled).toBe(false);
    pass.dispose();
  });
});
