import type { ItemInstanceId } from '../game/ItemState';
import type {
  ItemCondition,
  SurvivalInventorySnapshot,
} from './survivalTypes';

export interface EventPhysicalActorPresentation {
  readonly instanceId: ItemInstanceId;
  readonly condition: ItemCondition;
}

export interface EventPhysicalResponsePresentation {
  readonly choiceId: string;
  readonly actors: readonly EventPhysicalActorPresentation[];
}

export function deriveEventPhysicalResponse(
  choiceId: string,
  before: SurvivalInventorySnapshot,
  after: SurvivalInventorySnapshot,
  selectedInstanceId: ItemInstanceId | null,
): EventPhysicalResponsePresentation {
  const actors: EventPhysicalActorPresentation[] = [];

  for (const instanceId of (Object.keys(before) as ItemInstanceId[]).sort()) {
    const previous = before[instanceId];
    const current = after[instanceId];
    if (
      previous?.condition !== 'usable'
      || current === undefined
      || current.condition === 'usable'
    ) continue;
    actors.push(Object.freeze({ instanceId, condition: current.condition }));
  }

  if (selectedInstanceId !== null) {
    const selectedIndex = actors.findIndex(({ instanceId }) => instanceId === selectedInstanceId);
    if (selectedIndex > 0) {
      const [selected] = actors.splice(selectedIndex, 1);
      actors.unshift(selected!);
    }
  }

  return Object.freeze({ choiceId, actors: Object.freeze(actors) });
}
