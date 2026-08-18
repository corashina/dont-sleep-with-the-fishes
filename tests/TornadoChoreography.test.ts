import { describe, expect, it } from 'vitest';
import {
  createTornadoSample,
  sampleTornadoItemUse,
  sampleTornadoReaction,
  sampleTornadoReveal,
  TORNADO_ITEM_DURATION,
  TORNADO_REACTION_DURATION,
  TORNADO_REVEAL_DURATION,
} from '../src/survival/events/tornadoChoreography';

describe('tornado choreography', () => {
  it('uses the approved phase durations', () => {
    expect(TORNADO_REVEAL_DURATION).toBe(3);
    expect(TORNADO_ITEM_DURATION).toBe(4);
    expect(TORNADO_REACTION_DURATION).toBe(1.4);
  });

  it('reveals the tornado in full', () => {
    const sample = createTornadoSample();

    sampleTornadoReveal(0, sample);
    expect(sample.visibility).toBe(0);
    expect(sample.effectStrength).toBe(0);

    sampleTornadoReveal(1, sample);
    expect(sample.visibility).toBe(1);
    expect(sample.funnelScale).toBe(1);
    expect(sample.spinRate).toBe(1);
    expect(sample.effectStrength).toBe(1);
  });

  it.each([
    ['anchor', 'anchor-cast'],
    ['swimRing', 'ring-cast'],
  ] as const)('holds the tornado during %s use', (choiceId, effectKind) => {
    const sample = createTornadoSample();

    expect(sampleTornadoItemUse(choiceId, 0.5, sample)).toBe(true);
    expect(sample.effectKind).toBe(effectKind);
    expect(sample.visibility).toBe(1);
    expect(sample.funnelScale).toBe(1);
    expect(sample.spinRate).toBe(1);
    expect(sample.effectStrength).toBe(1);
  });

  it('rejects unsupported item choices', () => {
    expect(sampleTornadoItemUse('sleep', 0.5, createTornadoSample())).toBe(false);
  });

  it('fades tornado fields after the reaction and moves lost supplies', () => {
    const sample = createTornadoSample();
    const reaction = {
      hullDamage: -60,
      anchorBroken: false,
      ringBroken: false,
      lostItemCount: 2,
    };

    sampleTornadoReaction(reaction, 0.6, sample);
    expect(sample.supplyTravel).toBeGreaterThan(0);

    sampleTornadoReaction(reaction, 1, sample);
    expect(sample.visibility).toBe(0);
    expect(sample.funnelScale).toBe(0);
    expect(sample.spinRate).toBe(0);
    expect(sample.effectStrength).toBe(0);
  });
});
