import { journalMessage as t } from '../i18n/journalMessages';
import { presentationWeatherProfile } from '../weather/presentationWeather';
import { journalCatchName } from '../i18n/journalInventoryMessages';
import { happinessStatus, hungerStatus } from './CarlitosState';
import { formatJournalEvent } from './journalEvents';
import { formatJournalMutations } from './journalInventory';
import type {
  JournalCarlitosCareRecord,
  JournalCarlitosDawnRecord,
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalFishingRecord,
  JournalSurvivalActionRecord,
} from './journalRecords';

export function sinkingShipDaytimeText(): string { return t('sinking'); }

export interface JournalPageCopy {
  heading: string;
  nightHeading: string;
  weather: string;
  nightWeather: string;
  daytime: string;
  nighttime: string;
}

function formatNight(record: JournalEntry['nighttime']): string {
  if (record.kind === 'pending') return t('nightPending');
  return record.kind === 'quiet' ? t('quietNight') : formatJournalEvent(record.event);
}

function formatDaytime(record: JournalDaytimeRecord | null): string {
  if (record === null) return t('quietDay');
  if ('kind' in record) return sinkingShipDaytimeText();
  return formatJournalEvent(record);
}

function formatFishing(record: JournalFishingRecord): string {
  let sentence: string;
  if (record.result === 'miss') {
    sentence = t('fishMiss');
  } else {
    if (record.catchId === null) throw new Error(`Fishing journal record ${record.attemptId} requires a catch label.`);
    const label = journalCatchName(record.catchId);
    const key = record.result === 'utility' ? 'fishUtility' : record.result === 'junk' ? 'fishJunk' : 'fishFood';
    sentence = t(key, label);
  }
  return [sentence, record.baitConsumed ? t('bait') : '',
    formatJournalMutations(record.inventoryMutations)].filter(Boolean).join(' ');
}

function formatCarlitos(record: JournalCarlitosCareRecord | JournalCarlitosDawnRecord): string {
  if (record.kind === 'carlitosCare') {
    if (record.action === 'pet') return t('pet');
    return t('feed');
  }
  return formatCarlitosChanges(record);
}

function formatCarlitosChanges({ before, after }: JournalCarlitosDawnRecord): string {
  return [
    formatCarlitosHunger(before.hunger, after.hunger),
    formatCarlitosMood(before.unhappiness, after.unhappiness),
    formatCarlitosEnergy(before.energy, after.energy),
  ].filter(Boolean).join(' ');
}

function formatCarlitosEnergy(before: number, after: number): string {
  if (before > 0 && after === 0) return t('exhaustedCarlitos');
  if (before === 0 && after > 0) return t('restedCarlitos');
  return after < before ? t('tiredCarlitos') : '';
}

function formatCarlitosHunger(before: number, after: number): string {
  const previous = hungerStatus(before);
  const current = hungerStatus(after);
  if (previous === current) return '';
  if (after > before) return previous === 'hungry' || previous === 'starving' ? t('fuller') : '';
  if (current === 'hungry') return t('hungryCarlitos');
  if (current === 'starving') return t('starvingCarlitos');
  return '';
}

function formatCarlitosMood(before: number, after: number): string {
  const previous = happinessStatus(before);
  const current = happinessStatus(after);
  if (previous === current) return '';
  if (after < before) return previous === 'bored' || previous === 'happy' ? '' : t('happier');
  if (current === 'lonely') return t('lonelyCarlitos');
  if (current === 'depressed') return t('depressedCarlitos');
  if (current === 'miserable') return t('miserableCarlitos');
  return '';
}

function formatDive(record: JournalSurvivalActionRecord): string {
  const sentences = [t('dived')];
  const { food = 0, bait = 0, rescueLead = 0, health = 0 } = record.deltas;
  if (food > 0) sentences.push(t('foundFood'));
  if (bait > 0) sentences.push(t('foundBait'));
  if (rescueLead > 0) sentences.push(t('foundLead'));
  const gainedItem = record.inventoryMutations.some(({ kind, instanceIds }) => kind === 'gain' && instanceIds.length > 0);
  if (Math.max(food, bait, rescueLead) <= 0 && !gainedItem) sentences.push(t('noSupplies'));
  if (health < 0) sentences.push(t('injured'));
  return sentences.join(' ');
}

function formatSurvivalAction(record: JournalSurvivalActionRecord): string {
  let sentence: string;
  switch (record.action) {
    case 'treat': sentence = t('treated'); break;
    case 'repair': sentence = t('repaired'); break;
    case 'repairItem': sentence = t('repairedItem'); break;
    case 'discardItem': sentence = ''; break;
    case 'dive': sentence = formatDive(record); break;
  }
  return [sentence, formatJournalMutations(record.inventoryMutations)].filter(Boolean).join(' ');
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
  const actions = entry.actions.filter((action) => action.kind !== 'carlitosDawn').map(formatDayAction).filter(Boolean).join(' ');
  const dawn = entry.actions.filter((action) => action.kind === 'carlitosDawn').map(formatDayAction).filter(Boolean);
  const daytime = entry.daytime === null && actions.length > 0 ? '' : formatDaytime(entry.daytime);
  return {
    heading: t('day', entry.day),
    nightHeading: t('night', entry.day),
    weather: presentationWeatherProfile(entry.weather).label,
    nightWeather: entry.nightWeather === null ? '' : presentationWeatherProfile(entry.nightWeather).label,
    daytime: [actions, daytime].filter(Boolean).join(' '),
    nighttime: [formatNight(entry.nighttime), ...dawn].join(' '),
  };
}
