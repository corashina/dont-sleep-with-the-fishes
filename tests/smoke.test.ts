import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { formatCountdown } from '../src/ui/GameUI';

describe('demo contracts', () => {
  it('ships exactly eight supply definitions', () => {
    expect(ITEM_IDS).toHaveLength(8);
    expect(new Set(ITEM_IDS).size).toBe(8);
  });

  it.each([
    [120, '02:00'],
    [61, '01:01'],
    [0.1, '00:01'],
    [0, '00:00'],
  ] as const)('formats %s seconds as %s', (seconds, formatted) => {
    expect(formatCountdown(seconds)).toBe(formatted);
  });
});
