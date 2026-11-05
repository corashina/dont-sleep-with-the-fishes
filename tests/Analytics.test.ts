// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/"}
// Importance: 95/100. Prevents test traffic and incorrect outcome reports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EndingRecord } from '../src/game/ending';

const sendBeacon = vi.fn(() => true);

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('MODE', 'production');
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sendBeacon.mockClear();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});

function sentBodies(): unknown[] {
  return sendBeacon.mock.calls.map(call => {
    const [url, body] = call as unknown as [string, string];
    expect(url).toBe('/api/event');
    return JSON.parse(body);
  });
}

describe('analytics client', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('sends nothing from a build served on %s', async hostname => {
    vi.stubGlobal('window', { location: new URL(`http://${hostname}:4173/`) });
    const analytics = await import('../src/browser/Analytics');
    analytics.trackVisit();
    analytics.trackGameStart();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it.each([
    ['development', ''],
    ['test', ''],
    ['playtest', ''],
    ['production', '?playtest=survival'],
  ])('sends nothing for mode=%s, query=%s', async (mode, query) => {
    vi.stubEnv('MODE', mode);
    window.history.replaceState(null, '', `/${query}`);
    const analytics = await import('../src/browser/Analytics');
    analytics.trackVisit();
    analytics.trackGameStart();
    analytics.trackGameEnd({ id: 'dorothy', day: 0, savedPickupCount: 0 });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('sends visits, starts, and all five endings with only the intended fields', async () => {
    const analytics = await import('../src/browser/Analytics');
    analytics.trackVisit();
    analytics.trackGameStart();
    const endings: EndingRecord[] = [
      { id: 'dorothy', day: 0, savedPickupCount: 2 },
      { id: 'death', day: 4, savedPickupCount: 2, cause: { kind: 'starvation' } },
      { id: 'sinking', day: 5, savedPickupCount: 2, cause: { eventId: null } },
      { id: 'rescue', day: 6, savedPickupCount: 2, signalAssisted: false },
      { id: 'kraken', day: 7, savedPickupCount: 2 },
    ];
    endings.forEach(analytics.trackGameEnd);
    expect(sentBodies()).toEqual([
      { event: 'visit' },
      { event: 'game_start' },
      { event: 'game_end', ending: 'dorothy', day: 0 },
      { event: 'game_end', ending: 'death', day: 4 },
      { event: 'game_end', ending: 'sinking', day: 5 },
      { event: 'game_end', ending: 'rescue', day: 6 },
      { event: 'game_end', ending: 'kraken', day: 7 },
    ]);
  });
});
