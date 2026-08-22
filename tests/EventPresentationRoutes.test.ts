// Importance: 9/10. Protects complete event routing and presentation ownership lists.
import { describe, expect, it } from 'vitest';
import { SURVIVAL_EVENT_IDS } from '../src/survival/eventCatalog';
import {
  DEDICATED_EVENT_IDS,
  EVENT_PRESENTATION_ROUTES,
  FEATURED_EVENT_IDS,
  FOCUSED_EVENT_IDS,
  eventPresentationRoute,
} from '../src/survival/eventPresentationRoutes';

describe('event presentation routes', () => {
  it('assigns one route to every live event', () => {
    expect(Object.keys(EVENT_PRESENTATION_ROUTES).sort())
      .toEqual([...SURVIVAL_EVENT_IDS].sort());
    for (const id of SURVIVAL_EVENT_IDS) {
      expect(eventPresentationRoute(id), id).not.toBeNull();
    }
  });

  it('derives the three presentation ownership lists', () => {
    expect(DEDICATED_EVENT_IDS).toHaveLength(8);
    expect(FOCUSED_EVENT_IDS).toHaveLength(5);
    expect(FEATURED_EVENT_IDS).toHaveLength(5);
  });

  it('rejects unknown event IDs', () => {
    expect(eventPresentationRoute('not-an-event')).toBeNull();
  });
});
