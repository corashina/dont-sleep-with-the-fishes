// Importance: 5/5. Protects the Leak timing, held poses, and distinct item actions.
import { describe, expect, it } from 'vitest';
import {
  identityLeakSample,
  LEAK_ITEM_DURATION,
  LEAK_REACTION_DURATION,
  LEAK_REVEAL_DURATION,
  sampleLeakItemUse,
  sampleLeakReaction,
  sampleLeakReveal,
} from '../src/survival/events/leakChoreography';

describe('leak choreography', () => {
  it('uses the fixed event durations', () => {
    expect(LEAK_REVEAL_DURATION).toBe(2.4);
    expect(LEAK_ITEM_DURATION).toBe(1.1);
    expect(LEAK_REACTION_DURATION).toBe(1);
  });

  it('starts at exact identity and reveals a held visible leak', () => {
    const sample = identityLeakSample();

    expect(sampleLeakReveal(0, sample)).toBe(true);
    expect(sample).toEqual(identityLeakSample());

    sampleLeakReveal(0.56, sample);
    expect(sample.jetStrength).toBeGreaterThan(0.6);
    expect(sample.cameraPush).toBeGreaterThan(0.08);

    sampleLeakReveal(1, sample);
    expect(sample.jetStrength).toBeGreaterThan(0.6);
    expect(sample.interiorWater).toBeGreaterThan(0);
    expect(sample.wetBand).toBe(1);
  });

  it('gives each item a distinct action and restores its pose', () => {
    const sample = identityLeakSample();

    expect(sampleLeakItemUse('ductTape', 0.7, sample)).toBe(true);
    expect(sample.effectKind).toBe('press-patch');

    expect(sampleLeakItemUse('bucket', 0.7, sample)).toBe(true);
    expect(sample.effectKind).toBe('bail-water');

    expect(sampleLeakItemUse('map', 0.7, sample)).toBe(true);
    expect(sample.effectKind).toBe('wedge-map');

    sampleLeakItemUse('bucket', 1, sample);
    expect(sample.x).toBe(0);
    expect(sample.y).toBe(0);
    expect(sample.z).toBe(0);
    expect(sample.yaw).toBe(0);
    expect(sample.pitch).toBe(0);
    expect(sample.roll).toBe(0);
    expect(sample.scaleX).toBe(1);
    expect(sample.scaleY).toBe(1);
    expect(sample.scaleZ).toBe(1);
  });

  it('holds safe, broken, and lost outcomes after the reaction', () => {
    const sample = identityLeakSample();

    sampleLeakReaction('safe', 0, sample);
    expect(sample).toEqual(identityLeakSample());

    sampleLeakReaction('safe', 1, sample);
    expect(sample.jetStrength).toBeLessThan(0.2);
    expect(sample.dripStrength).toBeGreaterThan(0.6);

    sampleLeakReaction('broken-item', 1, sample);
    expect(sample.scaleY).toBeLessThan(0.8);
    expect(sample.roll).not.toBe(0);

    sampleLeakReaction('lost-item', 1, sample);
    expect(sample.x).toBeGreaterThan(2);
    expect(sample.roll).not.toBe(0);
  });

  it('combines hull damage with an exact changed-item state', () => {
    const sample = identityLeakSample();
    const reaction = {
      safe: false,
      brokenItem: true,
      hullDamage: true,
      lostItem: false,
    };

    sampleLeakReaction(reaction, 0.46, sample);

    expect(sample.boatKick).not.toBe(0);
    expect(sample.surgeStrength).toBeGreaterThan(0.5);
    expect(sample.scaleY).toBeLessThan(1);
  });
});
