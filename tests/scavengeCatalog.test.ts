// Importance: 4/5. Protects the canonical scavenging roster.
import { describe, expect, it } from 'vitest';
import {
  createItemInstances,
  ITEM_DEFINITIONS,
  ITEM_IDS,
} from '../src/game/ItemState';
import {
  createScavengeItemInstances,
  SCAVENGE_ITEM_IDS,
} from '../src/game/scavengeCatalog';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../src/survival/itemDescriptions';
import { itemArtwork } from '../src/ui/uiArtwork';

describe('scavenging item roster', () => {
  it('excludes energy bars without removing them from the canonical catalog', () => {
    expect(ITEM_IDS).toContain('energyBar');
    expect(SCAVENGE_ITEM_IDS).toEqual(ITEM_IDS.filter((id) => id !== 'energyBar'));
    expect(createScavengeItemInstances()).toEqual(
      createItemInstances().filter(({ type }) => type !== 'energyBar'),
    );
    expect(createScavengeItemInstances()).toHaveLength(21);
    expect(createScavengeItemInstances().some(({ type }) => type === 'energyBar')).toBe(false);
  });

  it('includes Captain Whiskers as a decorative two-slot rescue item', () => {
    expect(ITEM_DEFINITIONS.captainWhiskers).toMatchObject({
      label: 'CAPTAIN WHISKERS',
      weight: 2,
      spawnCount: 1,
      charges: null,
      durable: true,
      breakable: false,
      dayAction: null,
      placementCategory: 'comfort',
    });
    expect(SCAVENGE_ITEM_IDS).toContain('captainWhiskers');
    expect(SURVIVAL_ITEM_DESCRIPTIONS.captainWhiskers).toContain('company');
    expect(itemArtwork('captainWhiskers')).toContain(
      'data-item-artwork="captainWhiskers"',
    );
  });

  it('returns fresh stable instances on every call', () => {
    const first = createScavengeItemInstances();
    const second = createScavengeItemInstances();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(new Set(first.map(({ instanceId }) => instanceId))).toHaveLength(first.length);
  });
});
