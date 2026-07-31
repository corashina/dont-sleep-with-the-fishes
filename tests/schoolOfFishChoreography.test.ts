// Importance: 5/5. Protects deterministic school staging and event motion.
import { describe, expect, it } from 'vitest';
import {
  createSchoolVariants,
  identitySchoolFishPose,
  identitySchoolSample,
  sampleSchoolFishPose,
  sampleSchoolItemUse,
  sampleSchoolReaction,
  sampleSchoolReveal,
  SCHOOL_CENTER_X,
  SCHOOL_CENTER_Z,
  SCHOOL_ITEM_DURATION,
  SCHOOL_REACTION_DURATION,
  SCHOOL_REVEAL_DURATION,
} from '../src/survival/events/schoolOfFishChoreography';

describe('schoolOfFishChoreography', () => {
  it('creates stable, bounded fish variants', () => {
    const first = createSchoolVariants(24, 19);
    const second = createSchoolVariants(24, 19);

    expect(first).toEqual(second);
    expect(first).toHaveLength(24);
    expect(first.every(({ scale }) => scale >= 0.72 && scale <= 1.18)).toBe(true);
    expect(createSchoolVariants(50, 19)).toHaveLength(24);
  });

  it('gathers a scattered school into its held orbit', () => {
    const sample = identitySchoolSample();
    const pose = identitySchoolFishPose();
    const variant = createSchoolVariants(1, 19)[0]!;
    expect(SCHOOL_REVEAL_DURATION).toBe(2.6);

    sampleSchoolReveal(0, sample);
    sampleSchoolFishPose(variant, 0, sample, pose);
    expect(sample.gather).toBe(0);
    expect(sample.schoolAlpha).toBe(0);
    const scatteredDistance = Math.hypot(
      pose.x - SCHOOL_CENTER_X,
      pose.z - SCHOOL_CENTER_Z,
    );

    sampleSchoolReveal(1, sample);
    sampleSchoolFishPose(variant, 0, sample, pose);
    expect(sample.gather).toBe(1);
    expect(sample.schoolAlpha).toBe(1);
    expect(Math.hypot(
      pose.x - SCHOOL_CENTER_X,
      pose.z - SCHOOL_CENTER_Z,
    )).toBeLessThan(scatteredDistance);
  });

  it('authors distinct net, bucket, and telescope actions', () => {
    const sample = identitySchoolSample();
    expect(SCHOOL_ITEM_DURATION).toBe(1.25);

    expect(sampleSchoolItemUse('fishingNet', 0.58, sample)).toBe(true);
    expect(sample.effectKind).toBe('net-sweep');
    expect(sample.x).toBeGreaterThan(2);
    expect(sample.splash).toBeGreaterThan(0.9);

    expect(sampleSchoolItemUse('bucket', 0.58, sample)).toBe(true);
    expect(sample.effectKind).toBe('bucket-dip');
    expect(sample.y).toBeLessThan(0);
    expect(sample.pitch).toBeLessThan(-0.7);

    expect(sampleSchoolItemUse('spyglass', 0.58, sample)).toBe(true);
    expect(sample.effectKind).toBe('telescope-track');
    expect(sample.y).toBeGreaterThan(0.5);
    expect(sample.splash).toBe(0);
    expect(sampleSchoolItemUse('sleep', 0.5, sample)).toBe(false);
  });

  it('shows the exact catch and scatters the remaining school', () => {
    const sample = identitySchoolSample();
    expect(SCHOOL_REACTION_DURATION).toBe(1.1);

    sampleSchoolReaction({ foodDelta: 3, brokenItem: false }, 1, sample);
    expect(sample.foodDelta).toBe(3);
    expect(sample.catchStrength).toBe(1);
    expect(sample.scatter).toBe(1);

    sampleSchoolReaction({ foodDelta: 0, brokenItem: true }, 1, sample);
    expect(sample.foodDelta).toBe(0);
    expect(sample.catchStrength).toBe(0);
    expect(sample.scaleY).toBeLessThan(0.7);
  });
});
