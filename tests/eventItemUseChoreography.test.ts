import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemUseDuration,
  resolveEventItemUseContext,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
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

describe('event item use choreography', () => {
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
      ['harpoonGun', 'harpoonGun', 'harpoon-shot'],
    ] as const;

    for (const [itemId, choiceId, expected] of cases) {
      expect(resolveEventItemUseContext('event', choiceId, itemId)).toBe(expected);
    }
  });

  it('resolves event-specific use contexts', () => {
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
  });

  it('keeps the item in camera space through the shared pickup and hold stages', () => {
    const contexts: readonly EventItemUseContext[] = [
      'throw-target', 'tape-stretch', 'compass-search', 'map-read',
      'binocular-look', 'net-throw', 'bucket-scoop', 'bucket-cover',
      'flare-target', 'flare-sky', 'anchor-drop', 'umbrella-overhead',
      'umbrella-shield', 'flashlight-flash', 'harpoon-shot',
    ];

    for (const context of contexts) {
      const start = sampleAt(context, 0);
      const lift = sampleAt(context, 0.12);
      const hold = sampleAt(context, 0.3);
      const action = sampleAt(context, 0.65);
      const end = sampleAt(context, 1);

      expect(start.cameraSpaceBlend).toBe(0);
      expect(lift.cameraSpaceBlend).toBeGreaterThan(0);
      expect(hold.cameraSpaceBlend).toBeGreaterThan(0.9);
      expect(hold.viewZ).toBeLessThan(0);
      expect(Number.isFinite(action.yaw)).toBe(true);
      expect(Number.isFinite(end.yaw)).toBe(true);
      expect(eventItemUseDuration(context)).toBeGreaterThan(0);
    }

    expect(sampleAt('binocular-look', 0.65).fovScale).toBeLessThan(1);
    expect(sampleAt('compass-search', 0.65).cameraYaw).not.toBe(0);
  });

  it('uses distinct throw rolls for rigid, soft, and ring items', () => {
    const rigid = sampleItemAt('throw-target', 'cannedFood', 0.65).roll;
    const soft = sampleItemAt('throw-target', 'energyBar', 0.65).roll;
    const ring = sampleItemAt('throw-target', 'swimRing', 0.65).roll;

    expect(rigid).not.toBe(soft);
    expect(soft).not.toBe(ring);
  });
});
