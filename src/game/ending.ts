import { defineMessages } from '../i18n/messages';
import { getLanguage } from '../i18n/language';
import { survivalEventById } from '../survival/eventCatalog';

export type DeathCause =
  | { readonly kind: 'starvation' }
  | { readonly kind: 'diving' }
  | { readonly kind: 'event'; readonly eventId: string }
  | { readonly kind: 'other' };

export type EndingRecord =
  | { readonly id: 'dorothy'; readonly day: 0; readonly savedPickupCount: number }
  | { readonly id: 'rescue'; readonly day: number; readonly savedPickupCount: number; readonly signalAssisted: boolean }
  | { readonly id: 'death'; readonly day: number; readonly savedPickupCount: number; readonly cause: DeathCause }
  | { readonly id: 'sinking'; readonly day: number; readonly savedPickupCount: number; readonly cause: { readonly eventId: string | null } };

export type SurvivalEndingId = Exclude<EndingRecord['id'], 'dorothy'>;

const t = defineMessages({
  dorothy: { en: 'SUNK WITH DOROTHY', pl: 'NA DNIE Z DOROTHY' },
  rescue: { en: 'RESCUE FOUND YOU', pl: 'NADESZŁA POMOC' },
  death: { en: 'THE SEA OUTLASTED YOU', pl: 'MORZE PRZETRWAŁO DŁUŻEJ' },
  sinking: { en: 'THE BOAT IS GONE', pl: 'ŁÓDŹ ZNIKNĘŁA' },
  beforeDay: { en: 'BEFORE DAY 1', pl: 'PRZED DNIEM 1' },
  day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}` },
  event: { en: (title: string) => `LAST EVENT: ${title}`, pl: (title: string) => `OSTATNIE ZDARZENIE: ${title}` },
});

export function endingTitle(record: EndingRecord): string {
  return t(record.id);
}

export function endingSummary(record: EndingRecord): string {
  return record.id === 'dorothy' ? t('beforeDay') : t('day', record.day);
}

export function endingCauseLine(record: EndingRecord): string | null {
  if (record.id !== 'sinking' || record.cause.eventId === null) return null;
  const event = survivalEventById(record.cause.eventId);
  if (event === undefined) throw new Error(`Unknown ending event: ${record.cause.eventId}`);
  return t('event', event.title.toLocaleUpperCase(getLanguage()));
}
