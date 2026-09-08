import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createWaterLabHull } from '../scripts/water-lab/hull';
import { pointInWaterExclusion } from './helpers/waterExclusion';

describe('water lab hull mask', () => {
  it('keeps water beside, below, and above the visible hull', () => {
    const { body, exclusion } = createWaterLabHull();
    const outside = [
      new Vector3(2, 0, 0), new Vector3(-2, 0, 0),
      new Vector3(0, 0, 3.8), new Vector3(0, 0, -3.8),
      new Vector3(0, -0.4, 0), new Vector3(0, 0.4, 0),
    ];
    for (const point of outside) {
      expect(pointInWaterExclusion(body.localToWorld(point), exclusion)).toBe(false);
    }
    expect(pointInWaterExclusion(body.localToWorld(new Vector3(1.8, 0, 3.4)), exclusion)).toBe(true);
  });

  it('lets water cover a lowered deck while the mask follows the tilted hull', () => {
    const { hull, body, exclusion } = createWaterLabHull();
    hull.position.set(4, -1, -2);
    hull.rotation.set(0.08, 0.3, -0.06);
    body.updateWorldMatrix(true, false);
    exclusion.worldToLocal.copy(body.matrixWorld).invert();
    expect(pointInWaterExclusion(new Vector3(4, 0, -2), exclusion)).toBe(false);
    expect(pointInWaterExclusion(body.localToWorld(new Vector3()), exclusion)).toBe(true);
    expect(pointInWaterExclusion(body.localToWorld(new Vector3(0, 0.4, 0)), exclusion)).toBe(false);
  });
});
