import { Vector3 } from 'three';
import { describe,expect,it } from 'vitest';
import {
  createCloudImpostorLayout,updateCloudImpostorShadows,
} from '../src/world/cloudImpostorLayout';
describe('cloud impostor layout', () => {

  it('reuses valid, distinct shadow neighbors when sunlight and weather change', () => {
    const layout = createCloudImpostorLayout();
    const blockers = [...layout.blockers];
    const sun = new Vector3(-0.42, 0.58, -0.7).normalize();
    for (const coverage of [0.48, 0.68, 0.88]) {
      updateCloudImpostorShadows(layout, sun, 320, coverage);
      let shadowCount = 0;
      layout.blockers.forEach((neighbors, index) => {
        expect(neighbors).toBe(blockers[index]);
        const active = neighbors.toArray().filter(value => value >= 0);
        expect(new Set(active).size).toBe(active.length);
        active.forEach(neighbor => {
          expect(Number.isInteger(neighbor)).toBe(true);
          expect(neighbor).not.toBe(index);
          expect(neighbor).toBeLessThan(layout.centers.length);
          shadowCount++;
        });
      });
      expect(shadowCount).toBeGreaterThan(0);
    }
  });
});
