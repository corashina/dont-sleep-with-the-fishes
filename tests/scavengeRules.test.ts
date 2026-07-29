// Importance: 5/5. Protects scavenging limits and bounds.
import { describe, expect, it } from 'vitest';
import { containsPointXZ, SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';

describe('scavenge rules', () => {
  const bounds = { minX: 8, maxX: 10, minZ: -1, maxZ: 1 };

  it('uses a one-minute scavenging deadline', () => {
    expect(SCAVENGE_DURATION_SECONDS).toBe(60);
  });

  it.each([
    [{ x: 8, z: -1 }, true],
    [{ x: 10, z: 1 }, true],
    [{ x: 7.999, z: 0 }, false],
    [{ x: 9, z: 1.001 }, false],
  ] as const)('tests the authored rectangle inclusively', (point, expected) => {
    expect(containsPointXZ(bounds, point)).toBe(expected);
  });
});
