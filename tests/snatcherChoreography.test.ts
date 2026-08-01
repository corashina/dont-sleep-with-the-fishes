// Importance: 5/5. Protects Tentacle Attack timing, target theft, and item actions.
import { describe, expect, it } from 'vitest';
import {
  identitySnatcherSample,
  sampleSnatcherItemUse,
  sampleSnatcherReaction,
  sampleSnatcherReveal,
  SNATCHER_ITEM_DURATION,
  SNATCHER_REACTION_DURATION,
  SNATCHER_REVEAL_DURATION,
} from '../src/survival/events/snatcherChoreography';

describe('tentacle attack choreography', () => {
  it('uses the fixed event durations', () => {
    expect(SNATCHER_REVEAL_DURATION).toBe(2.5);
    expect(SNATCHER_ITEM_DURATION).toBe(1.15);
    expect(SNATCHER_REACTION_DURATION).toBe(1.2);
  });

  it('raises the lower tentacle before the full curled threat', () => {
    const sample = identitySnatcherSample();

    sampleSnatcherReveal(0.2, sample);
    expect(sample.fingerVisibility).toBeGreaterThan(0);
    expect(sample.headVisibility).toBe(0);

    sampleSnatcherReveal(0.58, sample);
    expect(sample.headVisibility).toBeGreaterThan(0.8);
    expect(sample.pointStrength).toBeGreaterThan(0.5);

    sampleSnatcherReveal(1, sample);
    expect(sample.crouchStrength).toBeGreaterThan(0.9);
    expect(sample.headVisibility).toBe(1);
    expect(sample.fingerVisibility).toBe(1);
  });

  it('gives every item a distinct keyed action', () => {
    const sample = identitySnatcherSample();

    expect(sampleSnatcherItemUse('spyglass', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('telescope-club');
    expect(sample.itemRoll).toBeLessThan(-0.5);

    expect(sampleSnatcherItemUse('swimRing', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('ring-throw');
    expect(sample.itemX).toBeGreaterThan(1);

    expect(sampleSnatcherItemUse('fishingNet', 0.42, sample)).toBe(true);
    expect(sample.effectKind).toBe('late-net');
    expect(sample.effectStrength).toBe(0);
    sampleSnatcherItemUse('fishingNet', 0.78, sample);
    expect(sample.effectStrength).toBeGreaterThan(0.5);

    expect(sampleSnatcherItemUse('harpoonGun', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('harpoon-recoil');
    expect(sample.recoilStrength).toBeGreaterThan(0.5);
  });

  it('pauses the target on the rail, then steals it with a backward glance', () => {
    const sample = identitySnatcherSample();

    sampleSnatcherReaction({ targetLost: true }, 0.48, sample);
    expect(sample.targetAtRail).toBe(1);
    expect(sample.targetDeparture).toBe(0);

    sampleSnatcherReaction({ targetLost: true }, 0.86, sample);
    expect(sample.targetDeparture).toBeGreaterThan(0.5);
    expect(sample.backwardGlance).toBeGreaterThan(0.5);
    expect(sample.itemX).toBeGreaterThan(2);
  });

  it('restores an item pose after each non-theft action', () => {
    const sample = identitySnatcherSample();

    sampleSnatcherItemUse('harpoonGun', 1, sample);

    expect(sample.itemX).toBe(0);
    expect(sample.itemY).toBe(0);
    expect(sample.itemZ).toBe(0);
    expect(sample.itemYaw).toBe(0);
    expect(sample.itemPitch).toBe(0);
    expect(sample.itemRoll).toBe(0);
    expect(sample.itemScaleX).toBe(1);
    expect(sample.itemScaleY).toBe(1);
    expect(sample.itemScaleZ).toBe(1);
  });
});
