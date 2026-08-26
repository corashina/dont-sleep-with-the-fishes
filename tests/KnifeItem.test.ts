import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  createItemInstances,
} from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
import {
  createEventItemUseSample,
  resolveEventItemUseContext,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { ITEM_ANIMATION_LAB_USES } from '../src/survival/ItemAnimationLab';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../src/survival/itemDescriptions';
import { itemArtwork } from '../src/ui/uiArtwork';
import { boatStorageSurface, boatStorageTransform } from '../src/world/BoatStorage';

describe('Knife survival item', () => {
  it('replaces Rope with one durable, breakable, weight-one item', () => {
    expect(ITEM_IDS).not.toContain('rope');
    expect(ITEM_IDS).toContain('knife');
    expect(ITEM_DEFINITIONS.knife).toMatchObject({
      label: 'KNIFE',
      weight: 1,
      spawnCount: 1,
      charges: null,
      durable: true,
      breakable: true,
      dayAction: null,
      modelId: 'knife',
      artworkId: 'knife',
    });
    expect(createItemInstances()).toContainEqual({
      instanceId: 'knife-1',
      type: 'knife',
    });
    expect(SURVIVAL_ITEM_DESCRIPTIONS.knife).toBe(
      'Cuts through threats during close attacks.',
    );
  });

  it('can save a Tentacle Attack target with an 80 percent success chance', () => {
    const choice = survivalEventById('snatcher')?.choices.find(({ id }) => id === 'knife');

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 80,
          message: 'You cut the tentacle and save the snatched supply.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The knife breaks and the snatched supply is lost.',
          effects: {
            items: [
              { kind: 'break', itemId: 'knife', quantity: 1 },
              { kind: 'loseEventTarget', quantity: 1 },
            ],
          },
        },
      ],
    });
  });

  it('can repel the shark swarm with an 80 percent success chance', () => {
    const choice = survivalEventById('swarm-of-sharks')?.choices.find(
      ({ id }) => id === 'knife',
    );

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 80,
          message: 'You drive the sharks away from the boat.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The knife breaks as a shark bites you.',
          effects: {
            resources: [{ operation: 'subtract', resource: 'health', value: 20 }],
            items: [{ kind: 'break', itemId: 'knife', quantity: 1 }],
          },
        },
      ],
    });
  });

  it('removes Rope from Windy Night', () => {
    expect(survivalEventById('windy-night')?.choices.some(({ id }) => id === 'rope'))
      .toBe(false);
  });

  it('uses a visible one-handed slash', () => {
    expect(resolveEventItemUseContext('snatcher', 'knife', 'knife')).toBe('knife-slash');
    expect(resolveEventItemUseContext('swarm-of-sharks', 'knife', 'knife'))
      .toBe('knife-slash');

    const ready = createEventItemUseSample();
    const strike = createEventItemUseSample();
    sampleEventItemUse('knife-slash', 'knife', 0.4, ready);
    sampleEventItemUse('knife-slash', 'knife', 0.7, strike);

    expect(strike.itemVisible).toBe(true);
    expect(ready.targetBlend).toBe(0);
    expect(strike.targetBlend).toBe(0);
    expect(Math.abs(strike.yaw - ready.yaw)).toBeGreaterThan(0.4);
    expect(Math.abs(strike.roll - ready.roll)).toBeGreaterThan(0.4);
  });

  it('is selectable in Item Animation Lab', () => {
    expect(ITEM_ANIMATION_LAB_USES.knife).toEqual([{
      id: 'knife-slash',
      label: 'Slash knife',
      eventId: 'snatcher',
      choiceId: 'knife',
    }]);
  });

  it('has boat storage and illustrated UI artwork', () => {
    const knife = { instanceId: 'knife-1', type: 'knife' } as const;
    const transform = boatStorageTransform(knife);

    expect(boatStorageSurface(knife)).toBe('floor');
    expect(transform.position.toArray().every(Number.isFinite)).toBe(true);
    expect(itemArtwork('knife')).toContain('data-item-artwork="knife"');
  });
});
