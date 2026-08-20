// Importance: 9/10. Protects Midnight Tour staging, camera ownership, and result choreography.
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import { presentationWeatherForEvent } from '../src/weather/presentationWeather';

const PALM_NODE_NAMES = [
  'PalmTree_1',
  'PalmTree_2',
  'PalmTree_3',
  'PalmTree_4',
  'PalmTree_5',
] as const;

function model(width: number, height: number, depth: number): Group {
  const root = new Group();
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial(),
  );
  mesh.position.y = height / 2;
  root.add(mesh);
  return root;
}

function palmModel(): Group {
  const root = new Group();
  PALM_NODE_NAMES.forEach((name, index) => {
    const palm = model(0.45, 4 + index * 0.2, 0.45);
    palm.name = name;
    palm.position.x = index * 1.2;
    root.add(palm);
  });
  return root;
}

function createFixture(options: {
  omitChest?: boolean;
  omitPalms?: boolean;
  omitShovel?: boolean;
} = {}) {
  const originalParent = new Group();
  const camera = new PerspectiveCamera();
  camera.position.set(3, 4, 5);
  camera.rotation.set(0.2, -0.3, 0.1);
  originalParent.add(camera);
  const originalPosition = camera.position.clone();
  const originalQuaternion = camera.quaternion.clone();
  const emitCue = vi.fn();
  const dependencies = {
    camera,
    cameraRig: originalParent,
    waves: [],
    propModels: {
      createEventModel(id: string) {
        if (id === 'midnightPalmTrees' && options.omitPalms) return null;
        if (id === 'midnightIsland') {
          return { root: model(18, 7.3, 12), animations: [] };
        }
        if (id === 'midnightPalmTrees') {
          return { root: palmModel(), animations: [] };
        }
        if (id === 'chestClosed') {
          if (options.omitChest) return null;
          return { root: model(1.1, 0.7, 0.8), animations: [] };
        }
        if (id === 'midnightShovel') {
          if (options.omitShovel) return null;
          return { root: model(0.24, 1.25, 0.12), animations: [] };
        }
        return null;
      },
    },
    supplyDisplay: {},
    chestDisplay: {},
    emitCue,
  } as unknown as FocusedEventPresentationDependencies;
  const presentation = new MidnightTourPresentation(dependencies);
  return {
    camera,
    originalParent,
    originalPosition,
    originalQuaternion,
    emitCue,
    presentation,
  };
}

function expectOriginalCamera(fixture: ReturnType<typeof createFixture>): void {
  expect(fixture.camera.parent).toBe(fixture.originalParent);
  expect(fixture.camera.position.toArray()).toEqual(fixture.originalPosition.toArray());
  expect(fixture.camera.quaternion.toArray()).toEqual(fixture.originalQuaternion.toArray());
}

async function startResult(
  fixture: ReturnType<typeof createFixture>,
  resultId: 'tour-chest' | 'tour-attack',
): Promise<Record<ResultMarker, number[]>> {
  fixture.presentation.stage(8);
  const visit = fixture.presentation.playChoice({
    choiceId: 'visit',
    instanceId: null,
    condition: null,
  });
  fixture.presentation.update(1.5, 1.5);
  await visit;
  const writes = trackResultMarkerWrites(fixture.presentation.root);
  const result = fixture.presentation.react({
    eventId: 'midnight-tour',
    choiceId: 'visit',
    resultId,
  }, {} as never);
  const frames = resultId === 'tour-chest' ? 30 : 12;
  for (let frame = 1; frame <= frames; frame += 1) {
    fixture.presentation.update(1.5 + frame * 0.4, 0.4);
  }
  await result;
  return writes;
}

const RESULT_MARKERS = [
  'searchLeft',
  'searchRight',
  'resultReveals',
  'cameraKicks',
] as const;
type ResultMarker = typeof RESULT_MARKERS[number];

function trackResultMarkerWrites(root: Group): Record<ResultMarker, number[]> {
  const writes: Record<ResultMarker, number[]> = {
    searchLeft: [],
    searchRight: [],
    resultReveals: [],
    cameraKicks: [],
  };
  for (const marker of RESULT_MARKERS) {
    let value = root.userData[marker] as number;
    Object.defineProperty(root.userData, marker, {
      configurable: true,
      enumerable: true,
      get: () => value,
      set: (next: number) => {
        value = next;
        writes[marker].push(next);
      },
    });
  }
  return writes;
}

describe('MidnightTourPresentation', () => {
  it('uses calm weather', () => {
    expect(presentationWeatherForEvent('midnight-tour')).toBe('calm');
  });

  it('places five separate palms on the island ground', () => {
    const { presentation } = createFixture();
    const island = presentation.root.getObjectByName('midnight-tour-island')!;

    expect(presentation.root.getObjectByName('midnight-tour-rock-shelf-1')).toBeUndefined();
    expect(presentation.root.getObjectByName('midnight-tour-dead-tree')).toBeUndefined();
    expect(presentation.root.getObjectByName('midnight-tour-shore-ember')).toBeUndefined();
    expect(presentation.root.getObjectByName('midnight-tour-horizon-wave')).toBeUndefined();
    expect(presentation.root.getObjectByName('midnight-tour-reward-bait')).toBeUndefined();
    expect(presentation.root.getObjectByName('midnight-tour-reward-food')).toBeUndefined();
    expect(presentation.root.getObjectByName('event-model:midnightPalmTrees')).toBeUndefined();

    const islandTop = island.position.y + (island.userData.greenTopLocalY as number);
    const palmPositions = new Set<string>();
    for (let index = 0; index < PALM_NODE_NAMES.length; index += 1) {
      const palm = presentation.root.getObjectByName(`midnight-tour-palm-${index + 1}`)!;
      expect(palm).toBeDefined();
      const bounds = new Box3().setFromObject(palm);
      expect(bounds.min.y + island.position.y).toBeCloseTo(islandTop, 5);
      palmPositions.add(`${palm.position.x},${palm.position.z}`);
    }
    expect(palmPositions.size).toBe(PALM_NODE_NAMES.length);
    expect(island.userData.disableHoverOutline).not.toBe(true);
    presentation.dispose();
  });

  it('requires the Midnight Tour palm model', () => {
    expect(() => createFixture({ omitPalms: true })).toThrow(
      'Missing required Midnight Tour palm model.',
    );
  });

  it.each(['tour-chest', 'tour-attack'] as const)(
    'searches both sides and reveals %s',
    async (resultId) => {
      const fixture = createFixture();
      const writes = await startResult(fixture, resultId);

      expect(fixture.presentation.root.userData.searchLeft).toBe(1);
      expect(fixture.presentation.root.userData.searchRight).toBe(1);
      expect(fixture.presentation.root.userData.resultReveals).toBe(1);
      expect(fixture.presentation.root.userData.cameraKicks)
        .toBe(resultId === 'tour-attack' ? 1 : 0);
      expect(writes.searchLeft.filter((value) => value === 1)).toHaveLength(1);
      expect(writes.searchRight.filter((value) => value === 1)).toHaveLength(1);
      expect(writes.resultReveals.filter((value) => value === 1)).toHaveLength(1);
      expect(writes.cameraKicks.filter((value) => value === 1))
        .toHaveLength(resultId === 'tour-attack' ? 1 : 0);
      const actorName = resultId === 'tour-attack'
        ? 'midnight-tour-creature'
        : 'midnight-tour-reward-chest';
      expect(fixture.presentation.root.getObjectByName(actorName)?.visible).toBe(true);

      fixture.presentation.clear();
      expectOriginalCamera(fixture);
      fixture.presentation.dispose();
    },
  );

  it.each(['clear', 'settleForVisibilityChange', 'dispose'] as const)(
    '%s restores the camera parent and exact local pose',
    async (method) => {
      const fixture = createFixture();
      fixture.presentation.stage(9);
      const visit = fixture.presentation.playChoice({
        choiceId: 'visit',
        instanceId: null,
        condition: null,
      });
      fixture.presentation.update(0.75, 0.75);
      const island = fixture.presentation.root.getObjectByName('midnight-tour-island')!;
      expect(fixture.camera.parent).toBe(fixture.presentation.root);
      expect(fixture.camera.position.toArray()).toEqual([
        island.position.x,
        island.position.y + island.userData.greenTopLocalY + 1.45,
        island.position.z + 2.4,
      ]);

      fixture.presentation[method]();
      await visit;
      expectOriginalCamera(fixture);
      if (method !== 'dispose') fixture.presentation.dispose();
    },
  );

  it.each([
    ['tour-attack', 'midnight-tour-creature', [-0.45, 0.55, -0.4]],
  ] as const)('stages %s at its exact position before reveal', async (
    resultId,
    actorName,
    [x, y, z],
  ) => {
    const fixture = createFixture();
    fixture.presentation.stage(8);
    const visit = fixture.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    fixture.presentation.update(1.5, 1.5);
    await visit;
    const result = fixture.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId,
    }, {} as never);
    const island = fixture.presentation.root.getObjectByName('midnight-tour-island')!;
    const actor = fixture.presentation.root.getObjectByName(actorName)!;

    expect(actor.position.toArray()).toEqual([
      island.position.x + x,
      island.position.y + island.userData.greenTopLocalY + y,
      island.position.z + z,
    ]);
    expect(actor.visible).toBe(false);
    fixture.presentation.clear();
    await result;
    fixture.presentation.dispose();
  });

  it('excavates the buried chest in three exact digging cycles', async () => {
    const fixture = createFixture();
    fixture.presentation.stage(8);
    const visit = fixture.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    fixture.presentation.update(1.5, 1.5);
    await visit;
    const result = fixture.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-chest',
    }, {} as never);
    const island = fixture.presentation.root.getObjectByName('midnight-tour-island')!;
    const chest = fixture.presentation.root.getObjectByName('midnight-tour-reward-chest')!;
    const islandTop = island.position.y + island.userData.greenTopLocalY;

    expect(chest.visible).toBe(true);
    expect(new Box3().setFromObject(chest).max.y).toBeLessThan(islandTop);

    fixture.presentation.update(4.5, 3);
    const shovel = fixture.camera.getObjectByName('midnight-tour-fps-shovel')!;
    expect(shovel).toBeDefined();
    expect(shovel.position.toArray()).toEqual([0.52, -0.42, -0.85]);
    const shovelMesh = shovel.getObjectByProperty('type', 'Mesh') as Mesh;
    const disposeShovelGeometry = vi.spyOn(shovelMesh.geometry, 'dispose');
    expect(fixture.emitCue).toHaveBeenCalledExactlyOnceWith({
      eventId: 'midnight-tour',
      cue: 'dig-start',
    });

    fixture.presentation.update(6.5, 2);
    expect(fixture.presentation.root.userData.digContacts).toBe(1);
    fixture.presentation.update(8.5, 2);
    expect(fixture.presentation.root.userData.digContacts).toBe(2);
    fixture.presentation.update(10.5, 2);
    expect(fixture.presentation.root.userData.digContacts).toBe(3);
    expect(new Box3().setFromObject(chest).min.y).toBeCloseTo(islandTop, 4);
    expect(fixture.camera.getObjectByName('midnight-tour-fps-shovel')).toBeUndefined();
    expect(disposeShovelGeometry).toHaveBeenCalledOnce();

    fixture.presentation.update(13.5, 3);
    await result;
    expect(new Box3().setFromObject(chest).min.y).toBeCloseTo(islandTop, 4);
    expect(fixture.emitCue).toHaveBeenCalledTimes(1);
    fixture.presentation.dispose();
  });

  it.each([
    ['chest', { omitChest: true }, 'Missing required Midnight Tour chest model.'],
    ['shovel', { omitShovel: true }, 'Missing required Midnight Tour shovel model.'],
  ] as const)('requires the Midnight Tour %s model', async (
    _modelName,
    options,
    error,
  ) => {
    const fixture = createFixture(options);
    fixture.presentation.stage(8);
    const visit = fixture.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    fixture.presentation.update(1.5, 1.5);
    await visit;

    expect(() => fixture.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-chest',
    }, {} as never)).toThrow(error);
    fixture.presentation.dispose();
  });

  it('restores the camera before a staged visit supersedes active motion', async () => {
    const fixture = createFixture();
    fixture.presentation.stage(8);
    const first = fixture.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    fixture.presentation.update(0.5, 0.5);

    fixture.presentation.stage(9);
    await first;
    expectOriginalCamera(fixture);
    fixture.presentation.dispose();
  });
});
