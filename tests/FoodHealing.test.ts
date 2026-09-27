// Importance: 95/100. Meals must heal within bounds, consume one portion, and preserve energy.
import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

describe('food healing', () => {
  it.each([
    [50, 0, 1],
    [50, 0.999999, 5],
    [98, 0.999999, 2],
    [100, 0.999999, 0],
  ])('heals health %s by %s roll, applying %s points', (health, roll, healed) => {
    const session = new SurvivalSession([], {
      seed: 1,
      random: sequenceRandom([0, roll]),
      initial: { health, hunger: 50, food: 1, energy: 2 },
    });
    expect(session.perform('eat')).toMatchObject({
      accepted: true,
      deltas: { hunger: -18, health: healed, food: -1 },
    });
    expect(session.snapshot()).toMatchObject({
      health: health + healed, hunger: 32, food: 0, energy: 2, state: 'day',
    });
  });
});
