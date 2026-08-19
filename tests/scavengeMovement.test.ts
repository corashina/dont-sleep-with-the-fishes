// Importance: 10/10 (scaled from 5/5). Protects movement speed rules and invalid load handling.
import { describe, expect, it } from 'vitest';
import { scavengeSpeedMultiplier } from '../src/game/scavengeMovement';

describe('scavenge movement', () => {
  it.each([
    [0, 1], [1, 1], [2, 0.92], [3, 0.84],
  ])('maps carried weight %s to multiplier %s', (weight, expected) => {
    expect(scavengeSpeedMultiplier(weight)).toBe(expected);
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'uses full speed for invalid weight %s',
    (weight) => expect(scavengeSpeedMultiplier(weight)).toBe(1),
  );
});
