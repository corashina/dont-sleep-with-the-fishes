// Importance: 4/5. Protects flashlight hold, aim, beam, and reverse stow motion.
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';

describe('flashlight item-use animation', () => {
  it('uses an FPS hold and the model lens axis for horizontal aiming', () => {
    const profile = eventItemMotionProfile('flashlight');

    expect(profile.view).toEqual([0.3, -0.3, -0.78]);
    expect(profile.aim).toBe('horizontal-entity');
    expect(profile.forward).toEqual([-1, 0, 0]);
  });

  it('aligns the beam with the flashlight lens', () => {
    const effects = new EventItemEffects();
    const beam = effects.root.getObjectByName('event-item-flashlight-cone')!;
    const beamDirection = new Vector3(0, -1, 0)
      .applyQuaternion(beam.getWorldQuaternion(new Quaternion()))
      .normalize();

    expect(beamDirection.x).toBeCloseTo(-1);
    expect(beamDirection.y).toBeCloseTo(0);
    expect(beamDirection.z).toBeCloseTo(0);
    expect(beam.position.x).toBeLessThan(-1);
    effects.dispose();
  });

  it('returns through the lift path after a recovered use', () => {
    const raised = createEventItemUseSample();
    const returning = createEventItemUseSample();
    const stowed = createEventItemUseSample();

    sampleEventItemUse('flashlight-flash', 'flashlight', 1, raised);
    sampleEventItemOutcome(
      'flashlight-flash',
      'flashlight',
      'recover',
      0,
      returning,
    );
    sampleEventItemOutcome(
      'flashlight-flash',
      'flashlight',
      'recover',
      1,
      stowed,
    );

    expect(returning).toMatchObject({
      cameraSpaceBlend: raised.cameraSpaceBlend,
      viewX: raised.viewX,
      viewY: raised.viewY,
      viewZ: raised.viewZ,
      aimBlend: raised.aimBlend,
    });
    expect(stowed.cameraSpaceBlend).toBe(0);
    expect(stowed.viewX).toBe(0);
    expect(stowed.viewY).toBeCloseTo(0);
    expect(stowed.viewZ).toBe(-0.64);
    expect(stowed.aimBlend).toBe(0);
    expect(stowed.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('flashlight', 'recover'))
      .toBeLessThan(eventItemUseDuration('flashlight-flash'));
  });
});
