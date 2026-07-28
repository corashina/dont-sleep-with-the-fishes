import { describe, expect, it } from 'vitest';
import {
  EVENT_TEST_OPTIONS,
  createEventTestResult,
  isEventTestId,
} from '../src/app/EventTest';
import { ITEM_IDS } from '../src/game/ItemState';
import { SURVIVAL_EVENTS } from '../src/survival/events';

describe('EventTest', () => {
  it('derives ordered immutable options from the authored event catalog', () => {
    expect(EVENT_TEST_OPTIONS).toEqual(
      SURVIVAL_EVENTS.map(({ id, title, phase }) => ({ id, title, phase })),
    );
    expect(Object.isFrozen(EVENT_TEST_OPTIONS)).toBe(true);
    expect(EVENT_TEST_OPTIONS.every(Object.isFrozen)).toBe(true);
    expect(isEventTestId(SURVIVAL_EVENTS[0]!.id)).toBe(true);
    expect(isEventTestId('missing-event')).toBe(false);
  });

  it('creates one usable-by-default instance of every recoverable item', () => {
    const result = createEventTestResult();
    expect(result).toEqual({
      savedItems: ITEM_IDS.map((type) => ({ instanceId: `${type}-1`, type })),
      elapsedSeconds: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.savedItems)).toBe(true);
    expect(result.savedItems.every(Object.isFrozen)).toBe(true);
  });
});
