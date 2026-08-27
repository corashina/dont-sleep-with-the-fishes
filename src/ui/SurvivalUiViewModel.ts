import type { ItemInstanceId } from '../game/ItemState';
import type { ProjectedBoatBounds } from '../survival/BoatInteraction';
import type { InspectableEventId } from '../survival/eventCatalog';
import type { DayActionId, EventResponseId } from '../survival/survivalTypes';

export const DAY_ACTION_IDS = [
  'fish',
  'dive',
  'eat',
  'repair',
  'treat',
  'endDay',
  'repairItem',
  'answerRadio',
  'useEnergyBar',
  'openChest',
  'petCarlitos',
  'feedCarlitos',
  'treatCarlitos',
] as const satisfies readonly DayActionId[];

export interface EventContextChoice {
  readonly id: EventResponseId;
  readonly label: string;
  readonly unavailableReason: string | null;
  readonly anchorId?: string;
  readonly energyCost?: number;
  readonly energyOwner?: 'player' | 'carlitos';
}

export interface FocusedEventChoiceView extends EventContextChoice {
  readonly instanceId: ItemInstanceId | null;
}

export type FocusedEventChoiceSelection = Pick<
  FocusedEventChoiceView,
  'id' | 'instanceId'
>;

export interface FocusedEventFocusView {
  readonly eventId: InspectableEventId;
  readonly choices: readonly FocusedEventChoiceView[];
  readonly target: ProjectedBoatBounds | null;
}
