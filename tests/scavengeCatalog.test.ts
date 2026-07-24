import { describe, expect, it } from 'vitest';
import { createItemInstances, ITEM_IDS } from '../src/game/ItemState';
import {
  createScavengeItemInstances,
  SCAVENGE_ITEM_IDS,
} from '../src/game/scavengeCatalog';

describe('scavenging item roster', () => {
  it('excludes energy bars without removing them from the canonical catalog', () => {
    expect(ITEM_IDS).toContain('energyBar');
    expect(SCAVENGE_ITEM_IDS).toEqual(ITEM_IDS.filter((id) => id !== 'energyBar'));
    expect(createScavengeItemInstances()).toEqual(
      createItemInstances().filter(({ type }) => type !== 'energyBar'),
    );
    expect(createScavengeItemInstances()).toHaveLength(20);
    expect(createScavengeItemInstances().some(({ type }) => type === 'energyBar')).toBe(false);
  });

  it('returns fresh stable instances on every call', () => {
    const first = createScavengeItemInstances();
    const second = createScavengeItemInstances();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(new Set(first.map(({ instanceId }) => instanceId))).toHaveLength(first.length);
  });
});
