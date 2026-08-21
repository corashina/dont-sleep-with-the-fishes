export type DeathCause =
  | { readonly kind: 'starvation' }
  | { readonly kind: 'diving' }
  | { readonly kind: 'event'; readonly eventId: string }
  | { readonly kind: 'other' };

export type EndingRecord =
  | { readonly id: 'dorothy'; readonly day: 0; readonly savedPickupCount: number }
  | { readonly id: 'rescue'; readonly day: number; readonly savedPickupCount: number; readonly signalAssisted: boolean }
  | { readonly id: 'death'; readonly day: number; readonly savedPickupCount: number; readonly cause: DeathCause }
  | { readonly id: 'sinking'; readonly day: number; readonly savedPickupCount: number; readonly cause: { readonly eventId: string | null } }
  | { readonly id: 'taken'; readonly day: number; readonly savedPickupCount: number };

const TITLES = Object.freeze({
  dorothy: 'SUNK WITH DOROTHY',
  rescue: 'RESCUE FOUND YOU',
  death: 'THE SEA OUTLASTED YOU',
  sinking: 'THE BOAT IS GONE',
  taken: 'TAKEN IN THE DARK',
} as const);

export function endingTitle(record: EndingRecord): string {
  return TITLES[record.id];
}

export function endingEpilogue(record: EndingRecord): string {
  if (record.id === 'dorothy') return 'Dorothy took you down before the lifeboat cleared her side.';
  if (record.id === 'rescue') return record.signalAssisted
    ? 'A distant crew followed the signs you left across the sea.'
    : 'At dawn, an engine answered the empty horizon.';
  if (record.id === 'taken') return 'The light found something that had been waiting for you.';
  if (record.id === 'sinking') return 'The last damage opened the boat to the sea.';
  if (record.cause.kind === 'starvation') return 'Hunger left you too weak to meet another dawn.';
  if (record.cause.kind === 'diving') return 'The water returned you to the boat, but not for long.';
  if (record.cause.kind === 'event') return 'The last encounter left wounds the next dawn could not mend.';
  return 'Your strength failed before help crossed the horizon.';
}

export function endingSummary(record: EndingRecord): string {
  const day = record.id === 'dorothy' ? 'BEFORE DAY 1' : `DAY ${record.day}`;
  return `${day} · ${record.savedPickupCount} PICKUPS SAVED`;
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
