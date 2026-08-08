import type { SurvivalEventId } from './events';

export type EventPresentationRoute =
  | 'dangerousWaters'
  | 'dedicated'
  | 'focused'
  | 'featured'
  | 'weather'
  | 'supernatural'
  | 'moon';

export const EVENT_PRESENTATION_ROUTES = Object.freeze({
  'dangerous-waters': 'dangerousWaters',
  leak: 'dedicated',
  'school-of-fish': 'dedicated',
  snatcher: 'dedicated',
  'death-stare': 'dedicated',
  'swarm-of-anglerfish': 'dedicated',
  whirlpool: 'dedicated',
  'shower-night': 'weather',
  'windy-night': 'weather',
  'bad-sleep': 'weather',
  thunderstorm: 'weather',
  'restless-waves': 'weather',
  'man-in-the-fog': 'weather',
  ghosts: 'supernatural',
  'eerie-melody': 'supernatural',
  'face-on-the-moon': 'moon',
  'sick-companion': 'dedicated',
  'shadow-figure': 'dedicated',
  'sea-watcher': 'dedicated',
  'guarded-sleep': 'dedicated',
  'drifting-loot': 'featured',
  'drifting-bottle': 'featured',
  'check-the-back': 'featured',
  'mystery-chest': 'featured',
  flowers: 'featured',
  'chest-attack': 'focused',
  'midnight-tour': 'focused',
  'night-trader': 'focused',
  handyman: 'focused',
  'other-people': 'focused',
} as const satisfies Readonly<Record<SurvivalEventId, EventPresentationRoute>>);

export type EventIdForRoute<Route extends EventPresentationRoute> = {
  [Id in keyof typeof EVENT_PRESENTATION_ROUTES]:
    typeof EVENT_PRESENTATION_ROUTES[Id] extends Route ? Id : never;
}[keyof typeof EVENT_PRESENTATION_ROUTES];

function idsForRoute<Route extends EventPresentationRoute>(
  route: Route,
): readonly EventIdForRoute<Route>[] {
  return Object.freeze(Object.entries(EVENT_PRESENTATION_ROUTES)
    .filter(([, value]) => value === route)
    .map(([id]) => id as EventIdForRoute<Route>));
}

export const DEDICATED_EVENT_IDS = idsForRoute('dedicated');
export const FOCUSED_EVENT_IDS = idsForRoute('focused');
export const FEATURED_EVENT_IDS = idsForRoute('featured');

export type DedicatedEventId = EventIdForRoute<'dedicated'>;
export type FocusedEventId = EventIdForRoute<'focused'>;
export type FeaturedEventId = EventIdForRoute<'featured'>;
export type WeatherAnimationEventId = EventIdForRoute<'weather'>;
export type SupernaturalAnimationEventId = EventIdForRoute<'supernatural'>;

export function eventPresentationRoute(
  eventId: string,
): EventPresentationRoute | null {
  return Object.hasOwn(EVENT_PRESENTATION_ROUTES, eventId)
    ? EVENT_PRESENTATION_ROUTES[eventId as SurvivalEventId]
    : null;
}

export function isEventPresentationRoute<Route extends EventPresentationRoute>(
  eventId: string,
  route: Route,
): eventId is EventIdForRoute<Route> {
  return eventPresentationRoute(eventId) === route;
}
