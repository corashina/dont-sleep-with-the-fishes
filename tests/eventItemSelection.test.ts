import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { eventItemSelections } from '../src/survival/eventItemSelection';
import type {
  EventChoiceDefinition,
  SurvivalEventDefinition,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from '../src/survival/survivalTypes';

const instanceId = (value: string) => value as ItemInstanceId;

function choice(itemId: ItemId): EventChoiceDefinition {
  return {
    id: itemId,
    label: `Use ${itemId}`,
    itemId,
    outcomes: [{ weight: 1, message: 'Handled.', effects: {} }],
  };
}

function testEvent(itemIds: readonly [ItemId, ...ItemId[]]): Pick<SurvivalEventDefinition, 'choices'> {
  return {
    choices: [
      ...itemIds.map(choice),
      { id: 'sleep', label: 'Endure', outcomes: [{ weight: 1, message: 'Endured.', effects: {} }] },
    ] as unknown as SurvivalEventDefinition['choices'],
  };
}

function inventory(items: readonly SurvivalItemState[]): SurvivalInventorySnapshot {
  return Object.freeze(Object.fromEntries(items.map((item) => [
    item.instanceId,
    Object.freeze({ ...item }),
  ])));
}

function usable(id: string, type: ItemId): SurvivalItemState {
  return { instanceId: instanceId(id), type, condition: 'usable' };
}

function broken(id: string, type: ItemId): SurvivalItemState {
  return { instanceId: instanceId(id), type, condition: 'broken' };
}

describe('eventItemSelections', () => {
  it('maps every physical inventory instance and preserves duplicate identities', () => {
    const selections = eventItemSelections(testEvent(['anchor']), inventory([
      usable('anchor-1', 'anchor'),
      usable('anchor-2', 'anchor'),
      usable('map-3', 'map'),
      broken('bucket-4', 'bucket'),
    ]));

    expect(selections).toEqual([
      { instanceId: 'anchor-1', itemId: 'anchor', choiceId: 'anchor', eligible: true, reason: 'eligible' },
      { instanceId: 'anchor-2', itemId: 'anchor', choiceId: 'anchor', eligible: true, reason: 'eligible' },
      { instanceId: 'map-3', itemId: 'map', choiceId: null, eligible: false, reason: 'unsuitable' },
      { instanceId: 'bucket-4', itemId: 'bucket', choiceId: null, eligible: false, reason: 'unavailable' },
    ]);
  });
});
