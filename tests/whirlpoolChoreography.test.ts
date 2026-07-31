// Importance: 5/5. Protects inward beats, choice motion, severe roll, and exact loss travel.
import { describe, expect, it } from 'vitest';
import {
  createWhirlpoolSample,
  sampleWhirlpoolItemUse,
  sampleWhirlpoolReaction,
  sampleWhirlpoolReveal,
  WHIRLPOOL_ITEM_DURATION,
  WHIRLPOOL_REACTION_DURATION,
  WHIRLPOOL_REVEAL_DURATION,
} from '../src/survival/events/whirlpoolChoreography';

describe('whirlpool choreography', () => {
  it('uses the fixed event durations', () => {
    expect(WHIRLPOOL_REVEAL_DURATION).toBe(3);
    expect(WHIRLPOOL_ITEM_DURATION).toBe(1.25);
    expect(WHIRLPOOL_REACTION_DURATION).toBe(1.4);
  });

  it('pulls inward in three clear beats before choices', () => {
    const sample = createWhirlpoolSample();

    sampleWhirlpoolReveal(0.28, sample);
    const firstPull = sample.vortexStrength;
    sampleWhirlpoolReveal(0.54, sample);
    const secondPull = sample.vortexStrength;
    sampleWhirlpoolReveal(0.82, sample);

    expect(firstPull).toBeGreaterThan(0.2);
    expect(secondPull).toBeGreaterThan(firstPull);
    expect(sample.vortexStrength).toBeGreaterThan(secondPull);
    expect(sample.boatYaw).not.toBe(0);
  });

  it('drops the Anchor to a taut final catch', () => {
    const sample = createWhirlpoolSample();

    expect(sampleWhirlpoolItemUse('anchor', 0.62, sample)).toBe(true);
    expect(sample.effectKind).toBe('anchor-catch');
    expect(sample.anchorCatch).toBeGreaterThan(0.9);
    expect(sample.chainTension).toBeGreaterThan(0.8);
    expect(sample.itemY).toBeLessThan(-0.5);
  });

  it('compresses the Ring between the hull and water', () => {
    const sample = createWhirlpoolSample();

    expect(sampleWhirlpoolItemUse('swimRing', 0.62, sample)).toBe(true);
    expect(sample.effectKind).toBe('ring-compression');
    expect(sample.ringCompression).toBeGreaterThan(0.9);
    expect(sample.itemScaleY).toBeLessThan(0.5);
  });

  it('snaps a broken Anchor chain and tears a broken Ring', () => {
    const anchor = createWhirlpoolSample();
    const ring = createWhirlpoolSample();

    sampleWhirlpoolReaction({
      hullDamage: -8,
      anchorBroken: true,
      ringBroken: false,
      lostItemCount: 0,
    }, 0.42, anchor);
    sampleWhirlpoolReaction({
      hullDamage: -30,
      anchorBroken: false,
      ringBroken: true,
      lostItemCount: 0,
    }, 0.7, ring);

    expect(anchor.chainSnap).toBeGreaterThan(0.9);
    expect(anchor.boatYaw).toBeLessThan(-0.2);
    expect(ring.ringSlip).toBeGreaterThan(0.5);
    expect(ring.itemScaleY).toBeLessThan(0.5);
  });

  it('holds a severe roll while two supplies travel overboard', () => {
    const sample = createWhirlpoolSample();

    sampleWhirlpoolReaction({
      hullDamage: -70,
      anchorBroken: false,
      ringBroken: false,
      lostItemCount: 2,
    }, 0.5, sample);

    expect(Math.abs(sample.boatRoll)).toBeGreaterThan(0.35);
    expect(Math.abs(sample.cameraRoll)).toBeGreaterThan(0.1);
    expect(sample.supplyTravel).toBeGreaterThan(0.5);

    sampleWhirlpoolReaction({
      hullDamage: -70,
      anchorBroken: false,
      ringBroken: false,
      lostItemCount: 2,
    }, 1, sample);
    expect(sample.vortexStrength).toBeLessThan(0.25);
    expect(sample.boatRoll).toBe(0);
  });
});
