import type { AnalyticsEndingId, AnalyticsEvent } from '../analytics/eventContract';
import type { EndingRecord } from '../game/ending';

const ENDPOINT = '/api/event';

let enabled: boolean | null = null;

function isEnabled(): boolean {
  enabled ??= import.meta.env.PROD
    && import.meta.env.MODE === 'production'
    && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
    && !new URLSearchParams(window.location.search).has('playtest');
  return enabled;
}

function send(event: AnalyticsEvent): void {
  if (!isEnabled()) return;
  navigator.sendBeacon(ENDPOINT, JSON.stringify(event));
}

export function trackVisit(): void {
  send({ event: 'visit' });
}

export function trackGameStart(): void {
  send({ event: 'game_start' });
}

export function trackGameEnd(ending: EndingRecord): void {
  const id: AnalyticsEndingId = ending.id;
  send({ event: 'game_end', ending: id, day: ending.day });
}
