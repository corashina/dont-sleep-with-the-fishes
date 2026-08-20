// Importance: 8/10. Protects direct debug launches for authored event variants.
import { describe, expect, it } from 'vitest';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';

describe('event test options', () => {
  it('replaces the random Midnight Tour entry with chest and monster variants', () => {
    const midnightTourOptions = EVENT_TEST_OPTIONS.filter(({ id }) => (
      id.startsWith('midnight-tour')
    ));

    expect(midnightTourOptions).toEqual([
      {
        id: 'midnight-tour-chest',
        title: 'Midnight Tour Chest',
        phase: 'night',
        eventId: 'midnight-tour',
        resultId: 'tour-chest',
      },
      {
        id: 'midnight-tour-monster',
        title: 'Midnight Tour Monster',
        phase: 'night',
        eventId: 'midnight-tour',
        resultId: 'tour-attack',
      },
    ]);
  });
});
