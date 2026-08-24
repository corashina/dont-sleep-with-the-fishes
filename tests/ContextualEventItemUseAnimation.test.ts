// Importance: 8/10. Protects contextual item actions shared across survival events.
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  resolveEventItemUseContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';

const ROUTES = [
  ['shower-night', 'bucket', 'bucket', 'bucket-helmet'],
  ['bad-sleep', 'bucket', 'bucket', 'bucket-helmet'],
  ['eerie-melody', 'bucket', 'bucket', 'bucket-helmet'],
  ['shower-night', 'map', 'map', 'cover-supplies'],
  ['windy-night', 'map', 'map', 'cover-supplies'],
  ['windy-night', 'umbrella', 'umbrella', 'cover-supplies'],
  ['windy-night', 'fishingNet', 'fishingNet', 'net-spread'],
  ['swarm-of-anglerfish', 'fishingNet', 'fishingNet', 'net-spread'],
  ['leak', 'map', 'map', 'map-leak-patch'],
  ['death-stare', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['swarm-of-anglerfish', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['bad-sleep', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['man-in-the-fog', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['ghosts', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['shadow-figure', 'flashlight', 'flashlight', 'flashlight-threat-beam'],
  ['other-people', 'flashlight', 'flashlight', 'flashlight-signal'],
  ['plane', 'flashlight', 'flashlight', 'flashlight-signal'],
] as const satisfies readonly (
  readonly [string, string, ItemId, EventItemUseContext]
)[];

const TRADE_ROUTES = [
  ['night-trader', 'food', 'cannedFood'],
  ['night-trader', 'bait', 'baitTin'],
  ['night-trader', 'map', 'map'],
  ['night-trader', 'umbrella', 'umbrella'],
  ['handyman', 'spyglass', 'spyglass'],
  ['handyman', 'flashlight', 'flashlight'],
  ['handyman', 'flareGun', 'flareGun'],
  ['handyman', 'shotgun', 'shotgun'],
  ['handyman', 'medicalKit', 'medicalKit'],
  ['handyman', 'fishingNet', 'fishingNet'],
  ['handyman', 'bucket', 'bucket'],
  ['handyman', 'ductTape', 'ductTape'],
  ['handyman', 'energyBar', 'energyBar'],
  ['handyman', 'anchor', 'anchor'],
] as const satisfies readonly (readonly [string, string, ItemId])[];

function sample(
  context: EventItemUseContext,
  itemId: ItemId,
  progress: number,
) {
  const output = createEventItemUseSample();
  sampleEventItemUse(context, itemId, progress, output);
  return output;
}

describe('contextual event item-use routing', () => {
  it.each(ROUTES)('routes %s %s to %s', (eventId, choiceId, itemId, context) => {
    expect(resolveEventItemUseContext(eventId, choiceId, itemId)).toBe(context);
  });

  it.each(TRADE_ROUTES)('hands over %s %s', (eventId, choiceId, itemId) => {
    expect(resolveEventItemUseContext(eventId, choiceId, itemId))
      .toBe('trade-handover');
  });
});

describe('contextual event item-use motion', () => {
  it('sets the bucket rim down over the camera', () => {
    const helmet = sample('bucket-helmet', 'bucket', 0.7);

    expect(helmet.cameraSpaceBlend).toBe(1);
    expect(helmet.viewY).toBeGreaterThan(0.2);
    expect(helmet.viewZ).toBeGreaterThan(-0.5);
    expect(Math.abs(helmet.pitch)).toBeGreaterThan(1);
    expect(helmet.targetBlend).toBe(0);
    expect(helmet.itemVisible).toBe(true);
  });

  it('extends a trade item without throwing it', () => {
    const handover = sample('trade-handover', 'shotgun', 0.82);

    expect(handover.targetBlend).toBeGreaterThan(0.8);
    expect(handover.ballisticFlight).toBe(false);
    expect(handover.flightArc).toBe(0);
    expect(handover.itemVisible).toBe(true);

    const transferred = createEventItemUseSample();
    sampleEventItemOutcome(
      'trade-handover',
      'shotgun',
      'depart',
      1,
      transferred,
    );
    expect(transferred.itemVisible).toBe(false);
    expect(transferred.targetBlend).toBe(1);
  });

  it('lays maps and umbrellas over the supply area', () => {
    for (const itemId of ['map', 'umbrella'] as const) {
      const cover = sample('cover-supplies', itemId, 0.7);
      expect(cover.cameraSpaceBlend).toBe(1);
      expect(cover.viewY).toBeLessThan(-0.25);
      expect(Math.abs(cover.roll)).toBeGreaterThan(0.7);
      expect(cover.ballisticFlight).toBe(false);
    }
  });

  it('spreads the net without stretching its model', () => {
    const spread = sample('net-spread', 'fishingNet', 0.7);

    expect(spread.viewY).toBeGreaterThan(-0.1);
    expect(Math.abs(spread.pitch)).toBeGreaterThan(0.7);
    expect(spread.scaleX).toBe(1);
    expect(spread.scaleY).toBe(1);
    expect(spread.scaleZ).toBe(1);
    expect(spread.ballisticFlight).toBe(false);
  });

  it('keeps a threat beam steady and aimed', () => {
    for (const progress of [0.5, 0.62, 0.78]) {
      const beam = sample('flashlight-threat-beam', 'flashlight', progress);
      expect(beam.effectKind).toBe('flashlight');
      expect(beam.primaryEffect).toBeGreaterThan(0.9);
      expect(beam.aimBlend).toBe(1);
    }
    expect(eventItemActionCueProgresses('flashlight-threat-beam')).toHaveLength(1);
  });

  it('keeps the nine-cue Morse signal', () => {
    expect(eventItemActionCueProgresses('flashlight-signal')).toHaveLength(9);
    expect(sample('flashlight-signal', 'flashlight', 0.43).effectKind)
      .toBe('flashlight');
    expect(sample('flashlight-signal', 'flashlight', 0.447).effectKind)
      .toBe('none');
  });

  it('presses the open map against the leak target', () => {
    const patch = sample('map-leak-patch', 'map', 0.76);

    expect(patch.targetBlend).toBeGreaterThan(0.9);
    expect(patch.aimBlend).toBeGreaterThan(0.9);
    expect(patch.ballisticFlight).toBe(false);
    expect(patch.scaleX).toBeGreaterThan(1.2);
    expect(patch.scaleY).toBeGreaterThan(1.2);
    expect(Math.abs(patch.roll)).toBeGreaterThan(0.5);
  });
});
