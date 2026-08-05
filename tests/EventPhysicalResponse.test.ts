// Importance: 4/5. Protects stable physical response ordering for event outcomes.
import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import {
  deriveEventPhysicalResponse,
} from '../src/survival/EventPhysicalResponse';
import type {
  ItemCondition,
  SurvivalInventorySnapshot,
} from '../src/survival/survivalTypes';

const inventory = (
  ...items: Array<readonly [ItemInstanceId, ItemId, ItemCondition]>
): SurvivalInventorySnapshot => Object.freeze(Object.fromEntries(
  items.map(([instanceId, type, condition]) => [
    instanceId,
    Object.freeze({ instanceId, type, condition }),
  ]),
));

describe('deriveEventPhysicalResponse', () => {
  it('orders the selected actor before random changed actors', () => {
    const response = deriveEventPhysicalResponse(
      'bucket',
      inventory(
        ['bucket-1', 'bucket', 'usable'],
        ['map-1', 'map', 'usable'],
      ),
      inventory(
        ['bucket-1', 'bucket', 'broken'],
        ['map-1', 'map', 'broken'],
      ),
      'bucket-1',
    );
    expect(response).toEqual({
      choiceId: 'bucket',
      actors: [
        { instanceId: 'bucket-1', condition: 'broken' },
        { instanceId: 'map-1', condition: 'broken' },
      ],
    });
  });

  it('returns an empty actor list for damage-only results', () => {
    expect(deriveEventPhysicalResponse(
      'sleep',
      inventory(['map-1', 'map', 'usable']),
      inventory(['map-1', 'map', 'usable']),
      null,
    )).toEqual({ choiceId: 'sleep', actors: [] });
  });
});
