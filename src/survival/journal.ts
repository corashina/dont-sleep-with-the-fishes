import {
  ITEM_IDS,
  ITEM_LABELS,
  type ItemId,
  type ItemInstanceId,
} from '../game/ItemState';
import type { FishingCatchId } from './fishingCatalog';
import type { EventPresentationKey, WeatherId } from './survivalTypes';

export type JournalResolution = 'suitableItem' | 'unsuitableItem' | 'endure';

export interface JournalInventoryMutation {
  readonly kind: 'consume' | 'break' | 'lose' | 'gain' | 'repair';
  readonly instanceIds: readonly ItemInstanceId[];
}

export interface JournalEventRecord {
  phase: 'day' | 'night';
  eventId: string;
  title: string;
  prompt: string;
  attemptedChoiceId: string | null;
  attemptedItemId: ItemId | null;
  resolution: JournalResolution;
  outcomeCode: string;
  outcomeMessage: string;
  eventPresentationKey?: EventPresentationKey;
  readonly inventoryMutations: readonly JournalInventoryMutation[];
}

export interface JournalSinkingShipRecord {
  readonly kind: 'sinkingShip';
}

export type JournalDaytimeRecord =
  | JournalEventRecord
  | JournalSinkingShipRecord;

export const SINKING_SHIP_DAYTIME_TEXT =
  'Dorothy struck something and began to sink. I reached the lifeboat with the supplies I could save.';

export type JournalNightRecord =
  | { kind: 'event'; event: JournalEventRecord }
  | { kind: 'quiet' };

export interface JournalFishingRecord {
  readonly kind: 'fishing';
  readonly attemptId: string;
  readonly result: 'fish' | 'utility' | 'junk' | 'miss';
  readonly catchId: FishingCatchId | null;
  readonly catchLabel: string | null;
  readonly food: 0 | 1 | 2;
  readonly baitConsumed: boolean;
}

export type JournalDayActionRecord = JournalFishingRecord;

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  readonly actions: readonly JournalDayActionRecord[];
  daytime: JournalDaytimeRecord | null;
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
  if (record.eventPresentationKey === 'check-the-back.face') {
    return 'I looked at me. And I looked back.';
  }
  const timing = record.phase === 'day' ? 'During the day' : 'That night';
  const situation = `${timing}, I encountered ${record.title.toLocaleLowerCase('en-US')}.`;
  let action: string;
  if (record.resolution === 'endure') {
    action = 'I faced it without using any supplies.';
  } else {
    if (record.attemptedItemId === null) {
      throw new Error(
        `Journal event ${record.eventId} with ${record.resolution} resolution requires an attempted item.`,
      );
    }
    const label = ITEM_LABELS[record.attemptedItemId].toLocaleLowerCase('en-US');
    action = record.resolution === 'suitableItem'
      ? `I used the ${label} to handle it, and it helped.`
      : `I tried the ${label}, but it did not help.`;
  }
  return `${situation} ${action}${formatMutations(record.inventoryMutations)}`;
}

function itemLabel(instanceId: ItemInstanceId): string {
  const itemId = ITEM_IDS.find((candidate) => instanceId.startsWith(`${candidate}-`));
  if (itemId === undefined) throw new Error(`Journal mutation contains unknown instance ${instanceId}.`);
  return ITEM_LABELS[itemId].toLocaleLowerCase('en-US');
}

function listLabels(instanceIds: readonly ItemInstanceId[]): string {
  const labels = instanceIds.map(itemLabel);
  if (labels.length < 2) return labels[0] ?? 'item';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function formatMutations(mutations: readonly JournalInventoryMutation[]): string {
  return mutations.map((mutation) => {
    const labels = listLabels(mutation.instanceIds);
    const be = mutation.instanceIds.length === 1 ? 'was' : 'were';
    switch (mutation.kind) {
      case 'break': return ` The ${labels} broke.`;
      case 'consume': return ` The ${labels} ${be} used up.`;
      case 'gain': return ` The ${labels} was brought aboard.`;
      case 'lose': return ` The ${labels} ${be} lost.`;
      case 'repair': return ` The ${labels} ${be} repaired.`;
    }
  }).join('');
}

function formatNight(record: JournalNightRecord): string {
  return record.kind === 'quiet'
    ? 'That night, the sea stayed calm, and I slept without interruption.'
    : formatEvent(record.event);
}

function formatDaytime(record: JournalDaytimeRecord | null): string {
  if (record === null) return 'The daylight hours passed quietly.';
  if ('kind' in record) return SINKING_SHIP_DAYTIME_TEXT;
  return formatEvent(record);
}

function formatFishing(record: JournalFishingRecord): string {
  let sentence: string;
  if (record.result === 'miss') {
    sentence = 'I went fishing, but it got away.';
  } else {
    if (record.catchLabel === null) {
      throw new Error(`Fishing journal record ${record.attemptId} requires a catch label.`);
    }
    const label = record.catchLabel.toLocaleLowerCase('en-US');
    if (record.result === 'utility') {
      sentence = `I reeled in ${label} and brought it aboard.`;
    } else if (record.result === 'junk') {
      sentence = `I reeled in ${label}, but it was no use.`;
    } else {
      sentence = `I caught a ${label} and gained ${record.food === 1 ? 'one' : 'two'} food.`;
    }
  }
  return record.baitConsumed ? `${sentence} I used one bait.` : sentence;
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  const actions = entry.actions.map(formatFishing).join(' ');
  const daytime = formatDaytime(entry.daytime);
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: actions.length === 0 ? daytime : `${actions} ${daytime}`,
    nighttime: formatNight(entry.nighttime),
  };
}
