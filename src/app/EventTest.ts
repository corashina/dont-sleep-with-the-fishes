import {
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { ScavengeResult } from '../game/ScavengeSession';
import { SURVIVAL_EVENTS } from '../survival/events';

export interface EventTestOption {
  readonly id: string;
  readonly title: string;
  readonly phase: 'day' | 'night';
}

export const EVENT_TEST_OPTIONS: readonly EventTestOption[] = Object.freeze(
  SURVIVAL_EVENTS.map(({ id, title, phase }) => (
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
