import { ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { WeatherId } from './survivalTypes';

export type JournalResolution = 'suitableItem' | 'unsuitableItem' | 'endure';

export interface JournalEventRecord {
  phase: 'day' | 'night';
  eventId: string;
  title: string;
  prompt: string;
  attemptedItemId: ItemId | null;
  resolution: JournalResolution;
  outcomeCode: string;
  outcomeMessage: string;
}

export type JournalNightRecord =
  | { kind: 'event'; event: JournalEventRecord }
  | { kind: 'quiet' };

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  daytime: JournalEventRecord | null;
  nighttime: JournalNightRecord;
}

export interface JournalPageCopy {
  heading: string;
  weather: string;
  daytime: string;
  nighttime: string;
}

const WEATHER_LABELS: Readonly<Record<WeatherId, string>> = {
  calm: 'CALM',
  overcast: 'OVERCAST',
  squall: 'SQUALL',
};

function formatEvent(record: JournalEventRecord): string {
  const timing = record.phase === 'day' ? 'During the day' : 'That night';
  const situation = `${timing}, I encountered ${record.title.toLocaleLowerCase('en-US')}.`;
  if (record.resolution === 'endure') {
    return `${situation} I faced it without using any supplies.`;
  }
  if (record.attemptedItemId === null) {
    throw new Error(
      `Journal event ${record.eventId} with ${record.resolution} resolution requires an attempted item.`,
    );
  }
  const label = ITEM_LABELS[record.attemptedItemId].toLocaleLowerCase('en-US');
  const action = record.resolution === 'suitableItem'
    ? `I used the ${label} to handle it, and it helped.`
    : `I tried the ${label}, but it did not help.`;
  return `${situation} ${action}`;
}

function formatNight(record: JournalNightRecord): string {
  return record.kind === 'quiet'
    ? 'That night, the sea stayed calm, and I slept without interruption.'
    : formatEvent(record.event);
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: entry.daytime === null
      ? 'The daylight hours passed quietly.'
      : formatEvent(entry.daytime),
    nighttime: formatNight(entry.nighttime),
  };
}
