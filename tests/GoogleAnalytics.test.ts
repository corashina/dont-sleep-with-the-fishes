// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/dont-sleep-with-the-fishes/"}
// Importance: 95/100. Prevents test traffic, duplicate page views, and incorrect outcome reports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EndingRecord } from '../src/game/ending';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-1234567890');
  window.history.replaceState(null, '', '/dont-sleep-with-the-fishes/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  delete window.dataLayer;
  delete window.gtag;
});

describe('Google Analytics', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('sends nothing from a build served on %s', async hostname => {
    vi.stubGlobal('window', { location: new URL(`http://${hostname}:4173/`) });
    const analytics = await import('../src/browser/GoogleAnalytics');
    analytics.initializeAnalytics();
    analytics.trackGameStart();
    expect(document.querySelector('script')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it.each([
    ['development', 'G-1234567890', ''],
    ['test', 'G-1234567890', ''],
    ['playtest', 'G-1234567890', ''],
    ['production', '', ''],
    ['production', 'invalid-id', ''],
    ['production', 'G-1234567890', '?playtest=survival'],
  ])('sends nothing for mode=%s, id=%s, query=%s', async (mode, id, query) => {
    vi.stubEnv('MODE', mode);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', id);
    window.history.replaceState(null, '', `/dont-sleep-with-the-fishes/${query}`);
    const analytics = await import('../src/browser/GoogleAnalytics');
    analytics.initializeAnalytics();
    analytics.trackGameStart();
    analytics.trackGameEnding({ id: 'dorothy', day: 0, savedPickupCount: 0 });
    expect(document.querySelector('script')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads one asynchronous tag and configures one page view', async () => {
    const analytics = await import('../src/browser/GoogleAnalytics');
    analytics.initializeAnalytics();
    analytics.initializeAnalytics();
    const scripts = document.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.async).toBe(true);
    expect(scripts[0]!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-1234567890');
    expect(window.dataLayer!.map(command => Array.from(command))).toEqual([
      ['js', expect.any(Date)],
      ['config', 'G-1234567890', expect.any(Object)],
    ]);
  });

  it('queues starts and all five outcomes with only the intended event fields', async () => {
    const analytics = await import('../src/browser/GoogleAnalytics');
    analytics.initializeAnalytics();
    analytics.trackGameStart();
    const endings: EndingRecord[] = [
      { id: 'dorothy', day: 0, savedPickupCount: 2 },
      { id: 'death', day: 4, savedPickupCount: 2, cause: { kind: 'starvation' } },
      { id: 'sinking', day: 5, savedPickupCount: 2, cause: { eventId: null } },
      { id: 'rescue', day: 6, savedPickupCount: 2, signalAssisted: false },
      { id: 'kraken', day: 7, savedPickupCount: 2 },
    ];
    endings.forEach(analytics.trackGameEnding);
    expect(window.dataLayer!.slice(2).map(command => Array.from(command))).toEqual([
      ['event', 'game_start'],
      ['event', 'game_death', { ending_type: 'dorothy', survival_day: 0 }],
      ['event', 'game_death', { ending_type: 'death', survival_day: 4 }],
      ['event', 'game_death', { ending_type: 'sinking', survival_day: 5 }],
      ['event', 'game_win', { ending_type: 'rescue', survival_day: 6 }],
      ['event', 'game_win', { ending_type: 'kraken', survival_day: 7 }],
    ]);
  });
});
