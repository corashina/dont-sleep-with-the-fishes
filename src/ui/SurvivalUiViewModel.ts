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
