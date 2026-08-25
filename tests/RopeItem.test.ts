import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  createItemInstances,
} from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../src/survival/itemDescriptions';
import { itemArtwork } from '../src/ui/uiArtwork';
import { boatStorageSurface, boatStorageTransform } from '../src/world/BoatStorage';

describe('Rope survival item', () => {
  it('is one durable, breakable, weight-two item without a day action', () => {
    expect(ITEM_IDS).toContain('rope');
    expect(ITEM_DEFINITIONS.rope).toMatchObject({
      label: 'ROPE',
      weight: 2,
      spawnCount: 1,
      charges: null,
      durable: true,
      breakable: true,
      dayAction: null,
      modelId: 'rope',
      artworkId: 'rope',
    });
    expect(createItemInstances()).toContainEqual({
      instanceId: 'rope-1',
      type: 'rope',
    });
    expect(SURVIVAL_ITEM_DESCRIPTIONS.rope).toBe(
      'Secures loose supplies and keeps them within reach.',
    );
  });

  it('secures supplies during Windy Night with an 80 percent success chance', () => {
    const choice = survivalEventById('windy-night')?.choices.find(({ id }) => id === 'rope');

    expect(choice).toEqual({
      id: 'rope',
      label: 'Use Rope',
      itemId: 'rope',
      outcomes: [
        {
          weight: 80,
          message: 'The rope secures the loose supplies.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The rope snaps while securing the loose supplies.',
          effects: {
            items: [{ kind: 'break', itemId: 'rope', quantity: 1 }],
          },
        },
      ],
    });
  });

  it('can save a Tentacle Attack target with an 80 percent success chance', () => {
    const choice = survivalEventById('snatcher')?.choices.find(({ id }) => id === 'rope');

    expect(choice).toEqual({
      id: 'rope',
      label: 'Use Rope',
      itemId: 'rope',
      outcomes: [
        {
          weight: 80,
          message: 'The rope holds the snatched supply against the gunwale.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The rope snaps and the snatched supply is lost.',
          effects: {
            items: [
              { kind: 'break', itemId: 'rope', quantity: 1 },
              { kind: 'loseEventTarget', quantity: 1 },
            ],
          },
        },
      ],
    });
  });

  it('uses the standard pickup-and-hold event motion', () => {
    expect(resolveEventItemUseContext('windy-night', 'rope', 'rope')).toBe('base');
    expect(resolveEventItemUseContext('snatcher', 'rope', 'rope')).toBe('base');
  });

  it('has boat storage and illustrated UI artwork', () => {
    const rope = { instanceId: 'rope-1', type: 'rope' } as const;
    const transform = boatStorageTransform(rope);

    expect(boatStorageSurface(rope)).toBe('floor');
    expect(transform.position.toArray().every(Number.isFinite)).toBe(true);
    expect(itemArtwork('rope')).toContain('data-item-artwork="rope"');
  });
});
