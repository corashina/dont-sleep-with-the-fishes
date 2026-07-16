import {
  ITEM_IDS,
  ITEM_LABELS,
  type ItemId,
  type ItemInstanceId,
} from '../game/ItemState';
import type { WeatherId } from './survivalTypes';

export type JournalResolution = 'suitableItem' | 'unsuitableItem' | 'endure';

export interface JournalInventoryMutation {
  readonly kind: 'consume' | 'break' | 'lose' | 'repair';
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
  readonly inventoryMutations: readonly JournalInventoryMutation[];
}

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  daytime: JournalEventRecord | null;
  nighttime: JournalEventRecord;
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
      case 'lose': return ` The ${labels} ${be} lost.`;
      case 'repair': return ` The ${labels} ${be} repaired.`;
    }
  }).join('');
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: entry.daytime === null
      ? 'The daylight hours passed quietly.'
      : formatEvent(entry.daytime),
    nighttime: formatEvent(entry.nighttime),
  };
}
