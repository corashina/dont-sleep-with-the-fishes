// Importance: 8/10. Protects direct debug launches for authored event variants.
import { describe, expect, it } from 'vitest';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';

describe('event test options', () => {
  it('replaces Check the Back with forced fish and bad variants', () => {
    expect(EVENT_TEST_OPTIONS.filter(({ id }) => id.startsWith('check-the-back')))
      .toEqual([
        {
          id: 'check-the-back-fish',
          title: 'Check the Back Fish',
          phase: 'night',
          eventId: 'check-the-back',
          resultId: 'check-the-back.fish',
        },
        {
          id: 'check-the-back-bad',
          title: 'Check the Back Bad',
          phase: 'night',
          eventId: 'check-the-back',
          resultId: 'check-the-back.bad',
        },
      ]);
  });

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
