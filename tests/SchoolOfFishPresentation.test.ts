import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { EVENT_BUNDLE_SPECS } from '../src/survival/eventBundleManifest';
import {
  EVENT_MODEL_SPECS,
  type EventModelId,
} from '../src/survival/eventModelManifest';
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';

describe('SchoolOfFishPresentation', () => {
  it('preloads each school fish model', () => {
    expect(EVENT_BUNDLE_SPECS['school-of-fish'].models).toEqual([
      'schoolFish',
      'cod',
      'bass',
      'redSnapper',
    ]);
  });

  it('points each school fish model along the swim direction', () => {
    expect(EVENT_MODEL_SPECS.schoolFish.rotation[1]).toBe(-Math.PI / 2);
    expect(EVENT_MODEL_SPECS.cod.rotation[1]).toBe(Math.PI);
    expect(EVENT_MODEL_SPECS.bass.rotation[1]).toBe(-Math.PI / 2);
    expect(EVENT_MODEL_SPECS.redSnapper.rotation[1]).toBe(-Math.PI / 2);
  });

  it('mixes fishing catch models into the school', () => {
    const createdIds: EventModelId[] = [];
    const presentation = new SchoolOfFishPresentation({
      eventModels: {
        create: (id: EventModelId) => {
          createdIds.push(id);
          return { root: new Group(), dispose: vi.fn() };
        },
      },
    } as never);

    const schoolIds = createdIds.slice(0, 24);
    expect(schoolIds.filter((id) => id === 'schoolFish')).toHaveLength(15);
    expect(schoolIds.filter((id) => id === 'cod')).toHaveLength(3);
    expect(schoolIds.filter((id) => id === 'bass')).toHaveLength(3);
    expect(schoolIds.filter((id) => id === 'redSnapper')).toHaveLength(3);
    expect(createdIds.at(-1)).toBe('schoolFish');

    presentation.dispose();
  });
});
