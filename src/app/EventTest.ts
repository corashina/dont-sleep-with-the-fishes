import {
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { ScavengeResult } from '../game/ScavengeSession';
import { SURVIVAL_EVENTS } from '../survival/events';
import {
  ITEM_ANIMATION_LAB_ID,
  ITEM_ANIMATION_LAB_TITLE,
} from '../survival/ItemAnimationLab';
import type { PresentationCue } from '../survival/survivalTypes';

export interface EventTestOption {
  readonly id: string;
  readonly title: string;
  readonly phase: 'lab' | 'day' | 'night';
}

const NIGHT_EVENT_TYPE_ORDER: readonly PresentationCue[] = Object.freeze([
  'storm',
  'impact',
  'fish',
  'darkness',
  'sighting',
  'repair',
]);

function nightEventTypeRank(cue: PresentationCue): number {
  const rank = NIGHT_EVENT_TYPE_ORDER.indexOf(cue);
  return rank === -1 ? NIGHT_EVENT_TYPE_ORDER.length : rank;
}

export const EVENT_TEST_OPTIONS: readonly EventTestOption[] = Object.freeze(
  [
    {
      id: ITEM_ANIMATION_LAB_ID,
      title: ITEM_ANIMATION_LAB_TITLE,
      phase: 'lab' as const,
    },
    ...SURVIVAL_EVENTS.filter(({ phase }) => phase === 'day'),
    ...SURVIVAL_EVENTS
      .filter(({ phase }) => phase === 'night')
      .map((event, catalogIndex) => ({ event, catalogIndex }))
      .sort((left, right) => (
        nightEventTypeRank(left.event.cue) - nightEventTypeRank(right.event.cue)
        || left.catalogIndex - right.catalogIndex
      ))
      .map(({ event }) => event),
  ]
    .map(({ id, title, phase }) => (
      Object.freeze({ id, title, phase })
    )),
);

const EVENT_TEST_IDS = new Set(EVENT_TEST_OPTIONS.map(({ id }) => id));

export function isEventTestId(id: string): boolean {
  return EVENT_TEST_IDS.has(id);
}

export function createEventTestResult(): Readonly<ScavengeResult> {
  const savedItems = ITEM_IDS.map((type): Readonly<ItemInstance> => Object.freeze({
    instanceId: `${type}-1` as ItemInstanceId,
    type,
  }));
  return Object.freeze({
    savedItems: Object.freeze(savedItems),
    elapsedSeconds: 0,
  });
}
