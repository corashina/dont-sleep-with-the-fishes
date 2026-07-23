import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type {
  EventResponseId,
  SurvivalEventDefinition,
  SurvivalInventorySnapshot,
  SurvivalItemState,
} from './survivalTypes';

export interface EventItemSelection {
  readonly instanceId: ItemInstanceId;
  readonly itemId: ItemId;
  readonly choiceId: EventResponseId | null;
  readonly eligible: boolean;
  readonly reason: 'eligible' | 'unsuitable' | 'unavailable';
}

export function eventItemSelections(
  event: Pick<SurvivalEventDefinition, 'choices'>,
  inventory: SurvivalInventorySnapshot,
): readonly EventItemSelection[] {
  const choiceByItem = new Map(
    event.choices.flatMap((choice) => (
      choice.itemId === undefined ? [] : [[choice.itemId, choice.id] as const]
    )),
  );
  return Object.values(inventory)
    .filter((item): item is Readonly<SurvivalItemState> => item !== undefined)
    .map((item) => {
      const choiceId = choiceByItem.get(item.type) ?? null;
      const usable = item.condition === 'usable';
      return {
        instanceId: item.instanceId,
        itemId: item.type,
        choiceId,
        eligible: usable && choiceId !== null,
        reason: !usable ? 'unavailable' : choiceId === null ? 'unsuitable' : 'eligible',
      } as const;
    });
}
