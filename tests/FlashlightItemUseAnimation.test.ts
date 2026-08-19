// Importance: 8/10 (scaled from 4/5). Protects flashlight hold, aim, beam, and reverse stow motion.
import { Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
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
    expect(profile.forward).toEqual([1, 0, 0]);
  });

  it('aligns the beam with the flashlight lens', () => {
    const effects = new EventItemEffects();
    const beam = effects.root.getObjectByName('event-item-flashlight-cone') as Mesh;
    const beamDirection = new Vector3(0, -1, 0)
      .applyQuaternion(beam.getWorldQuaternion(new Quaternion()))
      .normalize();

    expect(beamDirection.x).toBeCloseTo(1);
    expect(beamDirection.y).toBeCloseTo(0);
    expect(beamDirection.z).toBeCloseTo(0);
    expect(beam.position.x).toBeGreaterThan(1);
    effects.dispose();
  });

  it('keeps its raised position and only changes rotation while signalling', () => {
    const lit = createEventItemUseSample();
    const unlit = createEventItemUseSample();

    sampleEventItemUse('flashlight-flash', 'flashlight', 0.43, lit);
    sampleEventItemUse('flashlight-flash', 'flashlight', 0.447, unlit);

    expect([lit.viewX, lit.viewY, lit.viewZ]).toEqual([
      unlit.viewX,
      unlit.viewY,
      unlit.viewZ,
    ]);
    expect(lit.roll).not.toBeCloseTo(unlit.roll);
  });

  it('signals SOS with nine keyed light and sound cues', () => {
    const sample = createEventItemUseSample();
    const cueProgresses = eventItemActionCueProgresses('flashlight-flash');

    expect(cueProgresses).toHaveLength(9);
    for (const progress of cueProgresses) {
      sampleEventItemUse('flashlight-flash', 'flashlight', progress + 0.006, sample);
      expect(sample.effectKind).toBe('flashlight');
      expect(sample.primaryEffect).toBeGreaterThan(0);
    }

    sampleEventItemUse('flashlight-flash', 'flashlight', 0.447, sample);
    expect(sample.effectKind).toBe('none');
    expect(sample.primaryEffect).toBe(0);
  });

  it('uses a long transparent beam', () => {
    const effects = new EventItemEffects();
    const actor = new Object3D();
    const beam = effects.root.getObjectByName('event-item-flashlight-cone') as Mesh;
    const sample = createEventItemUseSample();
    sampleEventItemUse('flashlight-flash', 'flashlight', 0.43, sample);

    effects.apply(sample, actor);
    beam.geometry.computeBoundingBox();
    const size = beam.geometry.boundingBox!.getSize(new Vector3());

    expect(size.y).toBeCloseTo(4.2);
    expect((beam.material as MeshBasicMaterial).opacity).toBeCloseTo(0.16);
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
