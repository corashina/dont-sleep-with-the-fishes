// Importance: 5/5. Protects the water-hole reveal, item casts, and exact loss travel.
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

  it('opens the depression in three clear beats without view motion', () => {
    const sample = createWhirlpoolSample();

    sampleWhirlpoolReveal(0.28, sample);
    const firstPull = sample.vortexStrength;
    sampleWhirlpoolReveal(0.54, sample);
    const secondPull = sample.vortexStrength;
    sampleWhirlpoolReveal(0.82, sample);

    expect(firstPull).toBeGreaterThan(0.2);
    expect(secondPull).toBeGreaterThan(firstPull);
    expect(sample.vortexStrength).toBeGreaterThan(secondPull);
    expect(sample.vortexDepression).toBeGreaterThan(1.4);
    expect(sample.streamStrength).toBeGreaterThan(0.9);
  });

  it('casts the Anchor toward the starboard water hole', () => {
    const sample = createWhirlpoolSample();

    expect(sampleWhirlpoolItemUse('anchor', 0.6, sample)).toBe(true);
    expect(sample.effectKind).toBe('anchor-cast');
    expect(sample.itemX).toBeGreaterThan(0.6);
    expect(sample.itemZ).toBeLessThan(-0.5);
    expect(sample.itemScaleY).toBeGreaterThan(0.85);
  });

  it('casts the Ring without a compression shell', () => {
    const sample = createWhirlpoolSample();

    expect(sampleWhirlpoolItemUse('swimRing', 0.6, sample)).toBe(true);
    expect(sample.effectKind).toBe('ring-cast');
    expect(sample.itemX).toBeGreaterThan(0.6);
    expect(sample.itemScaleY).toBeGreaterThan(0.85);
  });

  it('moves lost supplies while the distant vortex releases', () => {
    const sample = createWhirlpoolSample();

    sampleWhirlpoolReaction({
      hullDamage: -70,
      anchorBroken: false,
      ringBroken: false,
      lostItemCount: 2,
    }, 0.5, sample);

    expect(sample.supplyTravel).toBeGreaterThan(0.4);
    expect(sample.vortexStrength).toBe(1);
    expect(sample.streamStrength).toBe(1);

    sampleWhirlpoolReaction({
      hullDamage: -70,
      anchorBroken: false,
      ringBroken: false,
      lostItemCount: 2,
    }, 1, sample);
    expect(sample.vortexStrength).toBeLessThan(0.3);
    expect(sample.streamStrength).toBeLessThan(0.5);
  });
});
