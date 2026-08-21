import { describe, expect, it } from 'vitest';
import {
  endingCauseLine,
  endingEpilogue,
  endingSummary,
  endingTitle,
  type EndingRecord,
} from '../src/game/ending';

const records: readonly EndingRecord[] = [
  { id: 'dorothy', day: 0, savedPickupCount: 7 },
  { id: 'rescue', day: 30, savedPickupCount: 18, signalAssisted: false },
  { id: 'rescue', day: 29, savedPickupCount: 18, signalAssisted: true },
  { id: 'death', day: 22, savedPickupCount: 18, cause: { kind: 'starvation' } },
  { id: 'sinking', day: 27, savedPickupCount: 18, cause: { eventId: 'thunderstorm' } },
  { id: 'taken', day: 26, savedPickupCount: 18 },
];

describe('ending records', () => {
  it('uses the five approved titles', () => {
    expect(records.map(endingTitle)).toEqual([
      'SUNK WITH DOROTHY',
      'RESCUE FOUND YOU',
      'RESCUE FOUND YOU',
      'THE SEA OUTLASTED YOU',
      'THE BOAT IS GONE',
      'TAKEN IN THE DARK',
    ]);
  });

  it('selects natural and signal rescue epilogues', () => {
    expect(endingEpilogue(records[1]!)).toBe('At dawn, an engine answered the empty horizon.');
    expect(endingEpilogue(records[2]!)).toBe('A distant crew followed the signs you left across the sea.');
  });

  it('formats day and pickup count without hidden data', () => {
    expect(endingSummary(records[2]!)).toBe('DAY 29 · 18 PICKUPS SAVED');
    expect(endingSummary(records[0]!)).toBe('BEFORE DAY 1 · 7 PICKUPS SAVED');
  });

  it('names the sinking event without importing the event catalog', () => {
    expect(endingCauseLine(records[4]!)).toBe('LAST EVENT: THUNDERSTORM');
  });
});
