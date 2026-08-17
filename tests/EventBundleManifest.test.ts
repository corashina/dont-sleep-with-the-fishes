import { describe, expect, it } from 'vitest';
import { EVENT_BUNDLE_SPECS } from '../src/survival/eventBundleManifest';
import { EVENT_PRESENTATION_ROUTES } from '../src/survival/eventPresentationRoutes';

describe('event bundle manifest', () => {
  it('declares one immutable bundle for every routed event', () => {
    expect(Object.keys(EVENT_BUNDLE_SPECS).sort())
      .toEqual(Object.keys(EVENT_PRESENTATION_ROUTES).sort());
    for (const spec of Object.values(EVENT_BUNDLE_SPECS)) {
      expect(Object.isFrozen(spec)).toBe(true);
      expect(Object.isFrozen(spec.models)).toBe(true);
      expect(Object.isFrozen(spec.sounds)).toBe(true);
    }
  });
});
