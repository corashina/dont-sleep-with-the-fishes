import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInactiveVortexWaveState } from '../src/ocean/WaveField';
import { WreckagePresentation } from '../src/survival/events/WreckagePresentation';
import type {
  DedicatedEventEnvironment,
  EventOutcomePresentation,
} from '../src/survival/eventPresentationTypes';

const NORMALIZED_DEBRIS_DIMENSIONS: Readonly<Record<string, readonly [number, number, number]>> = {
  wreckageBox: [0.886, 0.782, 0.9],
  wreckageCrate: [1.05, 1.05, 1.05],
  wreckagePallet: [1.8, 0.205, 1.546],
};

function modelGroup(id: string, normalizedDebrisBounds = false): Group {
  const root = new Group();
  root.name = `model:${id}`;
  const normalizedDimensions = NORMALIZED_DEBRIS_DIMENSIONS[id];
  if (normalizedDebrisBounds && normalizedDimensions !== undefined) {
    root.add(new Mesh(new BoxGeometry(...normalizedDimensions), new MeshStandardMaterial()));
    return root;
  }
  root.position.set(0.31, -0.22, 0.14);
  root.scale.setScalar(0.27);
  const dimensions = id === 'containerShip' ? [6, 3, 16] : [1, 0.8, 1.2];
  root.add(new Mesh(new BoxGeometry(...dimensions), new MeshStandardMaterial()));
  return root;
}

function createEnvironment(options: { readonly normalizedDebrisBounds?: boolean } = {}) {
  const created: string[] = [];
  const cloned: string[] = [];
  const ownedModelDispose = vi.fn();
  const environment = {
    eventModels: {
      create: vi.fn((id: string) => {
        created.push(id);
        return {
          root: modelGroup(id, options.normalizedDebrisBounds ?? false),
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
    underwaterView: {
      enter: vi.fn(),
      exit: vi.fn(),
    },
    delegateCarlitos: vi.fn(async (retrieve: () => Promise<void>) => retrieve()),
  } as unknown as DedicatedEventEnvironment;
  return { environment, created, cloned, ownedModelDispose };
}

function horizontalBoundsGap(first: Object3D, second: Object3D): number {
  const firstBounds = new Box3().setFromObject(first);
  const secondBounds = new Box3().setFromObject(second);
  const xGap = Math.max(
    0,
    firstBounds.min.x - secondBounds.max.x,
    secondBounds.min.x - firstBounds.max.x,
  );
  const zGap = Math.max(
    0,
    firstBounds.min.z - secondBounds.max.z,
    secondBounds.min.z - firstBounds.max.z,
  );
  return Math.hypot(xGap, zGap);
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

  it('keeps clear water between every normalized debris bound', () => {
    const { environment } = createEnvironment({ normalizedDebrisBounds: true });
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);
    const minimumGap = 0.18;

    for (const object of debris.children) {
      expect(new Box3().setFromObject(object).min.x, object.name).toBeGreaterThan(0);
      expect(Math.abs(object.position.y), object.name).toBeLessThan(0.2);
    }
    for (let first = 0; first < debris.children.length; first += 1) {
      for (let second = first + 1; second < debris.children.length; second += 1) {
        const firstObject = debris.children[first]!;
        const secondObject = debris.children[second]!;
        expect(
          horizontalBoundsGap(firstObject, secondObject),
          `${firstObject.name} and ${secondObject.name}`,
        ).toBeGreaterThan(minimumGap);
      }
    }
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

  it('preserves normalized model scale and offset while its placement floats', () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);
    const placement = debris.getObjectByName('wreckage-box')!;
    const model = placement.children[0]!;
    const shipPlacement = presentation.worldRoot.getObjectByName('wreckage-wreck')!;
    const shipModel = shipPlacement.children[0]!;

    presentation.update(2.4, 0.2);

    expect(model.name).toBe('model:wreckageBox');
    expect(model.position.toArray()).toEqual([0.31, -0.22, 0.14]);
    expect(model.scale.toArray()).toEqual([0.27, 0.27, 0.27]);
    expect(placement.position.x).toBe(2.65);
    expect(placement.scale.toArray()).toEqual([0.82, 0.82, 0.82]);
    expect(shipModel.name).toBe('model:containerShip');
    expect(shipModel.position.toArray()).toEqual([0.31, -0.22, 0.14]);
    expect(shipModel.scale.toArray()).toEqual([0.27, 0.27, 0.27]);
    expect(shipPlacement.position.toArray()).toEqual([0, -7.2, -11.5]);
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

  it('keeps the seabed submerged and hidden outside the underwater hold', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    stage(presentation);
    const seabed = presentation.worldRoot.getObjectByName('wreckage-seabed')!;

    expect(seabed.visible).toBe(false);
    expect(new Box3().setFromObject(seabed).max.y).toBeLessThan(-0.5);

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    const options = vi.mocked(environment.dive.play).mock.calls[0]![1];
    options.postEntryHold!.onStart();
    expect(seabed.visible).toBe(true);

    presentation.clear();
    expect(seabed.visible).toBe(false);
    await dive;
    presentation.dispose();
  });

  it('uses the normal dive entry then shows only the wreck for three seconds', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    const debris = stage(presentation);
    const wreck = presentation.worldRoot.getObjectByName('wreckage-wreck')!;
    const seabed = presentation.worldRoot.getObjectByName('wreckage-seabed')!;

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    const options = vi.mocked(environment.dive.play).mock.calls[0]![1];
    expect(options).toEqual({
      onWaterImpact: expect.any(Function),
      postEntryHold: {
        durationSeconds: 3,
        cameraWorldPosition: new Vector3(4.2, -3.4, -4.3),
        cameraWorldTarget: new Vector3(0, -7.2, -11.5),
        onStart: expect.any(Function),
      },
    });
    expect(wreck.visible).toBe(false);

    options.postEntryHold!.onStart();
    presentation.update(2.4, 0.2);
    expect(debris.visible).toBe(false);
    expect(wreck.visible).toBe(true);
    expect(seabed.visible).toBe(true);
    expect(presentation.boatRoot.visible).toBe(false);
    expect(environment.underwaterView.enter).toHaveBeenCalledOnce();
    await expect(dive).resolves.toBe(true);
    expect(seabed.visible).toBe(false);

    presentation.clear();
    expect(environment.dive.clear).toHaveBeenCalledOnce();
    expect(environment.underwaterView.exit).toHaveBeenCalledOnce();
    presentation.dispose();
  });

  it('restores underwater visibility when hold setup fails', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    stage(presentation);
    const setupError = new Error('underwater visibility failed');
    vi.mocked(environment.underwaterView.enter).mockImplementationOnce(() => {
      throw setupError;
    });

    const dive = presentation.playItemUse('dive', 'scubaSet-1');
    const options = vi.mocked(environment.dive.play).mock.calls[0]![1];

    expect(() => options.postEntryHold!.onStart()).toThrow(setupError);
    expect(environment.underwaterView.exit).toHaveBeenCalledOnce();
    presentation.clear();
    await dive;
    presentation.dispose();
  });

  it.each(['settle', 'replace', 'dispose'] as const)(
    'restores underwater visibility on %s',
    async (action) => {
      const { environment } = createEnvironment();
      const presentation = new WreckagePresentation(environment);
      stage(presentation);
      const dive = presentation.playItemUse('dive', 'scubaSet-1');
      const options = vi.mocked(environment.dive.play).mock.calls[0]![1];
      options.postEntryHold!.onStart();

      if (action === 'settle') presentation.settleForVisibilityChange();
      if (action === 'replace') {
        presentation.stage({
          eventId: 'wreckage',
          targetInstanceId: null,
          variantSeed: 18,
        });
      }
      if (action === 'dispose') presentation.dispose();

      await expect(dive).resolves.toBe(false);
      expect(environment.underwaterView.exit).toHaveBeenCalledOnce();
      if (action === 'settle') {
        expect(environment.dive.settleForVisibilityChange).toHaveBeenCalledOnce();
      } else {
        expect(environment.dive.clear).toHaveBeenCalledOnce();
      }
      if (action !== 'dispose') presentation.dispose();
    },
  );

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
    const seabed = presentation.worldRoot.getObjectByName('wreckage-seabed') as Mesh;
    const seabedGeometry = seabed.geometry;
    const seabedMaterial = seabed.material;

    presentation.update(2.4, 0.2);

    expect(debris.children).toEqual(children);
    expect(children.map((child) => child.position.y)).not.toEqual(firstY);
    expect(children.every((child) => child.position.x > 0)).toBe(true);
    expect(seabed.geometry).toBe(seabedGeometry);
    expect(seabed.material).toBe(seabedMaterial);
    presentation.dispose();
  });

  it('delegates the Carlitos visit for Send Carlitos', async () => {
    const { environment } = createEnvironment();
    const presentation = new WreckagePresentation(environment);
    stage(presentation);

    await presentation.playChoice('delegate-carlitos');

    expect(environment.delegateCarlitos).toHaveBeenCalledOnce();
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

    const seabed = presentation.worldRoot.getObjectByName('wreckage-seabed') as Mesh;
    const disposeSeabedGeometry = vi.spyOn(seabed.geometry, 'dispose');
    const disposeSeabedMaterial = vi.spyOn(seabed.material as MeshStandardMaterial, 'dispose');

    presentation.dispose();
    presentation.dispose();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(ownedModelDispose.mock.calls.map(([id]) => id)).toEqual([
      'containerShip',
      'wreckageBox',
      'wreckageCrate',
      'wreckagePallet',
    ]);
    expect(disposeSeabedGeometry).toHaveBeenCalledOnce();
    expect(disposeSeabedMaterial).toHaveBeenCalledOnce();
  });
});
