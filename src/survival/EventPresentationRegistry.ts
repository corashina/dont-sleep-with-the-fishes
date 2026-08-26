import type { EventPresentationAdapter } from './EventPresentationAdapter';
import type { SurvivalEventId } from './eventCatalog';
import {
  EVENT_PRESENTATION_ROUTES,
  type EventPresentationRoute,
} from './eventPresentationRoutes';
import {
  createDangerousWatersAdapter,
  createDedicatedAdapter,
  createFeaturedAdapter,
  createFocusedAdapter,
  createMoonAdapter,
  createStarryAdapter,
  createSupernaturalAdapter,
  createWeatherAdapter,
  type EventPresentationAdapterDependencies,
  type EventPresentationAdapterFactory,
} from './eventPresentationAdapters';

export type {
  EventPresentationAdapterDependencies,
  EventPresentationAdapterFactory,
} from './eventPresentationAdapters';

const DEFAULT_EVENT_PRESENTATION_FACTORIES = Object.freeze({
  dangerousWaters: createDangerousWatersAdapter,
  dedicated: createDedicatedAdapter,
  focused: createFocusedAdapter,
  featured: createFeaturedAdapter,
  weather: createWeatherAdapter,
  supernatural: createSupernaturalAdapter,
  moon: createMoonAdapter,
  starry: createStarryAdapter,
} satisfies Readonly<Record<
  EventPresentationRoute,
  EventPresentationAdapterFactory
>>);

export class EventPresentationRegistry {
  constructor(
    private readonly factories: Readonly<Record<
      EventPresentationRoute,
      EventPresentationAdapterFactory
    >> = DEFAULT_EVENT_PRESENTATION_FACTORIES,
  ) {}

  create(
    eventId: SurvivalEventId,
    dependencies: EventPresentationAdapterDependencies,
  ): EventPresentationAdapter {
    const route = EVENT_PRESENTATION_ROUTES[eventId];
    const factory: EventPresentationAdapterFactory | undefined = route === undefined
      ? undefined
      : this.factories[route];
    if (factory === undefined) {
      throw new Error(`Missing event presentation factory: ${eventId}`);
    }
    return factory(eventId, dependencies);
  }
}
