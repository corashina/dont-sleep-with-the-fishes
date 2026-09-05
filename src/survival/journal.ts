import {
  ITEM_IDS,
  ITEM_LABELS,
  type ItemInstanceId,
} from '../game/ItemState';
import type {
  JournalCarlitosCareRecord,
  JournalCarlitosDawnRecord,
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalEventRecord,
  JournalFishingRecord,
  JournalInventoryMutation,
  JournalNightRecord,
  JournalSurvivalActionRecord,
} from './journalRecords';
import type { ResourceDelta, WeatherId } from './survivalTypes';

export const SINKING_SHIP_DAYTIME_TEXT =
  'Dorothy struck something and began to sink. I reached the lifeboat with the supplies I could save.';

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
  const action = record.attemptedItemId === null
    ? `I chose \u201c${record.choiceLabel}\u201d.`
    : `I used the ${ITEM_LABELS[record.attemptedItemId].toLocaleLowerCase('en-US')}.`;

  return `${situation} ${action} ${record.outcomeMessage}${formatMutations(record.inventoryMutations)}`;
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

function formatCarlitos(record: JournalCarlitosCareRecord | JournalCarlitosDawnRecord): string {
  if (record.kind === 'carlitosCare') {
    if (record.action === 'pet') return 'I petted Carlitos.';
    if (record.action === 'feed') return 'I fed Carlitos.';
    return 'I treated Carlitos.';
  }
  if (record.before.alive && !record.after.alive) {
    return 'Carlitos died during the night.';
  }
  const changes: string[] = [];
  if (record.before.hunger !== record.after.hunger) {
    changes.push(`hunger ${record.before.hunger} to ${record.after.hunger}`);
  }
  if (record.before.sickness !== record.after.sickness) {
    changes.push(`sickness ${record.before.sickness} to ${record.after.sickness}`);
  }
  if (record.before.unhappiness !== record.after.unhappiness) {
    changes.push(`unhappiness ${record.before.unhappiness} to ${record.after.unhappiness}`);
  }
  if (record.before.energy !== record.after.energy) {
    changes.push(`energy ${record.before.energy} to ${record.after.energy}`);
  }
  if (changes.length > 0) return `Carlitos: ${changes.join('; ')}.`;
  return 'Carlitos changed during the night.';
}

const RESOURCE_LABELS: Readonly<Record<keyof ResourceDelta, string>> = {
  pressure: 'Pressure', health: 'Health', hunger: 'Hunger', energy: 'Energy', hull: 'Hull',
  food: 'Food', bait: 'Bait', rescueLead: 'Rescue lead',
};

function formatSurvivalAction(record: JournalSurvivalActionRecord): string {
  let sentence: string;
  switch (record.action) {
    case 'treat': sentence = 'I treated my wounds.'; break;
    case 'repair': sentence = 'I repaired the hull.'; break;
    case 'repairItem': sentence = 'I repaired my equipment.'; break;
    case 'dive': {
      sentence = 'I dived beneath the boat.';
      const recovered = Object.values(record.deltas).some((delta) => delta > 0);
      if (!recovered) sentence += ' I found no supplies.';
      if ((record.deltas.health ?? 0) < 0) sentence += ' I was injured.';
      break;
    }
  }
  const changes = Object.entries(record.deltas)
    .filter(([, delta]) => delta !== 0)
    .map(([resource, delta]) => `${RESOURCE_LABELS[resource as keyof ResourceDelta]} ${delta > 0 ? '+' : ''}${delta}`);
  const resources = changes.length === 0 ? '' : ` ${changes.join('; ')}.`;
  return `${sentence}${resources}${formatMutations(record.inventoryMutations)}`;
}

function formatDayAction(record: JournalDayActionRecord): string {
  switch (record.kind) {
    case 'fishing': return formatFishing(record);
    case 'dayAction': return formatSurvivalAction(record);
    case 'carlitosCare':
    case 'carlitosDawn': return formatCarlitos(record);
  }
}

export function formatJournalEntry(entry: JournalEntry): JournalPageCopy {
  const actions = entry.actions.map(formatDayAction).join(' ');
  const daytime = entry.daytime === null && actions.length > 0 ? '' : formatDaytime(entry.daytime);
  return {
    heading: `DAY ${entry.day}`,
    weather: WEATHER_LABELS[entry.weather],
    daytime: [actions, daytime].filter(Boolean).join(' '),
    nighttime: formatNight(entry.nighttime),
  };
}
