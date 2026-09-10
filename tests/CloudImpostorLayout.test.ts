import { Vector3, type Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CLOUD_QUERY_COUNT, CLOUD_RINGS, CLOUD_RING_PHASE, createCloudImpostorLayout, updateCloudImpostorShadows,
} from '../src/world/cloudImpostorLayout';
import { cloudImpostorShader } from '../src/world/cloudImpostorShader';

// Execute the shader's candidate selection with float32 sector arithmetic.
// Keep the old ring traversal below independent of the new loop and its uniform descriptors.
const selection = cloudImpostorShader.slice(
  cloudImpostorShader.indexOf('    int ringIndex = 0;'),
  cloudImpostorShader.indexOf('      float limit = front.alpha'),
);
const queryCandidates = new Function('azimuth', 'uCloudQueryRings', 'uCloudQueryCount', 'sectorFloor', `
  const result = [];
  const mod = (value, count) => value - count * Math.floor(value / count);
  ${selection
    .replace(/\b(?:int|vec4) (\w+)/g, 'let $1')
    .replace(/\bint\(/g, 'Math.trunc(')
    .replace(/\bfloat\(/g, 'Number(')
    .replaceAll('floor((azimuth - ring.z) * ring.w)', 'sectorFloor(azimuth, ring.z, ring.w)')}
    result.push(index);
  }
  return result;
`) as (azimuth: number, rings: Vector4[], count: number, floor: typeof sectorFloor) => number[];

function sectorFloor(azimuth: number, phase: number, scale: number): number {
  return Math.floor(Math.fround(Math.fround(Math.fround(azimuth) - Math.fround(phase)) * Math.fround(scale)));
}

function originalCandidates(azimuth: number): number[] {
  const result: number[] = [];
  let start = 0;
  for (const [ringIndex, ring] of CLOUD_RINGS.entries()) {
    const sector = sectorFloor(azimuth,
      Number((ringIndex * CLOUD_RING_PHASE).toFixed(4)),
      Number((ring.count / (Math.PI * 2)).toFixed(8)));
    for (let slot = 0; slot < (ringIndex < 2 ? ring.count : 5); slot++) {
      result.push(start + ((sector + slot - 2) % ring.count + ring.count) % ring.count);
    }
    start += ring.count;
  }
  return result;
}

describe('cloud impostor layout', () => {
  it('preserves shader candidate order through the azimuth seam and all sector boundaries', () => {
    const layout = createCloudImpostorLayout();
    const angles = [-Math.PI, Math.PI, 0];
    for (let step = 0; step <= 2048; step++) angles.push(-Math.PI + step / 2048 * Math.PI * 2);
    for (const ring of layout.queryRings) {
      for (let sector = -ring.y * 2; sector <= ring.y; sector++) {
        const boundary = ring.z + sector / ring.w;
        if (boundary < -Math.PI || boundary > Math.PI) continue;
        angles.push(boundary - 1e-6, boundary, boundary + 1e-6);
      }
    }
    for (const azimuth of angles) {
      const actual = queryCandidates(azimuth, layout.queryRings, CLOUD_QUERY_COUNT, sectorFloor);
      expect(actual).toEqual(originalCandidates(azimuth));
      expect(actual).toHaveLength(27);
      expect(new Set(actual).size).toBe(27);
    }
  });

  it('uses one runtime-bounded cloud group query body', () => {
    expect(cloudImpostorShader.match(/CloudSurface candidate = cloudGroup\(/g)).toHaveLength(1);
    expect(cloudImpostorShader).toContain('query < uCloudQueryCount');
  });

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
