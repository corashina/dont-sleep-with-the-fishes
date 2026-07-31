// Importance: 5/5. Protects the fixed swarm groups and event actions.
import { describe, expect, it } from 'vitest';
import {
  createSwarmFishPose,
  createSwarmSample,
  createSwarmVariants,
  sampleSwarmFishPose,
  sampleSwarmItemUse,
  sampleSwarmReaction,
  sampleSwarmReveal,
  SWARM_ITEM_DURATION,
  SWARM_REACTION_DURATION,
  SWARM_REVEAL_DURATION,
} from '../src/survival/events/anglerfishSwarmChoreography';

describe('anglerfishSwarmChoreography', () => {
  it('creates 18 stable fish below the Death Stare scale', () => {
    const first = createSwarmVariants(18, 27);
    const second = createSwarmVariants(18, 27);

    expect(first).toEqual(second);
    expect(first).toHaveLength(18);
    expect(first.every(({ scale }) => scale >= 0.54 && scale <= 0.86)).toBe(true);
    expect(new Set(first.map(({ scale }) => scale)).size).toBeGreaterThan(6);
    expect(createSwarmVariants(40, 27)).toHaveLength(18);
  });

  it('shows three lures first, then closes four uneven groups around the hull', () => {
    const variants = createSwarmVariants(18, 27);
    const early = createSwarmSample();
    const middle = createSwarmSample();
    const held = createSwarmSample();
    const pose = createSwarmFishPose();

    expect(SWARM_REVEAL_DURATION).toBe(2.9);
    sampleSwarmReveal(0.18, variants, early);
    sampleSwarmReveal(0.62, variants, middle);
    sampleSwarmReveal(1, variants, held);

    expect(early.visibleCount).toBe(3);
    expect(early.bodyVisibleCount).toBe(0);
    expect(middle.visibleCount).toBeGreaterThan(9);
    expect(middle.cameraYaw).not.toBe(0);
    expect(held.visibleCount).toBe(18);
    expect(held.bodyVisibleCount).toBe(18);

    const heldPoses = variants.map((variant) => {
      sampleSwarmFishPose(variant, 0, held, pose);
      return { ...pose };
    });
    expect(heldPoses.filter(({ z }) => z < -3).length).toBeGreaterThanOrEqual(6);
    expect(heldPoses.some(({ z }) => z > 2.5)).toBe(true);
    expect(heldPoses.some(({ x }) => x < -1.7)).toBe(true);
    expect(heldPoses.some(({ x }) => x > 1.7)).toBe(true);
    expect(heldPoses.every(({ scale }) => scale < 1)).toBe(true);
  });

  it('authors net, harpoon, flashlight, and bait actions', () => {
    const sample = createSwarmSample();
    expect(SWARM_ITEM_DURATION).toBe(1.2);

    expect(sampleSwarmItemUse('fishingNet', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('net-pull');
    expect(sample.netPull).toBeGreaterThan(0.9);
    expect(sample.x).toBeGreaterThan(1.5);

    expect(sampleSwarmItemUse('harpoonGun', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('harpoon-opening');
    expect(sample.opening).toBeGreaterThan(0.9);

    expect(sampleSwarmItemUse('flashlight', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('flashlight-sweep');
    expect(sample.flashlightSweep).toBeGreaterThan(0.9);
    expect(sample.lureDim).toBeGreaterThan(0.6);

    expect(sampleSwarmItemUse('baitTin', 0.56, sample)).toBe(true);
    expect(sample.effectKind).toBe('bait-diversion');
    expect(sample.baitDiversion).toBeGreaterThan(0.9);
    expect(sample.x).toBeGreaterThan(2);
    expect(sampleSwarmItemUse('sleep', 0.5, sample)).toBe(false);
  });

  it('authors a closing attack and exact catches', () => {
    const sample = createSwarmSample();
    expect(SWARM_REACTION_DURATION).toBe(1.15);

    sampleSwarmReaction({
      attacked: true,
      foodDelta: 0,
      baitDelta: 0,
      brokenItem: false,
    }, 0.48, sample);
    expect(sample.attack).toBeGreaterThan(0.9);
    expect(sample.cameraYaw).not.toBe(0);
    expect(sample.splash).toBeGreaterThan(0);

    sampleSwarmReaction({
      attacked: false,
      foodDelta: 2,
      baitDelta: 0,
      brokenItem: false,
    }, 1, sample);
    expect(sample.foodDelta).toBe(2);
    expect(sample.catchStrength).toBe(1);
    expect(sample.opening).toBeGreaterThan(0.8);
  });
});
