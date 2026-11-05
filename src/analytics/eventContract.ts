export const ENDING_IDS = ['dorothy', 'death', 'sinking', 'rescue', 'kraken'] as const;
export type AnalyticsEndingId = typeof ENDING_IDS[number];

export const MAX_EVENT_BYTES = 256;
const MAX_DAY = 999;

export type AnalyticsEvent =
  | { readonly event: 'visit' }
  | { readonly event: 'game_start' }
  | { readonly event: 'game_end'; readonly ending: AnalyticsEndingId; readonly day: number };

export function parseEvent(text: string): AnalyticsEvent | null {
  const record = parseRecord(text);
  if (record === null) return null;
  const keys = Object.keys(record).sort().join(',');
  if ((record.event === 'visit' || record.event === 'game_start') && keys === 'event') {
    return { event: record.event };
  }
  if (record.event !== 'game_end' || keys !== 'day,ending,event') return null;
  return parseGameEnd(record.ending, record.day);
}

function parseRecord(text: string): Record<string, unknown> | null {
  if (new TextEncoder().encode(text).byteLength > MAX_EVENT_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseGameEnd(ending: unknown, day: unknown): AnalyticsEvent | null {
  if (!ENDING_IDS.includes(ending as AnalyticsEndingId)) return null;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > MAX_DAY) return null;
  return { event: 'game_end', ending: ending as AnalyticsEndingId, day };
}
