// Importance: 5/5. Protects the Death Stare hold, outcomes, and restored item poses.
import { describe, expect, it } from 'vitest';
import {
  DEATH_STARE_ITEM_DURATION,
  DEATH_STARE_REACTION_DURATION,
  DEATH_STARE_REVEAL_DURATION,
  identityDeathStareSample,
  sampleDeathStareItemUse,
  sampleDeathStareReaction,
  sampleDeathStareReveal,
} from '../src/survival/events/deathStareChoreography';

describe('death stare choreography', () => {
  it('uses the fixed event durations', () => {
    expect(DEATH_STARE_REVEAL_DURATION).toBe(3.2);
    expect(DEATH_STARE_ITEM_DURATION).toBe(1.25);
    expect(DEATH_STARE_REACTION_DURATION).toBe(1.25);
  });

  it('holds the fish still through the long gaze', () => {
    const first = identityDeathStareSample();
    const second = identityDeathStareSample();

    sampleDeathStareReveal(0.72, first);
    sampleDeathStareReveal(0.88, second);

    expect(second.fishX).toBeCloseTo(first.fishX);
    expect(second.fishY).toBeCloseTo(first.fishY);
    expect(second.fishZ).toBeCloseTo(first.fishZ);
    expect(second.eyeTarget).toBe(1);
    expect(first.eyeTarget).toBe(1);
  });

  it('rises wet, blinks once, then remains ready before choices', () => {
    const sample = identityDeathStareSample();

    sampleDeathStareReveal(0.3, sample);
    expect(sample.fishY).toBeGreaterThan(-2);
    expect(sample.waterDrain).toBeGreaterThan(0.5);

    sampleDeathStareReveal(0.57, sample);
    expect(sample.blink).toBeGreaterThan(0.5);

    sampleDeathStareReveal(1, sample);
    expect(sample.eyeTarget).toBe(1);
    expect(sample.fishVisibility).toBe(1);
    expect(sample.blink).toBe(0);
  });

  it('keys all five supply actions and restores each pose', () => {
    const sample = identityDeathStareSample();
    const choices = [
      ['flashlight', 'flashlight-beam'],
      ['umbrella', 'umbrella-shield'],
      ['cannedFood', 'food-toss'],
      ['harpoonGun', 'harpoon-shot'],
      ['fishingNet', 'net-cast'],
    ] as const;

    for (const [choiceId, effectKind] of choices) {
      expect(sampleDeathStareItemUse(choiceId, 0.56, sample)).toBe(true);
      expect(sample.effectKind).toBe(effectKind);
      expect(sample.effectStrength).toBeGreaterThan(0);
      sampleDeathStareItemUse(choiceId, 1, sample);
      expect(sample).toMatchObject({
        itemX: 0,
        itemY: 0,
        itemZ: 0,
        itemYaw: 0,
        itemPitch: 0,
        itemRoll: 0,
        itemScaleX: 1,
        itemScaleY: 1,
        itemScaleZ: 1,
      });
    }
  });

  it('sinks after a safe result and lunges on attack', () => {
    const safe = identityDeathStareSample();
    const attack = identityDeathStareSample();

    sampleDeathStareReaction({
      attacked: false,
      lostItem: false,
      brokenItem: false,
    }, 0.8, safe);
    expect(safe.sink).toBeGreaterThan(0.5);
    expect(safe.fishY).toBeLessThan(0);

    sampleDeathStareReaction({
      attacked: true,
      lostItem: false,
      brokenItem: false,
    }, 0.58, attack);
    expect(attack.lunge).toBeGreaterThan(0.5);
    expect(attack.cameraPitch).not.toBe(0);
    expect(attack.hullRoll).not.toBe(0);
  });

  it('draws only a lost supply into the mouth', () => {
    const held = identityDeathStareSample();
    const lost = identityDeathStareSample();

    sampleDeathStareReaction({
      attacked: false,
      lostItem: false,
      brokenItem: false,
    }, 0.5, held);
    sampleDeathStareReaction({
      attacked: false,
      lostItem: true,
      brokenItem: false,
    }, 0.5, lost);

    expect(held.itemX).toBe(0);
    expect(lost.itemX).toBe(0);
    expect(lost.itemY).toBe(0);
    expect(lost.itemZ).toBe(0);
    expect(lost.supplyTravel).toBeGreaterThan(0.5);
    expect(lost.itemScaleX).toBeLessThan(1);
  });

  it('holds a deterministic collapsed pose for a broken item', () => {
    const first = identityDeathStareSample();
    const second = identityDeathStareSample();
    const reaction = {
      attacked: true,
      lostItem: false,
      brokenItem: true,
    };

    sampleDeathStareReaction(reaction, 1, first);
    sampleDeathStareReaction(reaction, 1, second);

    expect(first).toEqual(second);
    expect(first.itemScaleY).toBeLessThan(0.5);
    expect(Math.abs(first.itemRoll)).toBeGreaterThan(0.5);
    expect(first.itemY).toBeLessThan(0);
  });
});
