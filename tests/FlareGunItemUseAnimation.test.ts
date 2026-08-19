// Importance: 8/10 (scaled from 4/5). Protects the flare gun hold, barrel direction, and fixed firing position.
import { Euler, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

function sample(progress: number) {
  const output = createEventItemUseSample();
  sampleEventItemUse('flare-sky', 'flareGun', progress, output);
  return output;
}

describe('flare gun item-use animation', () => {
  it('turns into the firing grip during the lift', () => {
    const starting = sample(0.08);
    const lifting = sample(0.16);
    const raised = sample(0.3);

    expect(starting.roll).toBe(0);
    expect(lifting.roll).toBeGreaterThan(0);
    expect(lifting.roll).toBeLessThan(raised.roll);
    expect(lifting.pitch).toBeLessThan(0);
  });

  it('uses the flashlight hold without moving right after pickup', () => {
    const profile = eventItemMotionProfile('flareGun');
    const raised = sample(0.42);
    const firing = sample(0.7);

    expect(profile.view).toEqual([0.3, -0.3, -0.78]);
    expect(profile.aim).toBe('none');
    expect(profile.forward).toEqual([1, 0, 0]);
    expect([firing.viewX, firing.viewY, firing.viewZ]).toEqual([
      raised.viewX,
      raised.viewY,
      raised.viewZ,
    ]);
  });

  it('raises the barrel toward the ocean ahead of the player', () => {
    const firing = sample(0.7);
    const targetFiring = createEventItemUseSample();
    sampleEventItemUse('flare-target', 'flareGun', 0.7, targetFiring);
    expect(targetFiring).toEqual(firing);

    const storageRotation = boatSupplyTransform('flareGun', 0).rotation;
    const firingRotation = new Quaternion().setFromEuler(storageRotation)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), firing.yaw))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), firing.pitch))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), firing.roll));
    const barrelDirection = new Vector3(1, 0, 0)
      .applyEuler(new Euler(...ITEM_MODEL_SPECS.flareGun.rotation))
      .applyQuaternion(firingRotation)
      .normalize();

    expect(Math.abs(barrelDirection.x)).toBeLessThan(0.02);
    expect(barrelDirection.y).toBeGreaterThan(0.25);
    expect(barrelDirection.y).toBeLessThan(0.4);
    expect(barrelDirection.z).toBeLessThan(-0.9);
  });

  it('starts the sound, recoil, and projectile at the shot cue', () => {
    const beforeShot = sample(0.459);
    const shot = sample(0.46);
    const recoil = sample(0.52);

    expect(eventItemActionCueProgresses('flare-sky')).toEqual([0.46, 0.54]);
    expect(beforeShot.effectKind).toBe('none');
    expect(shot.effectKind).toBe('flare');
    expect(shot.effectTravel).toBe(0);
    expect(recoil.viewZ).toBeGreaterThan(shot.viewZ);
    expect(recoil.secondaryEffect).toBeGreaterThan(0);
  });

  it('flies on an arc and disappears when it reaches the ocean', () => {
    const midFlight = sample(0.69);
    const impact = sample(0.92);

    expect(midFlight.effectKind).toBe('flare');
    expect(midFlight.effectTravel).toBeCloseTo(0.5);
    expect(midFlight.effectArc).toBeCloseTo(1);
    expect(impact.effectKind).toBe('none');
    expect(impact.primaryEffect).toBe(0);
  });

  it('returns through the lift path instead of dropping below the camera', () => {
    const raised = sample(1);
    const liftMidpoint = sample(0.21);
    const returnStart = createEventItemUseSample();
    const returnMidpoint = createEventItemUseSample();
    const returned = createEventItemUseSample();

    sampleEventItemOutcome('flare-sky', 'flareGun', 'depart', 0, returnStart);
    sampleEventItemOutcome('flare-sky', 'flareGun', 'depart', 0.5, returnMidpoint);
    sampleEventItemOutcome('flare-sky', 'flareGun', 'depart', 1, returned);

    expect(returnStart).toMatchObject({
      cameraSpaceBlend: raised.cameraSpaceBlend,
      viewX: raised.viewX,
      viewY: raised.viewY,
      viewZ: raised.viewZ,
      yaw: raised.yaw,
      pitch: raised.pitch,
      roll: raised.roll,
    });
    expect(returnMidpoint).toMatchObject({
      cameraSpaceBlend: liftMidpoint.cameraSpaceBlend,
      viewX: liftMidpoint.viewX,
      viewY: liftMidpoint.viewY,
      viewZ: liftMidpoint.viewZ,
      yaw: liftMidpoint.yaw,
      pitch: liftMidpoint.pitch,
      roll: liftMidpoint.roll,
    });
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.viewY).toBeCloseTo(0);
    expect(returned.itemVisible).toBe(false);
  });
});
