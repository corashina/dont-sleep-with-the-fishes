import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { drawMissingItem, missingItemRewards } from '../src/survival/itemRewards';
import { sequenceRandom } from './helpers/random';

describe('missing item rewards', () => {
  it('filters every owned type and repeated pool entry', () => {
    expect(missingItemRewards(
      new Set(['ductTape', 'compass']),
      ['ductTape', 'map', 'map', 'compass', 'medicalKit'],
    )).toEqual(['map', 'medicalKit']);
  });

  it('returns no item from a full pool', () => {
    expect(drawMissingItem(
      new Set(['map', 'compass']),
      ['map', 'compass'],
      sequenceRandom([0]),
    )).toBeNull();
  });

  it('preserves relative custom weights after ownership filtering', () => {
    const pool = ['map', 'compass', 'scubaSet'] as const;
    const owned = new Set(['map'] as const);
    const weight = (itemId: ItemId) => itemId === 'scubaSet' ? 3 : 1;

    expect(drawMissingItem(owned, pool, sequenceRandom([0.249999]), weight)).toBe('compass');
    expect(drawMissingItem(owned, pool, sequenceRandom([0.25]), weight)).toBe('scubaSet');
  });
});
