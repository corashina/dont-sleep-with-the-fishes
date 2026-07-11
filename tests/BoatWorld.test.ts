import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { BoatWorld, clampParallax, survivalLighting } from '../src/survival/BoatWorld';

describe('BoatWorld helpers', () => {
  it('clamps mouse parallax and disables it for reduced motion', () => {
    expect(clampParallax(2, -2, false)).toEqual({ yaw: 0.045, pitch: -0.025 });
    expect(clampParallax(0.4, -0.4, true)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('provides distinct bounded day, night, and squall lighting', () => {
    expect(survivalLighting('calm', 'day')).toMatchObject({ ambient: 1.1, fogDensity: 0.012 });
    expect(survivalLighting('overcast', 'night').ambient).toBeLessThan(0.5);
    expect(survivalLighting('squall', 'day').fogDensity).toBeGreaterThan(0.02);
  });

  it('keeps the shared camera at a fixed height for reduced motion', () => {
    const camera = new PerspectiveCamera();
    const reducedMotion = { matches: true } as unknown as MediaQueryList;
    const world = new BoatWorld(camera, reducedMotion);
    const before = camera.getWorldPosition(new Vector3()).y;

    world.update(1, 0.1);
    const after = camera.getWorldPosition(new Vector3()).y;
    world.dispose();

    expect(after).toBe(before);
  });

  it('only builds survival fishing gear when rescued and resets transient cues', async () => {
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, { matches: false } as MediaQueryList, false);
    expect(world.scene.getObjectByName('fishing-rod')).toBeUndefined();
    const sequence = world.play('rest');
    world.update(0.8, 0.8);
    await sequence;
    expect(world.presentationCueForTest()).toBeNull();
    world.dispose();
  });

  it('animates line and catch for both rod and hand-line fishing', () => {
    for (const hasRod of [true, false]) {
      const world = new BoatWorld(new PerspectiveCamera(), { matches: false } as MediaQueryList, hasRod);
      expect(Boolean(world.scene.getObjectByName('fishing-rod'))).toBe(hasRod);
      world.play('fish');
      world.update(0.7, 0.7);
      expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(true);
      expect(world.scene.getObjectByName('fishing-catch')?.visible).toBe(true);
      world.dispose();
    }
  });
});
