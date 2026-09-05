import { describe, expect, it } from 'vitest';
import {
  SCAVENGE_SPRINT_SPEED,
  SCAVENGE_WALK_SPEED,
  scavengeSpeedMultiplier,
} from '../src/game/scavengeMovement';

describe('scavenge movement balance', () => {
  it('uses the configured base speeds', () => {
    expect(SCAVENGE_WALK_SPEED).toBe(3.0);
    expect(SCAVENGE_SPRINT_SPEED).toBe(8.4);
  });

  it.each([
    [0, 1],
    [1, 1],
    [2, 0.88],
    [3, 0.76],
  ])('uses carried weight %s multiplier %s', (carriedWeight, multiplier) => {
    expect(scavengeSpeedMultiplier(carriedWeight)).toBe(multiplier);
  });
});
