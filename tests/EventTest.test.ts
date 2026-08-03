import { describe, expect, it } from 'vitest';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';
import { survivalEventById } from '../src/survival/events';
import { ITEM_ANIMATION_LAB_ID } from '../src/survival/ItemAnimationLab';

describe('event test menu', () => {
  it('offers the item animation lab before real events', () => {
    expect(EVENT_TEST_OPTIONS[0]).toEqual({
      id: ITEM_ANIMATION_LAB_ID,
      title: 'Item Animation Lab',
      phase: 'lab',
    });
  });

  it('groups night events by presentation type without changing their labels', () => {
    const nightOptions = EVENT_TEST_OPTIONS.filter(({ phase }) => phase === 'night');
    const typeOrder = ['storm', 'impact', 'fish', 'darkness', 'sighting', 'repair'];
    const typeRanks = nightOptions.map(({ id }) => (
      typeOrder.indexOf(survivalEventById(id)!.cue)
    ));

    expect(typeRanks).toEqual([...typeRanks].sort((left, right) => left - right));
    expect(nightOptions.map(({ id, title }) => ({ id, title }))).toEqual(
      nightOptions.map(({ id }) => {
        const event = survivalEventById(id)!;
        return { id: event.id, title: event.title };
      }),
    );
  });
});
