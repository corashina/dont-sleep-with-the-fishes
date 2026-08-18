import { describe, expect, it } from 'vitest';
import { EVENT_BUNDLE_SPECS } from '../src/survival/eventBundleManifest';
import { EVENT_PRESENTATION_ROUTES } from '../src/survival/eventPresentationRoutes';
import {
  EVENT_ONLY_SOUND_IDS,
  SHARED_SOUND_IDS,
} from '../src/audio/audioManifest';

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

  it('assigns every event-only sound to at least one bundle', () => {
    const bundledSounds = new Set(
      Object.values(EVENT_BUNDLE_SPECS).flatMap(({ sounds }) => sounds),
    );
    const sharedSounds = new Set<string>(SHARED_SOUND_IDS);

    expect(EVENT_ONLY_SOUND_IDS.every((id) => bundledSounds.has(id))).toBe(true);
    expect(EVENT_ONLY_SOUND_IDS.every((id) => !sharedSounds.has(id))).toBe(true);
  });

  it('bundles the dedicated tornado model', () => {
    expect(EVENT_BUNDLE_SPECS.tornado.models).toEqual(['tornadoCore']);
  });
});
