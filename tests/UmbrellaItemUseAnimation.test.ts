// Importance: 4/5. Protects the real umbrella pose and prevents duplicate canopy effects.
import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

describe('umbrella item-use animation', () => {
  it('rotates into the hand while it rises', () => {
    const early = createEventItemUseSample();
    const raised = createEventItemUseSample();
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.14, early);
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.42, raised);

    expect(Math.abs(early.roll)).toBeGreaterThan(0);
    expect(Math.abs(early.roll)).toBeLessThan(Math.abs(raised.roll));
    expect(Math.abs(early.viewY)).toBeLessThan(Math.abs(raised.viewY));
  });

  it('raises the real canopy above a grip held at the hand', () => {
    const sample = createEventItemUseSample();
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.7, sample);

    expect(sample.effectKind).toBe('none');
    expect(sample.primaryEffect).toBe(0);
    expect(sample.viewY).toBeCloseTo(-0.22);
    expect(sample.viewZ).toBeCloseTo(-0.85);
    expect(sample.roll).toBeCloseTo(-Math.PI / 2);

    const storageRotation = boatSupplyTransform('umbrella', 0).rotation;
    const umbrellaRotation = new Quaternion().setFromEuler(storageRotation)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sample.yaw))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), sample.pitch))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), sample.roll));
    const canopyDirection = new Vector3(0, 1, 0)
      .applyEuler(new Euler(...ITEM_MODEL_SPECS.umbrella.rotation))
      .applyQuaternion(umbrellaRotation)
      .normalize();

    expect(canopyDirection.y).toBeGreaterThan(0.98);
  });
});
