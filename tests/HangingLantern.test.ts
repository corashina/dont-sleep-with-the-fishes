// Importance: 95/100. Prevent wasted daylight shadows and stale shadows at night.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { expect, it } from 'vitest';
import { createHangingLantern } from '../src/survival/HangingLantern';

it('suspends daylight shadows and refreshes them on each night transition', () => {
  const material = new MeshStandardMaterial();
  const model = new Group();
  model.add(new Mesh(new BoxGeometry(), material));
  const lantern = createHangingLantern(model, material);
  try {
    expect(lantern.light.shadow.autoUpdate).toBe(false);
    expect(lantern.light.shadow.needsUpdate).toBe(false);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      lantern.setNight(true);
      expect(lantern.light.intensity).toBeGreaterThan(0);
      expect(lantern.light.shadow.autoUpdate).toBe(true);
      expect(lantern.light.shadow.needsUpdate).toBe(true);
      lantern.setNight(false);
      expect(lantern.light.intensity).toBe(0);
      expect(lantern.light.shadow.autoUpdate).toBe(false);
      expect(lantern.light.shadow.needsUpdate).toBe(false);
    }
  } finally {
    lantern.dispose();
    material.dispose();
  }
});
