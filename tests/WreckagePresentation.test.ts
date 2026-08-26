import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInactiveVortexWaveState } from '../src/ocean/WaveField';
import { WreckagePresentation } from '../src/survival/events/WreckagePresentation';
import type {
  DedicatedEventEnvironment,
  EventOutcomePresentation,
} from '../src/survival/eventPresentationTypes';

function modelGroup(id: string): Group {
  const root = new Group();
  root.name = `model:${id}`;
  const dimensions = id === 'containerShip' ? [6, 3, 16] : [1, 0.8, 1.2];
  root.add(new Mesh(new BoxGeometry(...dimensions), new MeshStandardMaterial()));
  return root;
}

function createEnvironment() {
  const created: string[] = [];
  const cloned: string[] = [];
  const ownedModelDispose = vi.fn();
  const environment = {
    eventModels: {
      create: vi.fn((id: string) => {
        created.push(id);
        return {
          root: modelGroup(id),
          dispose: () => ownedModelDispose(id),
        };
      }),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    },
    featuredModels: {
      clone: vi.fn((id: string) => {
        cloned.push(id);
        return modelGroup(id);
      }),
    },
    supplies: { setPresentationItemHidden: vi.fn() },
    carlitos: {},
    vortexWave: createInactiveVortexWaveState(),
    sampleWorldWaveInto: vi.fn(),
    readWorldWaveAmplitudeScale: () => 1,
    camera: new PerspectiveCamera(65, 16 / 9, 0.08, 220),
    cameraEffectsRoot: new Group(),
    dive: {
      play: vi.fn(async () => undefined),
      clear: vi.fn(),
      settleForVisibilityChange: vi.fn(),
    },
    delegateCarlitos: vi.fn(async (retrieve: () => Promise<void>) => retrieve()),
  } as unknown as DedicatedEventEnvironment;
  return { environment, created, cloned, ownedModelDispose };
}

function outcomePresentation(): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event',
      message: '',
      deltas: {},
      cue: 'none',
      eventPresentationKey: 'wreckage.dive-creature',
    },
    resourceDeltas: {},
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: null,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

function stage(presentation: WreckagePresentation): Group {
  presentation.stage({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
  return presentation.worldRoot.getObjectByName('wreckage-surface-debris') as Group;
}

describe('WreckagePresentation', () => {
  it('creates the approved models and eight starboard debris objects', () => {
    const { environment, created, cloned } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);

    expect(created).toEqual([
      'containerShip',
      'wreckageBox',
      'wreckageCrate',
      'wreckagePallet',
    ]);
    expect(cloned).toEqual([]);
    expect(debris.children).toHaveLength(8);
    expect(debris.children.every((child) => child.position.x > 0)).toBe(true);
    presentation.dispose();
  });

  it('shares one geometry and material array across five procedural planks', () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const planks = stage(presentation).children.filter(
      (child): child is Mesh => child instanceof Mesh,
    );

    expect(planks).toHaveLength(5);
    expect(planks[0]!.material).toBeInstanceOf(Array);
    for (const plank of planks.slice(1)) {
      expect(plank.geometry).toBe(planks[0]!.geometry);
      expect(plank.material).toBe(planks[0]!.material);
    }
    presentation.dispose();
  });

  it('keeps the complete ship submerged and hidden during surface focus', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    stage(presentation);
    const wreck = presentation.worldRoot.getObjectByName('wreckage-wreck')!;
    const reveal = presentation.reveal();
    presentation.update(1.2, 1.2);
    await reveal;

    expect(new Box3().setFromObject(wreck).max.y).toBeLessThan(-0.5);
    expect(wreck.visible).toBe(false);
    expect(presentation.interactionTargets()).toHaveLength(1);
    expect(wreck.visible).toBe(false);
    presentation.dispose();
  });

  it('publishes one focus target rooted at the complete debris group', () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);

    expect(presentation.interactionTargets()).toEqual([
      expect.objectContaining({
        id: 'event:wreckage',
        focusEventId: 'wreckage',
        root: debris,
      }),
    ]);
    expect(presentation.interactionRoot('event:wreckage')).toBe(debris);
    expect(presentation.interactionRoot('missing')).toBeNull();
    expect(presentation.itemAimTarget.position.x).toBeGreaterThan(0);
    presentation.dispose();
  });

  it('floats existing debris objects in place with deterministic phases', () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);
    const children = [...debris.children];
    const firstY = children.map((child) => child.position.y);

    presentation.update(2.4, 0.2);

    expect(debris.children).toEqual(children);
    expect(children.map((child) => child.position.y)).not.toEqual(firstY);
    expect(children.every((child) => child.position.x > 0)).toBe(true);
    presentation.dispose();
  });

  it('resolves results without restoring obsolete Wreckage actors', async () => {
    const { environment, ownedModelDispose } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    stage(presentation);

    await expect(presentation.react(outcomePresentation())).resolves.toBeUndefined();
    for (const name of [
      'wreckage-search-injury-flash',
      'wreckage-recovered-debris',
      'wreckage-loot',
      'wreckage-silt',
      'wreckage-creature',
      'wreckage-ghost',
    ]) {
      expect(presentation.worldRoot.getObjectByName(name)).toBeUndefined();
      expect(presentation.boatRoot.getObjectByName(name)).toBeUndefined();
    }

    presentation.dispose();
    expect(ownedModelDispose.mock.calls.map(([id]) => id)).toEqual([
      'containerShip',
      'wreckageBox',
      'wreckageCrate',
      'wreckagePallet',
    ]);
  });
});
