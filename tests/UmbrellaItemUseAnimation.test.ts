// Importance: 8/10 (scaled from 4/5). Protects the real umbrella pose and prevents duplicate canopy effects.
import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';
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

  it('centers the real canopy above the player', () => {
    const sample = createEventItemUseSample();
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.7, sample);
    const profile = eventItemMotionProfile('umbrella');

    expect(profile.holdZone).toBe('one-hand');
    expect(profile.view).toEqual([0.32, 0.18, -0.38]);
    expect(sample.effectKind).toBe('none');
    expect(sample.primaryEffect).toBe(0);
    expect(sample.viewX).toBe(0);
    expect(sample.viewY).toBeCloseTo(0.18);
    expect(sample.viewZ).toBeCloseTo(-0.38);
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

  it('keeps the shield pose in the right hand', () => {
    const sample = createEventItemUseSample();
    sampleEventItemUse('umbrella-shield', 'umbrella', 0.7, sample);

    expect(sample.viewX).toBeCloseTo(0.32);
  });

  it('holds still after lifting without an up-and-down pulse', () => {
    const raised = createEventItemUseSample();
    const actionPeak = createEventItemUseSample();
    const held = createEventItemUseSample();

    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.42, raised);
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.7, actionPeak);
    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.95, held);

    expect([actionPeak.viewX, actionPeak.viewY, actionPeak.viewZ]).toEqual([
      raised.viewX,
      raised.viewY,
      raised.viewZ,
    ]);
    expect([held.viewX, held.viewY, held.viewZ]).toEqual([
      raised.viewX,
      raised.viewY,
      raised.viewZ,
    ]);
  });

  it('returns through the lift path instead of dropping below the camera', () => {
    const liftMidpoint = createEventItemUseSample();
    const returnMidpoint = createEventItemUseSample();
    const returned = createEventItemUseSample();

    sampleEventItemUse('umbrella-overhead', 'umbrella', 0.23, liftMidpoint);
    sampleEventItemOutcome(
      'umbrella-overhead',
      'umbrella',
      'recover',
      0.5,
      returnMidpoint,
    );
    sampleEventItemOutcome(
      'umbrella-overhead',
      'umbrella',
      'recover',
      1,
      returned,
    );

    expect(returnMidpoint.cameraSpaceBlend).toBeCloseTo(liftMidpoint.cameraSpaceBlend);
    expect(returnMidpoint.viewX).toBeCloseTo(liftMidpoint.viewX);
    expect(returnMidpoint.viewY).toBeCloseTo(liftMidpoint.viewY);
    expect(returnMidpoint.viewZ).toBeCloseTo(liftMidpoint.viewZ);
    expect(returnMidpoint.yaw).toBeCloseTo(liftMidpoint.yaw);
    expect(returnMidpoint.pitch).toBeCloseTo(liftMidpoint.pitch);
    expect(returnMidpoint.roll).toBeCloseTo(liftMidpoint.roll);
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.viewY).toBeCloseTo(0);
    expect(returned.itemVisible).toBe(false);
  });
});
