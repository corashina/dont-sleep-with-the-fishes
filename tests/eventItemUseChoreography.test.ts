import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  resolveEventItemUseContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
  type EventItemDisposition,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';
import type { ItemId } from '../src/game/ItemState';

const sampleAt = (context: EventItemUseContext, progress: number) => {
  const sample = createEventItemUseSample();
  sampleEventItemUse(context, progress, sample);
  return sample;
};

const sampleItemAt = (
  context: EventItemUseContext,
  itemId: ItemId,
  progress: number,
) => {
  const sample = createEventItemUseSample();
  sampleEventItemUse(context, itemId, progress, sample);
  return sample;
};

const sampleOutcomeAt = (
  context: EventItemUseContext,
  itemId: ItemId,
  disposition: EventItemDisposition,
  progress: number,
) => {
  const sample = createEventItemUseSample();
  sampleEventItemOutcome(context, itemId, disposition, progress, sample);
  return sample;
};

describe('event item use choreography', () => {
  it('maps item profiles to their authored hold zones and aim directions', () => {
    expect(eventItemMotionProfile('flashlight')).toMatchObject({
      holdZone: 'one-hand',
      view: [0.32, -0.38, -0.68],
      aim: 'entity',
      forward: [0, 0, -1],
    });
    expect(eventItemMotionProfile('shotgun')).toMatchObject({
      holdZone: 'large',
      view: [0.08, -0.42, -0.85],
      aim: 'entity',
      forward: [0, 0, -1],
    });
    expect(eventItemMotionProfile('map')).toMatchObject({
      holdZone: 'reading',
      view: [0, -0.32, -0.72],
      aim: 'none',
    });
  });

  it('holds the use pose, then stows or departs it continuously', () => {
    const start = sampleItemAt('flashlight-flash', 'flashlight', 0);
    const held = sampleItemAt('flashlight-flash', 'flashlight', 1);
    expect(start.cameraSpaceBlend).toBe(0);
    expect(held.cameraSpaceBlend).toBe(1);
    expect(held.viewY).toBeLessThan(-0.25);
    expect(held.scaleX).toBe(1);
    expect(held.scaleY).toBe(1);
    expect(held.scaleZ).toBe(1);
    expect(held.aimBlend).toBeGreaterThan(0.95);

    const stowed = sampleOutcomeAt(
      'flashlight-flash', 'flashlight', 'recover', 1,
    );
    expect(stowed.viewY).toBeLessThan(-1.1);
    expect(stowed.itemVisible).toBe(false);

    const departed = sampleOutcomeAt(
      'throw-target', 'cannedFood', 'depart', 1,
    );
    expect(departed.targetBlend).toBe(1);
    expect(departed.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('cannedFood', 'depart')).toBeGreaterThan(0);
  });

  it('resolves each approved item to its base use context', () => {
    const cases = [
      ['cannedFood', 'food', 'throw-target'],
      ['baitTin', 'bait', 'throw-target'],
      ['medicalKit', 'medicalKit', 'throw-target'],
      ['energyBar', 'energyBar', 'throw-target'],
      ['swimRing', 'swimRing', 'throw-target'],
      ['bottledPaper', 'bottledPaper', 'throw-target'],
      ['ductTape', 'ductTape', 'tape-stretch'],
      ['compass', 'compass', 'compass-search'],
      ['map', 'map', 'map-read'],
      ['spyglass', 'spyglass', 'binocular-look'],
      ['fishingNet', 'fishingNet', 'net-throw'],
      ['flashlight', 'flashlight', 'flashlight-flash'],
      ['shotgun', 'shotgun', 'shotgun-fire'],
    ] as const;

    for (const [itemId, choiceId, expected] of cases) {
      expect(resolveEventItemUseContext('event', choiceId, itemId)).toBe(expected);
    }
  });

  it('resolves event-specific use contexts', () => {
    expect(resolveEventItemUseContext('leak', 'bucket', 'bucket'))
      .toBe('bucket-scoop');
    expect(resolveEventItemUseContext('school-of-fish', 'bucket', 'bucket'))
      .toBe('bucket-scoop');
    expect(resolveEventItemUseContext('eerie-melody', 'bucket', 'bucket'))
      .toBe('bucket-cover');
    expect(resolveEventItemUseContext('shower-night', 'umbrella', 'umbrella'))
      .toBe('umbrella-overhead');
    expect(resolveEventItemUseContext('death-stare', 'umbrella', 'umbrella'))
      .toBe('umbrella-shield');
    expect(resolveEventItemUseContext('other-people', 'flareGun', 'flareGun'))
      .toBe('flare-sky');
    expect(resolveEventItemUseContext('ghosts', 'flareGun', 'flareGun'))
      .toBe('flare-target');
    expect(resolveEventItemUseContext('whirlpool', 'anchor', 'anchor'))
      .toBe('anchor-drop');
    expect(resolveEventItemUseContext('death-stare', 'cannedFood', 'cannedFood'))
      .toBe('throw-target');
    expect(resolveEventItemUseContext('swarm-of-anglerfish', 'baitTin', 'baitTin'))
      .toBe('throw-target');
  });

  it('uses the neutral context for catalog choices without a use effect', () => {
    const cases = [
      ['flowers', 'bucket', 'bucket'],
      ['night-trader', 'umbrella', 'umbrella'],
      ['shadow-figure', 'flareGun', 'flareGun'],
      ['handyman', 'flareGun', 'flareGun'],
      ['handyman', 'scubaSet', 'scubaSet'],
      ['handyman', 'bucket', 'bucket'],
      ['handyman', 'anchor', 'anchor'],
    ] as const;

    for (const [eventId, choiceId, itemId] of cases) {
      expect(resolveEventItemUseContext(eventId, choiceId, itemId)).toBe('base');
    }
  });

  it('keeps the item in camera space through the shared pickup and hold stages', () => {
    const contexts: readonly EventItemUseContext[] = [
      'base', 'throw-target', 'tape-stretch', 'compass-search', 'map-read',
      'binocular-look', 'net-throw', 'bucket-scoop', 'bucket-cover',
      'flare-target', 'flare-sky', 'anchor-drop', 'umbrella-overhead',
      'umbrella-shield', 'flashlight-flash', 'shotgun-fire',
    ];

    for (const context of contexts) {
      const start = sampleAt(context, 0);
      const lift = sampleAt(context, 0.12);
      const hold = sampleAt(context, 0.3);
      const action = sampleAt(context, 0.65);
      const end = sampleAt(context, 1);

      expect(start.cameraSpaceBlend).toBe(0);
      expect(lift.cameraSpaceBlend).toBeGreaterThan(0);
      expect(lift.viewZ).toBeLessThanOrEqual(-0.6);
      expect(hold.cameraSpaceBlend).toBeGreaterThan(0.9);
      expect(hold.viewZ).toBeGreaterThanOrEqual(-0.85);
      expect(hold.viewZ).toBeLessThan(-0.6);
      expect(Number.isFinite(action.yaw)).toBe(true);
      expect(Number.isFinite(end.yaw)).toBe(true);
      expect(eventItemUseDuration(context)).toBeGreaterThan(0);
    }

    expect(sampleAt('binocular-look', 0.65).fovScale).toBeLessThan(1);
    expect(sampleAt('compass-search', 0.65).cameraYaw).not.toBe(0);
    expect(sampleAt('flare-target', 0.3).viewY).toBeLessThanOrEqual(0.12);
    expect(sampleAt('umbrella-overhead', 0.3).viewY).toBeLessThanOrEqual(0.12);
  });

  it('uses distinct throw rolls for rigid, soft, and ring items', () => {
    const rigid = sampleItemAt('throw-target', 'cannedFood', 0.65).roll;
    const soft = sampleItemAt('throw-target', 'energyBar', 0.65).roll;
    const ring = sampleItemAt('throw-target', 'swimRing', 0.65).roll;

    expect(rigid).not.toBe(soft);
    expect(soft).not.toBe(ring);
  });

  it('keeps thrown and cast items in front of the camera during use', () => {
    expect(sampleItemAt('throw-target', 'cannedFood', 0.7).viewZ)
      .toBeLessThan(-0.35);
    expect(sampleItemAt('net-throw', 'fishingNet', 0.7).viewZ)
      .toBeLessThan(-0.5);
  });

  it('carries the anchor over starboard before lowering it', () => {
    const rail = sampleItemAt('anchor-drop', 'anchor', 0.56);
    const lowered = sampleItemAt('anchor-drop', 'anchor', 0.72);

    expect(rail.viewX).toBeGreaterThan(1);
    expect(lowered.viewX).toBeGreaterThan(1);
    expect(lowered.viewY).toBeLessThan(rail.viewY - 0.6);
    expect(lowered.scaleY).toBe(1);
  });

  it('uses a brief shotgun smoke pulse', () => {
    expect(sampleAt('shotgun-fire', 0.4).effectKind).toBe('none');
    expect(sampleAt('shotgun-fire', 0.52).effectKind).toBe('shotgun-smoke');
    expect(sampleAt('shotgun-fire', 0.7).effectKind).toBe('none');
  });
});
