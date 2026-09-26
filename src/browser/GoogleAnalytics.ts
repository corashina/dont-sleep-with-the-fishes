import type { EndingRecord } from '../game/ending';

type TagParameters = Record<string, string | number | boolean>;
type TagCommand =
  | ['js', Date]
  | ['config', string, TagParameters]
  | ['event', string, TagParameters?];
type GoogleTag = (...command: TagCommand) => void;

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: GoogleTag;
  }
}

let googleTag: GoogleTag | null = null;

export function initializeAnalytics(): void {
  if (googleTag !== null || !import.meta.env.PROD || import.meta.env.MODE !== 'production') return;
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? '';
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return;
  if (new URLSearchParams(window.location.search).has('playtest')) return;

  window.dataLayer ??= [];
  const dataLayer = window.dataLayer;
  googleTag = function (..._command: TagCommand): void {
    // gtag.js consumes arguments objects from the shared command queue.
    dataLayer.push(arguments);
  };
  window.gtag = googleTag;
  googleTag('js', new Date());
  googleTag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

export function trackGameStart(): void {
  googleTag?.('event', 'game_start');
}

export function trackGameEnding(ending: EndingRecord): void {
  googleTag?.('event', ending.id === 'rescue' || ending.id === 'kraken' ? 'game_win' : 'game_death', {
    ending_type: ending.id,
    survival_day: ending.day,
  });
}
