import { getLanguage } from '../i18n/language';
import { journalMessage as t } from '../i18n/journalMessages';
import { catchLabel } from '../i18n/itemMessages';
import { survivalEventById } from './eventCatalog';
import { resolveOutcomeText } from './outcomeText';
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
import type { ResourceDelta } from './survivalTypes';

export function sinkingShipDaytimeText(): string { return t('sinking'); }

export interface JournalPageCopy {
  heading: string;
  weather: string;
  daytime: string;
  nighttime: string;
}



function formatEvent(record: JournalEventRecord): string {
  const event = survivalEventById(record.eventId);
  const choice = event?.choices.find(({ id }) => id === record.attemptedChoiceId);
  if (event === undefined || choice === undefined) throw new Error('Invalid journal event reference.');
  const situation = t(record.phase === 'day' ? 'dayEvent' : 'nightEvent', event.title.toLocaleLowerCase(getLanguage()));
  const action = record.attemptedItemId === null ? t('choice', choice.label)
    : t('item', ITEM_LABELS[record.attemptedItemId].toLocaleLowerCase(getLanguage()));
  return [situation, action, resolveOutcomeText(record.text)].join(' ') + formatMutations(record.inventoryMutations);
}

function itemLabel(instanceId: ItemInstanceId): string {
  const itemId = ITEM_IDS.find((candidate) => instanceId.startsWith(`${candidate}-`));
  if (itemId === undefined) throw new Error(`Journal mutation contains unknown instance ${instanceId}.`);
  return ITEM_LABELS[itemId].toLocaleLowerCase(getLanguage());
}

const listFormatters = { en: new Intl.ListFormat('en'), pl: new Intl.ListFormat('pl') };
function listLabels(instanceIds: readonly ItemInstanceId[]): string {
  return listFormatters[getLanguage()].format(instanceIds.map(itemLabel));
}

function formatMutations(mutations: readonly JournalInventoryMutation[]): string {
  return mutations.map((mutation) => {
    const labels = listLabels(mutation.instanceIds);
    switch (mutation.kind) {
      case 'break': return t('break', labels);
      case 'consume': return t('consume', labels, mutation.instanceIds.length);
      case 'gain': return t('gain', labels);
      case 'lose': return t('lose', labels, mutation.instanceIds.length);
      case 'repair': return t('repair', labels, mutation.instanceIds.length);
    }
  }).join('');
}

function formatNight(record: JournalNightRecord): string {
  return record.kind === 'quiet'
    ? t('quietNight')
    : formatEvent(record.event);
}

function formatDaytime(record: JournalDaytimeRecord | null): string {
  if (record === null) return t('quietDay');
  if ('kind' in record) return sinkingShipDaytimeText();
  return formatEvent(record);
}

function formatFishing(record: JournalFishingRecord): string {
  let sentence: string;
  if (record.result === 'miss') {
    sentence = t('fishMiss');
  } else {
    if (record.catchId === null) {
      throw new Error(`Fishing journal record ${record.attemptId} requires a catch label.`);
    }
    const label = catchLabel(record.catchId).toLocaleLowerCase(getLanguage());
    if (record.result === 'utility') {
      sentence = t('fishUtility', label);
    } else if (record.result === 'junk') {
      sentence = t('fishJunk', label);
    } else {
      sentence = t('fishFood', label, record.food);
    }
  }
  return record.baitConsumed ? sentence + t('bait') : sentence;
}

function formatCarlitos(record: JournalCarlitosCareRecord | JournalCarlitosDawnRecord): string {
  if (record.kind === 'carlitosCare') {
    if (record.action === 'pet') return t('pet');
    if (record.action === 'feed') return t('feed');
    return t('treatCarlitos');
  }
  if (record.before.alive && !record.after.alive) {
    return t('carlitosDied');
  }
  const changes: string[] = [];
  if (record.before.hunger !== record.after.hunger) {
    changes.push(t('change', t('hunger').toLocaleLowerCase(getLanguage()), record.before.hunger, record.after.hunger));
  }
  if (record.before.sickness !== record.after.sickness) {
    changes.push(t('change', t('sickness').toLocaleLowerCase(getLanguage()), record.before.sickness, record.after.sickness));
  }
  if (record.before.unhappiness !== record.after.unhappiness) {
    changes.push(t('change', t('unhappiness').toLocaleLowerCase(getLanguage()), record.before.unhappiness, record.after.unhappiness));
  }
  if (record.before.energy !== record.after.energy) {
    changes.push(t('change', t('energy').toLocaleLowerCase(getLanguage()), record.before.energy, record.after.energy));
  }
  if (changes.length > 0) return `Carlitos: ${changes.join('; ')}.`;
  return t('carlitosChanged');
}

function formatSurvivalAction(record: JournalSurvivalActionRecord): string {
  let sentence: string;
  switch (record.action) {
    case 'treat': sentence = t('treated'); break;
    case 'repair': sentence = t('repaired'); break;
    case 'repairItem': sentence = t('repairedItem'); break;
    case 'dive': {
      sentence = t('dived');
      const recovered = Object.values(record.deltas).some((delta) => delta > 0);
      if (!recovered) sentence += t('noSupplies');
      if ((record.deltas.health ?? 0) < 0) sentence += t('injured');
      break;
    }
  }
  const changes = Object.entries(record.deltas)
    .filter(([, delta]) => delta !== 0)
    .map(([resource, delta]) => `${t(resource === 'bait' ? 'baitResource' : resource as Exclude<keyof ResourceDelta, 'bait'>)} ${delta > 0 ? '+' : ''}${delta}`);
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
    heading: t('day', entry.day),
    weather: t(entry.weather),
    daytime: [actions, daytime].filter(Boolean).join(' '),
    nighttime: formatNight(entry.nighttime),
  };
}
