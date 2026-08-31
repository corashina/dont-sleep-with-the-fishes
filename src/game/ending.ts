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

const TITLES = Object.freeze({
  dorothy: 'SUNK WITH DOROTHY',
  rescue: 'RESCUE FOUND YOU',
  death: 'THE SEA OUTLASTED YOU',
  sinking: 'THE BOAT IS GONE',
} as const);

export function endingTitle(record: EndingRecord): string {
  return TITLES[record.id];
}

export function endingSummary(record: EndingRecord): string {
  return record.id === 'dorothy' ? 'BEFORE DAY 1' : `DAY ${record.day}`;
}

function titleCaseId(id: string): string {
  return id.split('-').map((part) => (
    part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)
  )).join(' ');
}

export function endingCauseLine(record: EndingRecord): string | null {
  if (record.id !== 'sinking' || record.cause.eventId === null) return null;
  return `LAST EVENT: ${titleCaseId(record.cause.eventId).toLocaleUpperCase('en-US')}`;
}
