// Importance: 4/5. Protects event action choreography mappings.
import { describe, expect, it } from 'vitest';
import {
  sampleWeatherItemUse,
  sampleWeatherReaction,
  sampleWeatherReveal,
  weatherItemUseDuration,
  weatherReactionDuration,
  weatherRevealDuration,
  type WeatherItemSample,
  type WeatherReactionSample,
  type WeatherRevealSample,
} from '../src/survival/weatherEventChoreography';

const reveal = (): WeatherRevealSample => ({
  cameraX: 0, cameraY: 0, cameraZ: 0,
  cameraYaw: 0, cameraPitch: 0, cameraRoll: 0,
  supplyRoll: 0, supplyLift: 0,
  figureVisibility: 0, figureDistance: 0,
  lightningEmphasis: 0,
});

const item = (): WeatherItemSample => ({
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1, effect: 0,
  cameraYaw: 0, cameraPush: 0, supplyRoll: 0, effectKind: 'none',
});

const reaction = (): WeatherReactionSample => ({
  actorX: 0, actorY: 0, actorZ: 0,
  actorYaw: 0, actorPitch: 0, actorRoll: 0,
  actorScaleX: 1, actorScaleY: 1, actorScaleZ: 1,
  actorEffect: 0,
  cameraX: 0, cameraY: 0, cameraZ: 0,
  cameraYaw: 0, cameraPitch: 0, cameraRoll: 0,
  effectKind: 'none',
});

const hasItemMotion = (sample: WeatherItemSample): boolean => (
  Math.abs(sample.x) > 0.01 || Math.abs(sample.y) > 0.01 || Math.abs(sample.z) > 0.01
  || Math.abs(sample.yaw) > 0.01 || Math.abs(sample.pitch) > 0.01 || Math.abs(sample.roll) > 0.01
  || Math.abs(sample.scaleX - 1) > 0.01 || Math.abs(sample.scaleY - 1) > 0.01
  || Math.abs(sample.scaleZ - 1) > 0.01 || sample.effect > 0.01
  || Math.abs(sample.cameraYaw) > 0.01 || Math.abs(sample.cameraPush) > 0.01
  || Math.abs(sample.supplyRoll) > 0.01
);

const supportedPairs = [
  ['shower-night', 'bucket'], ['shower-night', 'umbrella'], ['shower-night', 'map'],
  ['windy-night', 'fishingNet'], ['windy-night', 'map'], ['windy-night', 'umbrella'],
  ['thunderstorm', 'anchor'], ['thunderstorm', 'bucket'], ['thunderstorm', 'umbrella'],
  ['restless-waves', 'anchor'], ['restless-waves', 'swimRing'],
  ['man-in-the-fog', 'compass'], ['man-in-the-fog', 'spyglass'], ['man-in-the-fog', 'flashlight'],
  ['bad-sleep', 'bucket'], ['bad-sleep', 'flashlight'],
  ['bad-sleep', 'swimRing'], ['bad-sleep', 'umbrella'],
] as const;

const cameraOnlyEvents = ['shower-night', 'windy-night', 'thunderstorm'] as const;
const cameraOnlyPairs = supportedPairs.filter(([eventId]) => (
  cameraOnlyEvents.includes(eventId as typeof cameraOnlyEvents[number])
));
const physicalPairs = supportedPairs.filter(([eventId]) => (
  !cameraOnlyEvents.includes(eventId as typeof cameraOnlyEvents[number])
));

describe('weather event choreography', () => {
  it.each([
    'shower-night', 'windy-night', 'thunderstorm',
    'restless-waves', 'man-in-the-fog', 'bad-sleep',
  ])('restores %s reveal to identity', (eventId) => {
    const output = reveal();
    expect(weatherRevealDuration(eventId)).toBeGreaterThanOrEqual(3.4);
    expect(sampleWeatherReveal(eventId, 1, output)).toBe(true);
    expect(output).toEqual(reveal());
  });

  it('shows and then hides the fog figure before reveal completion', () => {
    const output = reveal();
    sampleWeatherReveal('man-in-the-fog', 0.58, output);
    expect(output.figureVisibility).toBeGreaterThan(0.7);
    sampleWeatherReveal('man-in-the-fog', 0.86, output);
    expect(output.figureVisibility).toBe(0);
  });

  it('holds the Bad Sleep reveal for 3.4 seconds', () => {
    expect(weatherRevealDuration('bad-sleep')).toBe(3.4);
  });

  it.each([
    'shower-night', 'windy-night', 'thunderstorm',
    'restless-waves', 'man-in-the-fog', 'bad-sleep',
  ])('%s reveal has visible middle motion and eases home before completion', (eventId) => {
    const middle = reveal();
    const nearEnd = reveal();
    sampleWeatherReveal(eventId, 0.5, middle);
    sampleWeatherReveal(eventId, 0.99, nearEnd);
    expect(Object.values(middle).some((value) => Math.abs(value) > 0.01)).toBe(true);
    expect(Object.values(nearEnd).every((value) => Math.abs(value) < 0.02)).toBe(true);
  });

  it.each([
    'shower-night', 'windy-night', 'thunderstorm',
    'restless-waves', 'man-in-the-fog', 'bad-sleep',
  ])('%s reveal enters continuously from exact identity', (eventId) => {
    const start = reveal();
    const nearStart = reveal();
    sampleWeatherReveal(eventId, 0, start);
    sampleWeatherReveal(eventId, 0.00001, nearStart);
    expect(start).toEqual(reveal());
    expect(
      Object.values(nearStart).every((value) => Math.abs(value) < 0.000001),
    ).toBe(true);
  });

  it('rejects unsupported physical pairs', () => {
    expect(weatherItemUseDuration('shower-night', 'anchor')).toBeNull();
    expect(sampleWeatherItemUse('shower-night', 'anchor', 0.5, item())).toBe(false);
  });

  it.each(supportedPairs)('supports %s with %s', (eventId, choiceId) => {
    const start = item();
    const output = item();
    const midpoint = item();
    expect(weatherItemUseDuration(eventId, choiceId)).toBeGreaterThanOrEqual(1.1);
    expect(sampleWeatherItemUse(eventId, choiceId, 0, start)).toBe(true);
    expect(start).toEqual(item());
    expect(sampleWeatherItemUse(eventId, choiceId, 0.5, midpoint)).toBe(true);
    expect(hasItemMotion(midpoint)).toBe(true);
    expect(sampleWeatherItemUse(eventId, choiceId, 1, output)).toBe(true);
    expect(output).toEqual(item());
  });

  it('assigns a distinct event-specific command to every physical pair', () => {
    const commands = physicalPairs.map(([eventId, choiceId]) => {
      const output = item();
      sampleWeatherItemUse(eventId, choiceId, 0.5, output);
      expect(output.effectKind).not.toBe('none');
      return output.effectKind;
    });
    expect(new Set(commands).size).toBe(physicalPairs.length);
  });

  it.each(cameraOnlyPairs)('moves only the camera for %s with %s', (eventId, choiceId) => {
    const output = item();
    sampleWeatherItemUse(eventId, choiceId, 0.5, output);

    expect(output.effectKind).toBe('none');
    expect(output.effect).toBe(0);
    expect(output.supplyRoll).toBe(0);
    expect(output.x).toBe(0);
    expect(output.y).toBe(0);
    expect(output.z).toBe(0);
    expect(output.yaw).toBe(0);
    expect(output.pitch).toBe(0);
    expect(output.roll).toBe(0);
    expect(Math.abs(output.cameraYaw) + Math.abs(output.cameraPush)).toBeGreaterThan(0.01);
  });

  it('assigns each Bad Sleep comfort object a distinct reaction', () => {
    const effects = ['bucket', 'flashlight', 'swimRing', 'umbrella'].map((choiceId) => {
      const output = item();
      sampleWeatherItemUse('bad-sleep', choiceId, 0.5, output);
      return output.effectKind;
    });
    expect(new Set(effects).size).toBe(effects.length);
  });

  it('lifts near-deck Bad Sleep props into the lower dream gap', () => {
    const bucket = item();
    const umbrella = item();

    sampleWeatherItemUse('bad-sleep', 'bucket', 0.5, bucket);
    sampleWeatherItemUse('bad-sleep', 'umbrella', 0.5, umbrella);

    expect(bucket.y).toBeGreaterThanOrEqual(0.4);
    expect(bucket.y).toBeLessThanOrEqual(0.48);
    expect(umbrella.y).toBeGreaterThanOrEqual(0.62);
    expect(umbrella.y).toBeLessThanOrEqual(0.7);
  });

  it.each([
    ['bad-sleep', 'umbrella', 'broken', 'bad-sleep-umbrella-collapse'],
  ] as const)(
    'keeps the final %s %s result pose and effect',
    (eventId, choiceId, condition, effectKind) => {
      const output = reaction();

      sampleWeatherReaction(eventId, choiceId, 0, 1, condition, 0, 1, output);

      expect(output.effectKind).toBe(effectKind);
      expect(output.actorEffect).toBeGreaterThan(0);
      expect(
        Math.abs(output.actorX)
        + Math.abs(output.actorY)
        + Math.abs(output.actorRoll)
        + Math.abs(output.actorPitch)
        + Math.abs(output.actorScaleY - 1),
      ).toBeGreaterThan(0.04);
    },
  );

  it.each([
    ['shower-night', 'bucket', null, 0],
    ['windy-night', 'sleep', 'broken', -20],
    ['thunderstorm', 'anchor', null, 0],
    ['thunderstorm', 'sleep', 'lost', -40],
  ] as const)(
    'keeps %s %s reactions off every actor',
    (eventId, choiceId, condition, hullDelta) => {
      const output = reaction();
      sampleWeatherReaction(eventId, choiceId, 0, 1, condition, hullDelta, 0.45, output);

      expect(output.actorX).toBe(0);
      expect(output.actorY).toBe(0);
      expect(output.actorZ).toBe(0);
      expect(output.actorYaw).toBe(0);
      expect(output.actorPitch).toBe(0);
      expect(output.actorRoll).toBe(0);
      expect(output.actorScaleX).toBe(1);
      expect(output.actorScaleY).toBe(1);
      expect(output.actorScaleZ).toBe(1);
      expect(
        Math.abs(output.cameraX) + Math.abs(output.cameraY)
        + Math.abs(output.cameraYaw) + Math.abs(output.cameraPitch)
        + Math.abs(output.cameraRoll),
      ).toBeGreaterThan(0.01);
    },
  );

  it('gives Thunderstorm one main kick and smaller settle', () => {
    const impact = reaction();
    const settle = reaction();
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 0, null, -40, 0.38, impact);
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 0, null, -40, 0.72, settle);
    expect(Math.abs(impact.cameraRoll)).toBeGreaterThan(Math.abs(settle.cameraRoll));
  });

  it('uses a Thunderstorm camera beat without hull damage', () => {
    const output = reaction();
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 0, null, 0, 0.38, output);
    expect(Math.abs(output.cameraX)).toBeGreaterThan(0);
    expect(output.cameraY).toBeCloseTo(0);
    expect(output.cameraPitch).toBeCloseTo(0);
    expect(Math.abs(output.cameraRoll)).toBeGreaterThan(0);
  });

  it('scales the Thunderstorm hull kick with damage magnitude', () => {
    const light = reaction();
    const heavy = reaction();
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 0, null, -10, 0.38, light);
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 0, null, -40, 0.38, heavy);
    expect(Math.abs(heavy.cameraRoll)).toBeGreaterThan(Math.abs(light.cameraRoll));
  });

  it('keeps only the Thunderstorm lightning effect', () => {
    const shower = reaction();
    const storm = reaction();

    sampleWeatherReaction('shower-night', 'bucket', 0, 1, null, 0, 0.38, shower);
    sampleWeatherReaction('thunderstorm', 'sleep', 0, 1, 'lost', 0, 0.1, storm);

    expect(shower.effectKind).toBe('none');
    expect(shower.actorEffect).toBe(0);
    expect(storm.effectKind).toBe('storm-loss-lightning');
    expect(storm.actorEffect).toBeGreaterThan(0);
  });

  it('authors bearing, optical push, and wave-anchor stabilization as named beats', () => {
    const compass = item();
    const spyglass = item();
    const earlyAnchor = item();
    const heldAnchor = item();
    sampleWeatherItemUse('man-in-the-fog', 'compass', 0.52, compass);
    sampleWeatherItemUse('man-in-the-fog', 'spyglass', 0.52, spyglass);
    sampleWeatherItemUse('restless-waves', 'anchor', 0.24, earlyAnchor);
    sampleWeatherItemUse('restless-waves', 'anchor', 0.62, heldAnchor);

    expect(compass.effectKind).toBe('compass-bearing');
    expect(Math.abs(compass.cameraYaw)).toBeGreaterThan(0.04);
    expect(spyglass.effectKind).toBe('spyglass-optical-push');
    expect(spyglass.cameraPush).toBeGreaterThan(0.1);
    expect(earlyAnchor.effectKind).toBe('wave-anchor-stabilize');
    expect(Math.abs(heldAnchor.supplyRoll)).toBeLessThan(
      Math.abs(earlyAnchor.supplyRoll),
    );
  });

  it('distinguishes repeated physical items by event semantics', () => {
    for (const choiceId of ['bucket', 'umbrella', 'anchor'] as const) {
      const matching = supportedPairs.filter(([, candidate]) => candidate === choiceId);
      const samples = matching.map(([eventId]) => {
        const output = item();
        sampleWeatherItemUse(eventId, choiceId, 0.5, output);
        return output;
      });
      expect(new Set(samples.map((sample) => JSON.stringify(sample))).size).toBe(samples.length);
    }
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'rejects prototype key %s as an event or choice',
    (prototypeKey) => {
      expect(weatherRevealDuration(prototypeKey)).toBeNull();
      expect(sampleWeatherReveal(prototypeKey, 0.5, reveal())).toBe(false);
      expect(weatherItemUseDuration('shower-night', prototypeKey)).toBeNull();
      expect(sampleWeatherItemUse('shower-night', prototypeKey, 0.5, item())).toBe(false);
    },
  );

  it.each([
    ['windy-night', 'map'], ['thunderstorm', 'anchor'],
    ['restless-waves', 'anchor'], ['man-in-the-fog', 'flashlight'],
  ])('%s %s returns its borrowed transform before completion', (eventId, choiceId) => {
    const nearEnd = item();
    sampleWeatherItemUse(eventId, choiceId, 0.99, nearEnd);
    expect(Math.abs(nearEnd.x)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.y)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.z)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.yaw)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.pitch)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.roll)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleX - 1)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleY - 1)).toBeLessThan(0.02);
    expect(Math.abs(nearEnd.scaleZ - 1)).toBeLessThan(0.02);
  });
});
