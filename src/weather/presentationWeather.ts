import type { WeatherId } from '../survival/survivalTypes';

export const PRESENTATION_WEATHER_IDS = Object.freeze([
  'calm', 'overcast', 'squall', 'rain',
  'wind', 'thunderstorm', 'waves', 'fog',
] as const);

export type PresentationWeatherId = typeof PRESENTATION_WEATHER_IDS[number];
export type WeatherControlSource = 'normal' | 'event' | 'forced';

export interface PresentationWeatherProfile {
  readonly id: PresentationWeatherId;
  readonly label: string;
  readonly skyWeather: WeatherId;
  readonly fogDensityScale: number;
  readonly lightIntensityScale: number;
  readonly waveScale: number;
  readonly rainIntensity: number;
  readonly mistIntensity: number;
  readonly sprayIntensity: number;
  readonly lightning: boolean;
}

export interface ResolvedPresentationWeather {
  readonly id: PresentationWeatherId;
  readonly source: WeatherControlSource;
}

const profile = (value: PresentationWeatherProfile): Readonly<PresentationWeatherProfile> => Object.freeze(value);

const PROFILES: Readonly<Record<PresentationWeatherId, Readonly<PresentationWeatherProfile>>> = Object.freeze({
  calm: profile({
    id: 'calm', label: 'Calm', skyWeather: 'calm',
    fogDensityScale: 0.7, lightIntensityScale: 1, waveScale: 0.75,
    rainIntensity: 0, mistIntensity: 0.05, sprayIntensity: 0, lightning: false,
  }),
  overcast: profile({
    id: 'overcast', label: 'Overcast', skyWeather: 'overcast',
    fogDensityScale: 1.15, lightIntensityScale: 0.82, waveScale: 1,
    rainIntensity: 0, mistIntensity: 0.2, sprayIntensity: 0.1, lightning: false,
  }),
  squall: profile({
    id: 'squall', label: 'Squall', skyWeather: 'squall',
    fogDensityScale: 1.5, lightIntensityScale: 0.55, waveScale: 1.5,
    rainIntensity: 0, mistIntensity: 0.6, sprayIntensity: 0.9, lightning: false,
  }),
  rain: profile({
    id: 'rain', label: 'Rain', skyWeather: 'overcast',
    fogDensityScale: 1.55, lightIntensityScale: 0.58, waveScale: 1.15,
    rainIntensity: 1, mistIntensity: 0.55, sprayIntensity: 0.42, lightning: false,
  }),
  wind: profile({
    id: 'wind', label: 'Wind', skyWeather: 'overcast',
    fogDensityScale: 1.15, lightIntensityScale: 0.7, waveScale: 1.45,
    rainIntensity: 0, mistIntensity: 1, sprayIntensity: 1, lightning: false,
  }),
  thunderstorm: profile({
    id: 'thunderstorm', label: 'Thunderstorm', skyWeather: 'squall',
    fogDensityScale: 1.65, lightIntensityScale: 0.48, waveScale: 1.55,
    rainIntensity: 1, mistIntensity: 0.55, sprayIntensity: 0.9, lightning: true,
  }),
  waves: profile({
    id: 'waves', label: 'Waves', skyWeather: 'squall',
    fogDensityScale: 1.15, lightIntensityScale: 0.75, waveScale: 1.7,
    rainIntensity: 0, mistIntensity: 0.15, sprayIntensity: 1, lightning: false,
  }),
  fog: profile({
    id: 'fog', label: 'Fog', skyWeather: 'overcast',
    fogDensityScale: 4.4, lightIntensityScale: 0.38, waveScale: 0.65,
    rainIntensity: 0, mistIntensity: 1, sprayIntensity: 0, lightning: false,
  }),
});

const EVENT_WEATHER: Readonly<Record<string, PresentationWeatherId>> = Object.freeze({
  'dangerous-waters': 'squall',
  leak: 'rain',
  snatcher: 'waves',
  'death-stare': 'waves',
  'swarm-of-sharks': 'overcast',
  tornado: 'wind',
  'shower-night': 'rain',
  'windy-night': 'wind',
  'bad-sleep': 'overcast',
  thunderstorm: 'thunderstorm',
  'restless-waves': 'waves',
  'man-in-the-fog': 'fog',
  ghosts: 'fog',
  'eerie-melody': 'fog',
  'shadow-figure': 'fog',
  'guarded-sleep': 'overcast',
  'check-the-back': 'waves',
  'chest-attack': 'waves',
  'midnight-tour': 'calm',
  handyman: 'overcast',
});

const NORMAL_RESOLUTION: Readonly<ResolvedPresentationWeather> = Object.freeze({ id: 'calm', source: 'normal' });
const EVENT_RESOLUTIONS: Readonly<Record<PresentationWeatherId, Readonly<ResolvedPresentationWeather>>> = Object.freeze(
  Object.fromEntries(PRESENTATION_WEATHER_IDS.map((id) => [id, Object.freeze({ id, source: 'event' as const })])) as Record<
    PresentationWeatherId,
    Readonly<ResolvedPresentationWeather>
  >,
);
const FORCED_RESOLUTIONS: Readonly<Record<PresentationWeatherId, Readonly<ResolvedPresentationWeather>>> = Object.freeze(
  Object.fromEntries(PRESENTATION_WEATHER_IDS.map((id) => [id, Object.freeze({ id, source: 'forced' as const })])) as Record<
    PresentationWeatherId,
    Readonly<ResolvedPresentationWeather>
  >,
);

export function presentationWeatherProfile(id: PresentationWeatherId): Readonly<PresentationWeatherProfile> {
  return PROFILES[id];
}

export function presentationWeatherForEvent(eventId: string): PresentationWeatherId | null {
  return EVENT_WEATHER[eventId] ?? null;
}

export function resolvePresentationWeather(
  eventWeather: PresentationWeatherId | null,
  forcedWeather: PresentationWeatherId | null,
): Readonly<ResolvedPresentationWeather> {
  if (forcedWeather !== null) return FORCED_RESOLUTIONS[forcedWeather];
  if (eventWeather !== null) return EVENT_RESOLUTIONS[eventWeather];
  return NORMAL_RESOLUTION;
}
