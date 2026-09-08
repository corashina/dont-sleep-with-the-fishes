import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_RINGS, CLOUD_RING_PHASE, createCloudImpostorLayout, updateCloudImpostorShadows,
} from '../src/world/cloudImpostorLayout';

describe('cloud impostor layout', () => {
  it('keeps the calm sun clear throughout cloud drift and restores storm cover', () => {
    const layout = createCloudImpostorLayout();
    const sun = new Vector3(-0.42, 0.58, -0.7).normalize();
    for (let time = 0; time <= 5300; time += 100) {
      updateCloudImpostorShadows(layout, sun, time, 0.48);
      const angle = time * 0.0012;
      const sunX = Math.cos(angle) * sun.x + Math.sin(angle) * sun.z;
      const sunZ = -Math.sin(angle) * sun.x + Math.cos(angle) * sun.z;
      layout.centers.forEach((center, index) => {
        const along = center.x * sunX + center.y * sun.y + center.z * sunZ;
        const perpendicularSquared = center.x ** 2 + center.y ** 2 + center.z ** 2 - along ** 2;
        if (along > 0 && perpendicularSquared <= layout.bounds[index]! ** 2) {
          expect(layout.scales[index]!.w).toBe(0);
        }
      });
    }
    updateCloudImpostorShadows(layout, sun, 0, 0.74);
    layout.scales.forEach(scale => expect(scale.w).toBeGreaterThan(0.95));
  });

  it('keeps every distant cloud within the five queried sectors, including in storms', () => {
    const layout = createCloudImpostorLayout();
    let start = 0;
    for (const [ringIndex, ring] of CLOUD_RINGS.entries()) {
      if (ringIndex >= 2) {
        for (let slot = 0; slot < ring.count; slot++) {
          const center = layout.centers[start + slot]!;
          const scale = layout.scales[start + slot]!;
          const radius = Math.hypot(center.x, center.z);
          const bound = Math.max(scale.x * 2.1, scale.y * 1.4, scale.z * 2.1) * 2.1;
          const halfAngle = Math.asin(bound / radius);
          expect(Number.isFinite(halfAngle)).toBe(true);
          const centerAngle = Math.atan2(center.x, -center.z);
          for (let step = 0; step <= 40; step++) {
            const angle = centerAngle - halfAngle + halfAngle * 2 * step / 40;
            const sector = Math.floor((angle - ringIndex * CLOUD_RING_PHASE) * ring.count / (Math.PI * 2));
            const relativeSlot = ((slot - sector) % ring.count + ring.count) % ring.count;
            expect(relativeSlot <= 2 || relativeSlot >= ring.count - 2).toBe(true);
          }
        }
      }
      start += ring.count;
    }
  });

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
