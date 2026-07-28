import { describe, expect, it } from 'vitest';
import { formatJournalEntry } from '../src/survival/journal';

describe('survival journal fishing copy', () => {
  it('records utility salvage without calling it food or junk', () => {
    expect(formatJournalEntry({
      day: 3,
      weather: 'calm',
      actions: [{
        kind: 'fishing',
        attemptId: 'fishing-3-1',
        result: 'utility',
        catchId: 'brokenCompass',
        catchLabel: 'Broken Compass',
        food: 0,
        baitConsumed: false,
      }],
      daytime: null,
      nighttime: { kind: 'quiet' },
    }).daytime).toContain(
      'I reeled in broken compass and brought it aboard.',
    );
  });
});
