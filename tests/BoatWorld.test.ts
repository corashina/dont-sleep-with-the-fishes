// Importance: 8/10 (scaled from 4/5). Protects survival world integration and cleanup.
import { describe,expect,it,vi } from 'vitest';
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  Quaternion,
  QuaternionKeyframeTrack,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import {
  type ItemId,
  type ItemInstance,
  type ItemInstanceId
} from '../src/game/ItemState';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import {
  type WaveSample,
} from '../src/ocean/WaveField';
import {
  BoatWorld,
} from '../src/survival/BoatWorld';
import {
  FishingPresentation
} from '../src/survival/FishingPresentation';
import {
  BoatSupplyDisplay,
  type BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { DANGEROUS_WATERS_ITEM_DURATION } from '../src/survival/DangerousWatersPresentation';
import {
  type FocusedEventPresentation,
} from '../src/survival/FocusedEventPresentation';
import { MONSTER_IMPACT_SECONDS,MONSTER_RESULT_DURATION_SECONDS } from '../src/survival/midnightTourChoreography';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';
import { EventPresentationRegistry } from '../src/survival/EventPresentationRegistry';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import { CARLITOS_FEED_DURATION } from '../src/survival/CarlitosPresentation';
import { createCarlitosState } from '../src/survival/CarlitosState';
import {
  eventItemOutcomeDuration,
  eventItemUseDuration,type EventItemUseContext
} from '../src/survival/eventItemUseChoreography';
import { DEATH_STARE_ITEM_DURATION } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { TORNADO_ITEM_DURATION } from '../src/survival/events/tornadoChoreography';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import {
  supernaturalItemUseDuration,
} from '../src/survival/supernaturalEventChoreography';
import type {
  EventModelInstance,
} from '../src/survival/EventModelLibrary';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';
import { SurvivalInventoryState } from '../src/survival/inventory';
import {
  type SurvivalEventId
} from '../src/survival/eventCatalog';
import { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import {
  createTestPropModels,
} from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';
import { createTestShipFurniture } from './helpers/shipFurniture';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});

function createTestSnatcherModel(): Group {
  const root = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 1.25, 0.44], 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  const bone = new Bone();
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  root.add(mesh);
  return root;
}

function createTestEventModels(): EventModelLibrary {
  return {
    create: vi.fn((id: string) => {
      if (['ghost', 'siren', 'sirenRock'].includes(id)) return new Group();
      const root = id === 'snatcher' ? createTestSnatcherModel() : new Group();
      if (id === 'shark') root.animations = [new AnimationClip('Shark|Swim', 1, [])];
      return {
        root,
        dispose: vi.fn(),
      } satisfies EventModelInstance;
    }),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
}

async function createTestFeaturedModels(
  ids: Parameters<typeof SurvivalEventModelLibrary.load>[0],
): Promise<SurvivalEventModelLibrary> {
  return SurvivalEventModelLibrary.load(ids, {
    load: async () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
      return root;
    },
  });
}

function expectEventEffectRootsCleared(scene: Object3D): void {
  const itemEffects = scene.getObjectByName('event-item-effects');
  expect(itemEffects, 'event-item-effects exists').toBeDefined();
  itemEffects!.children.forEach((effect) => {
    expect(effect.visible, `event-item-effects/${effect.name} hidden`).toBe(false);
  });
  for (const name of [
    'weather-event-world',
    'weather-event-boat',
    'supernatural-event-world',
  ]) {
    const root = scene.getObjectByName(name);
    root?.children.forEach((effect) => {
      expect(effect.visible, `${name}/${effect.name} hidden`).toBe(false);
    });
  }
  for (const name of ['dedicated-event-world', 'dedicated-event-boat']) {
    const root = scene.getObjectByName(name);
    root?.children.forEach((effect) => {
      const hasRenderableContent = effect.children.length > 0
        || effect instanceof Mesh
        || effect instanceof Line
        || effect instanceof Points;
      if (hasRenderableContent) {
        expect(effect.visible, `${name}/${effect.name} hidden`).toBe(false);
      }
    });
  }
  itemEffects!.traverse((object) => {
    if (object instanceof PointLight) expect(object.intensity).toBe(0);
  });
  for (const name of [
    'dedicated-event-camera-effects',
    'dedicated-event-boat-effects',
  ]) {
    const root = scene.getObjectByName(name)!;
    expect(root.position.toArray(), `${name} position`).toEqual([0, 0, 0]);
    expect(root.quaternion.angleTo(new Quaternion()), `${name} rotation`).toBeCloseTo(0);
    expect(root.scale.toArray(), `${name} scale`).toEqual([1, 1, 1]);
  }
}

function snapshot(
  savedItems: readonly ItemInstance[],
  overrides: Partial<SurvivalSnapshot> = {},
): SurvivalSnapshot {
  return {
    state: 'day',
    ending: null,
    history: [],
    day: 1,
    pressure: 0,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 80,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    rescueLead: 0,
    rescueTraceFinds: 0,
    radioSignalAvailable: false,
    radioSignalsSent: 0,
    chest: { state: 'none', acquiredDay: null },
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState(savedItems).snapshot(),
    savedItems,
    pendingEventId: null,
    pendingEventTargetId: null,
    carlitos: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

async function remainsPending(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  return !settled;
}

function eventAdapterTestDouble(eventId: SurvivalEventId): EventPresentationAdapter {
  return {
    eventId,
    roots: [],
    stage: vi.fn(),
    reveal: vi.fn(async () => undefined),
    playChoice: vi.fn(async () => undefined),
    playItemUse: vi.fn(async () => false),
    itemAimTarget: vi.fn(() => null),
    interactionTargets: vi.fn(() => []),
    interactionRoot: vi.fn(() => null),
    resultRoot: vi.fn(() => null),
    react: vi.fn(async () => undefined),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

interface FocusedPresenterTestDouble {
  readonly presenter: FocusedEventPresentation;
  readonly stage: ReturnType<typeof vi.fn>;
  readonly reveal: ReturnType<typeof vi.fn>;
  readonly playChoice: ReturnType<typeof vi.fn>;
  readonly react: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly settle: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
}

function focusedPresenterTestDouble(eventId: string): FocusedPresenterTestDouble {
  const root = new Group();
  root.name = `focused-event:${eventId}`;
  const stage = vi.fn();
  const reveal = vi.fn(() => Promise.resolve());
  const playChoice = vi.fn(() => Promise.resolve());
  const react = vi.fn(() => Promise.resolve());
  const clear = vi.fn();
  const update = vi.fn();
  const settle = vi.fn();
  const dispose = vi.fn();
  return {
    presenter: {
      root,
      stage,
      reveal,
      playChoice,
      react,
      clear,
      update,
      settleForVisibilityChange: settle,
      dispose,
    },
    stage,
    reveal,
    playChoice,
    react,
    clear,
    update,
    settle,
    dispose,
  };
}

describe('BoatWorld helpers', () => {

  it('runs and restores the Midnight Tour attack cutscene on each seeded side', async () => {
    const propModels = createTestPropModels();
    const createEventModel = propModels.createEventModel.bind(propModels);
    const track = new QuaternionKeyframeTrack(
      '.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    );
    const idle = new AnimationClip('CharacterArmature|Idle', 1, [track]);
    const attack = new AnimationClip(
      'CharacterArmature|Idle_Attack',
      1,
      [track.clone()],
    );
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => {
      const selected = createEventModel(id);
      return id === 'midnightMonster' && selected !== null
        ? { root: selected.root, animations: [idle, attack] }
        : selected;
    });
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
    );
    const cameraParent = camera.parent;
    const cameraPosition = camera.position.clone();
    const cameraQuaternion = camera.quaternion.clone();
    const runAttack = async (seed: number): Promise<void> => {
      world.stageEvent('midnight-tour', seed);
      const reaction = world.reactToEventOutcome('midnight-tour', {
        accepted: true,
        code: 'event-resolved',
        message: 'Something on the island attacks.',
        deltas: { health: -35 },
        cue: 'impact',
        eventResult: {
          eventId: 'midnight-tour',
          choiceId: 'visit',
          resultId: 'tour-attack',
        },
      }, {
        choiceId: 'visit',
        instanceId: null,
        condition: null,
      });
      world.update(MONSTER_IMPACT_SECONDS - 0.01, MONSTER_IMPACT_SECONDS - 0.01);
      expect(await remainsPending(reaction)).toBe(true);
      world.update(MONSTER_IMPACT_SECONDS, 0.01);
      expect(await remainsPending(reaction)).toBe(true);
      world.update(MONSTER_RESULT_DURATION_SECONDS, MONSTER_RESULT_DURATION_SECONDS - MONSTER_IMPACT_SECONDS);
      await reaction;
      const presentation = world.scene.getObjectByName('focused-event:midnight-tour')!;
      expect(presentation.userData.searchLeft).toBe(1);
      expect(presentation.userData.searchRight).toBe(1);
      expect(presentation.userData.resultReveals).toBe(1);
      expect(presentation.userData.cameraKicks).toBe(1);
      expect(world.scene.getObjectByName('midnight-tour-monster')).toBeDefined();
      world.clearEvent();
      expect(camera.parent).toBe(cameraParent);
      expect(camera.position.toArray()).toEqual(cameraPosition.toArray());
      expect(camera.quaternion.toArray()).toEqual(cameraQuaternion.toArray());
    };

    await runAttack(8);
    await runAttack(9);

    world.dispose();
    propModels.dispose();
  });

  it('keeps the world choice pending until its focused presenter finishes', async () => {
    const propModels = createTestPropModels();
    const active = focusedPresenterTestDouble('chest-attack');
    let finishChoice!: () => void;
    const choiceTimeline = new Promise<void>((resolve) => {
      finishChoice = resolve;
    });
    active.playChoice.mockReturnValue(choiceTimeline);
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { 'chest-attack': () => active.presenter },
    );
    const choice = {
      choiceId: 'attack',
      instanceId: null,
      condition: null,
    };

    world.stageEvent('chest-attack');
    const pending = world.playEventChoice('chest-attack', choice);

    expect(active.playChoice).toHaveBeenCalledWith(choice);
    expect(await remainsPending(pending)).toBe(true);
    finishChoice();
    await pending;

    world.dispose();
    propModels.dispose();
  });

  it('ignores a stale drifting-item retrieve command', async () => {
    const propModels = createTestPropModels();
    const adapter = eventAdapterTestDouble('drifting-supplies');
    const create = vi.spyOn(EventPresentationRegistry.prototype, 'create')
      .mockReturnValue(adapter);
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );

    try {
      world.stageEvent('drifting-supplies');

      await world.retrieveDriftingItem('drifting-chest');

      expect(adapter.react).not.toHaveBeenCalled();
    } finally {
      world.dispose();
      create.mockRestore();
      propModels.dispose();
    }
  });

  it('does not dispose drifting barrel resources borrowed from the furniture library', () => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      furniture,
    );
    world.stageEvent('drifting-supplies');
    const barrel = world.scene.getObjectByName('drifting-supplies:barrel')!;
    const resources = new Set<BufferGeometry | Material>();
    barrel.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material])
        .forEach((material) => resources.add(material));
    });
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));

    world.dispose();
    world.dispose();

    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    furniture.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    propModels.dispose();
  });

  it('prepares local matrices without traversing the scene during a focused drifting-item frame', async () => {
    const propModels = createTestPropModels();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel', 'wreckageBox', 'wreckageCrate', 'wreckagePallet',
      'emptyLifeboat',
      'emptyLifeboatContainer',
      'shippingContainer',
    ]);
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      featuredModels,
    );
    world.stageEvent('drifting-supplies', 8);
    const entered = world.enterFocusedEventView('drifting-supplies');
    world.update(1.2, 1.2);
    await entered;
    const updateMatrixWorld = vi.spyOn(world.scene, 'updateMatrixWorld');

    world.update(1.3, 0.1);

    expect(updateMatrixWorld).not.toHaveBeenCalled();
    world.dispose();
    featuredModels.dispose();
    propModels.dispose();
  });

  it('settles reveal, item-use, and reaction handles when the document becomes hidden', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const bucketRoot = world.scene.getObjectByName('boat-supply:bucket')!;

    const reveal = world.revealEvent('windy-night');
    world.update(1, 0.4);
    world.setDocumentHidden(true);
    await reveal;
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);

    const itemUse = world.playEventItemUse(
      'shower-night',
      'bucket',
      bucket.instanceId,
    );
    world.update(2, 0.25);
    world.setDocumentHidden(true);
    await itemUse;
    expect(bucketRoot.position.toArray()).toEqual([0, 0, 0]);

    const reaction = world.reactToEventOutcome(
      'shower-night',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The rain is managed.',
        deltas: { hull: -10 },
        cue: 'impact',
      },
      { choiceId: 'bucket', actors: [{ instanceId: bucket.instanceId, condition: 'usable' }] },
    );
    world.update(3, 0.2);
    world.setDocumentHidden(true);
    await reaction;
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);

    world.stageEvent('dangerous-waters');
    const baseBucketRotation = bucketRoot.rotation.clone();
    const dangerousReaction = world.reactToEventOutcome(
      'dangerous-waters',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The boat strikes the rocks.',
        deltas: { hull: -10 },
        cue: 'impact',
      },
    );
    world.update(3.5, 0.45);
    expect(bucketRoot.rotation.toArray().slice(0, 3)).not.toEqual(
      baseBucketRotation.toArray().slice(0, 3),
    );
    world.setDocumentHidden(true);
    await dangerousReaction;
    expect(bucketRoot.rotation.toArray().slice(0, 3)).toEqual(
      baseBucketRotation.toArray().slice(0, 3),
    );

    world.dispose();
    propModels.dispose();
  });

  it('cancels a generic item-use fallback when the event is cleared', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    const fallback = world.playEventItemUse(
      'strange-noise',
      'bucket',
      bucket.instanceId,
    );
    await Promise.resolve();
    world.update(1, 0.2);

    world.clearEvent();
    await Promise.resolve();
    const stillPending = await remainsPending(fallback);
    world.dispose();
    await fallback;
    expect(stillPending).toBe(false);
    propModels.dispose();
  });

  it('cancels every shared item effect family at forty percent', async () => {
    const cases: readonly [
      context: EventItemUseContext,
      eventId: string,
      choiceId: string,
      itemId: ItemId,
      routedDuration: number,
    ][] = [
      ['throw-target', 'flowers', 'energyBar', 'energyBar', eventItemUseDuration('throw-target')],
      ['tape-stretch', 'flowers', 'ductTape', 'ductTape', eventItemUseDuration('tape-stretch')],
      ['compass-search', 'flowers', 'compass', 'compass', eventItemUseDuration('compass-search')],
      ['map-read', 'flowers', 'map', 'map', eventItemUseDuration('map-read')],
      ['binocular-look', 'flowers', 'spyglass', 'spyglass', eventItemUseDuration('binocular-look')],
      ['net-scoop', 'flowers', 'fishingNet', 'fishingNet', eventItemUseDuration('net-scoop')],
      ['bucket-scoop', 'leak', 'bucket', 'bucket', LEAK_ITEM_DURATION],
      ['bucket-helmet', 'eerie-melody', 'bucket', 'bucket', supernaturalItemUseDuration('eerie-melody', 'bucket')!],
      ['flare-target', 'ghosts', 'flareGun', 'flareGun', supernaturalItemUseDuration('ghosts', 'flareGun')!],
      ['flare-sky', 'other-people', 'flareGun', 'flareGun', eventItemUseDuration('flare-sky')],
      ['anchor-drop', 'tornado', 'anchor', 'anchor', TORNADO_ITEM_DURATION],
      ['umbrella-overhead', 'shower-night', 'umbrella', 'umbrella', weatherItemUseDuration('shower-night', 'umbrella')!],
      ['umbrella-shield', 'death-stare', 'umbrella', 'umbrella', DEATH_STARE_ITEM_DURATION],
      ['flashlight-threat-beam', 'flowers', 'flashlight', 'flashlight', eventItemUseDuration('flashlight-threat-beam')],
      ['shotgun-fire', 'flowers', 'shotgun', 'shotgun', eventItemUseDuration('shotgun-fire')],
    ];
    const savedItems = [...new Set(cases.map(([, , , itemId]) => itemId))]
      .map((itemId) => savedItem(itemId));
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const camera = new PerspectiveCamera(63, 1.6, 0.1, 100);
    camera.position.set(0.32, 1.08, -0.24);
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      savedItems,
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.syncInventory(snapshot(savedItems));
    const basePosition = camera.position.clone();
    const baseFieldOfView = camera.fov;
    let time = 0;

    try {
      for (const [, eventId, choiceId, itemId, routedDuration] of cases) {
        const item = savedItems.find(({ type }) => type === itemId)!;
        world.stageEvent(eventId);
        const borrowCount = borrowActor.mock.results.length;
        const use = world.playEventItemUse(eventId, choiceId, item.instanceId);
        const resolved = vi.fn();
        void use.then(resolved);
        expect(borrowActor.mock.results.length).toBe(borrowCount + 1);
        const actor = borrowActor.mock.results.at(-1)!.value as BorrowedSupplyActor;
        const release = vi.spyOn(actor, 'release');
        const delta = routedDuration * 0.4;
        time += delta;
        world.update(time, delta);
        expect(await remainsPending(use)).toBe(true);
        expect(camera.position).toEqual(basePosition);

        world.clearEvent();
        world.clearEvent();
        await use;
        await Promise.resolve();

        expect(resolved).toHaveBeenCalledOnce();
        expect(release).toHaveBeenCalledOnce();
        expect(camera.position).toEqual(basePosition);
        expect(camera.fov).toBe(baseFieldOfView);
        expectEventEffectRootsCleared(world.scene);

        world.stageEvent(eventId);
        const secondBorrowCount = borrowActor.mock.results.length;
        const secondUse = world.playEventItemUse(eventId, choiceId, item.instanceId);
        expect(borrowActor.mock.results.length).toBe(secondBorrowCount + 1);
        const secondActor = borrowActor.mock.results.at(-1)!.value as BorrowedSupplyActor;
        const secondRelease = vi.spyOn(secondActor, 'release');
        world.clearEvent();
        await secondUse;
        expect(secondRelease).toHaveBeenCalledOnce();
      }
    } finally {
      world.dispose();
      borrowActor.mockRestore();
      propModels.dispose();
    }
  });

  it.each([
    ['pickup', 0],
    ['held', eventItemUseDuration('flashlight-threat-beam')],
    ['recovery', 0.16],
    ['stow', eventItemOutcomeDuration('flashlight', 'recover') - 0.01],
  ] as const)(
    'cancels a night item at the %s stage once and restores camera state',
    async (_stage, elapsed) => {
      const item = savedItem('flashlight');
      const propModels = createTestPropModels();
      const camera = new PerspectiveCamera(63, 16 / 9, 0.08, 220);
      camera.position.set(0.31, 1.18, -0.27);
      camera.rotation.set(-0.13, 0.22, -0.04, 'YXZ');
      const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
      const world = new BoatWorld(
        camera,
        propModels,
        ...createTestSkyTextures(),
        [item],
      );
      const basePosition = camera.position.clone();
      const baseQuaternion = camera.quaternion.clone();
      const baseFieldOfView = camera.fov;
      world.syncInventory(snapshot([item]));
      world.setPhase('night');
      world.stageEvent('flowers');

      const use = world.playEventItemUse('flowers', 'flashlight', item.instanceId);
      const actor = borrowActor.mock.results.at(-1)!.value as BorrowedSupplyActor;
      const release = vi.spyOn(actor, 'release');
      let useResolutions = 0;
      void use.then(() => { useResolutions += 1; });
      let reaction: Promise<void> | null = null;
      let reactionResolutions = 0;

      if (_stage === 'held') {
        world.update(elapsed, elapsed);
        await use;
      } else if (_stage === 'recovery' || _stage === 'stow') {
        world.update(
          eventItemUseDuration('flashlight-threat-beam'),
          eventItemUseDuration('flashlight-threat-beam'),
        );
        await use;
        const outcome = {
          accepted: true,
          code: 'event-resolved' as const,
          message: 'The event settles.',
          deltas: {},
          cue: 'none' as const,
        };
        reaction = world.reactToEventOutcome(
          'flowers',
          outcome,
          { choiceId: 'flashlight', instanceId: item.instanceId, condition: 'usable' },
          {
            outcome,
            resourceDeltas: {},
            gainedInstanceIds: [],
            brokenInstanceIds: [],
            lostInstanceIds: [],
            consumedInstanceIds: [],
            selectedInstanceId: item.instanceId,
            selectedCondition: 'usable',
            targetInstanceId: null,
          },
        );
        void reaction.then(() => { reactionResolutions += 1; });
        world.update(elapsed, elapsed);
      }

      world.clearEvent();
      await use;
      await reaction;
      await Promise.resolve();

      expect(useResolutions).toBe(1);
      expect(reactionResolutions).toBe(reaction === null ? 0 : 1);
      expect(camera.position).toEqual(basePosition);
      expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());
      expect(camera.fov).toBe(baseFieldOfView);
      expect(release).toHaveBeenCalledOnce();
      expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(false);

      world.dispose();
      world.dispose();
      expect(release).toHaveBeenCalledOnce();

      borrowActor.mockRestore();
      propModels.dispose();
    },
  );

  it('feeds Carlitos with the stored can pickup and throw, then restores lab replay', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const items = [savedItem('carlitos'), savedItem('cannedFood')];
    const world = new BoatWorld(camera, propModels, ...createTestSkyTextures(), items);
    const borrow = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const play = vi.spyOn(EventItemUseController.prototype, 'play');
    try {
      world.syncInventory(snapshot(items, { food: 1, carlitos: createCarlitosState() }));
      const hand = world.scene.getObjectByName('carlitos-care-hand')!;
      const target = world.scene.getObjectByName('carlitos-food-target')!;
      const supply = world.scene.getObjectByName('boat-supply:cannedFood')!;
      const cameraRotation = camera.quaternion.clone();
      const cameraPosition = camera.position.clone();
      for (let replay = 0; replay < 2; replay += 1) {
        const meow = vi.fn();
        const feed = world.playCarlitosAction('feedCarlitos', meow);
        const actor = borrow.mock.results.at(-1)!.value as BorrowedSupplyActor;
        expect(play.mock.lastCall?.[0]).toMatchObject({
          itemId: 'cannedFood', context: 'throw-target', aimTarget: target, landAtTarget: true,
          durationSeconds: CARLITOS_FEED_DURATION,
        });
        const stored = actor.root.getWorldPosition(new Vector3());
        expect(hand.visible).toBe(false);
        world.update(1, CARLITOS_FEED_DURATION * 0.5);
        expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-6);
        expect(camera.position.distanceTo(cameraPosition)).toBeLessThan(1e-6);
        expect(actor.root.visible).toBe(true);
        expect(actor.root.getWorldPosition(new Vector3()).distanceTo(stored)).toBeGreaterThan(0.3);
        expect(hand.visible).toBe(false);
        world.update(2, CARLITOS_FEED_DURATION * 0.49);
        expect(meow).not.toHaveBeenCalled();
        expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-6);
        expect(camera.position.distanceTo(cameraPosition)).toBeLessThan(1e-6);
        expect(actor.root.visible).toBe(true);
        expect(actor.root.getWorldPosition(new Vector3()).distanceTo(target.getWorldPosition(new Vector3())))
          .toBeLessThan(0.2);
        world.update(3, CARLITOS_FEED_DURATION * 0.02);
        expect(actor.root.visible).toBe(false);
        expect(hand.visible).toBe(false);
        await feed;
        expect(meow).toHaveBeenCalledOnce();
        expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-6);
        expect(actor.root.parent).toBeNull();
        expect(supply.visible).toBe(true);
      }
      const interruptedMeow = vi.fn();
      const interrupted = world.playCarlitosAction('feedCarlitos', interruptedMeow);
      world.setDocumentHidden(true);
      world.update(4, CARLITOS_FEED_DURATION);
      await interrupted;
      expect(interruptedMeow).not.toHaveBeenCalled();
      world.syncInventory(snapshot(items, { food: 0, carlitos: createCarlitosState() }));
      expect(supply.visible).toBe(false);
    } finally {
      borrow.mockRestore();
      play.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('carries flowers inside the net from water contact through the return', async () => {
    const item = savedItem('fishingNet');
    const propModels = createTestPropModels();
    const borrow = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const world = new BoatWorld(new PerspectiveCamera(), propModels, ...createTestSkyTextures(), [item]);
    try {
      world.syncInventory(snapshot([item]));
      world.stageEvent('flowers');
      const flower = world.scene.getObjectByName('flowers:pad:0')!;
      const use = world.playEventItemUse('flowers', 'fishingNet', item.instanceId);
      const net = borrow.mock.results.at(-1)!.value.root as Group;
      const duration = eventItemUseDuration('net-scoop');
      world.update(duration * 0.68, duration * 0.68);
      expect(flower.parent).not.toBe(net);
      world.update(duration * 0.74, duration * 0.06);
      const basket = net.localToWorld(new Vector3(0, 0, -0.56));
      expect(basket.distanceTo(flower.getWorldPosition(new Vector3()))).toBeLessThan(0.01);
      world.update(duration * 0.76, duration * 0.02);
      expect(flower.parent).toBe(net);
      expect(flower.position.toArray()).toEqual([0, 0, -0.56]);
      world.update(duration, duration * 0.24);
      await use;
      expect(flower.parent).toBe(net);
      const returning = world.returnEventItemUse();
      const recovery = eventItemOutcomeDuration('fishingNet', 'recover');
      world.update(duration + recovery / 2, recovery / 2);
      expect(flower.parent).toBe(net);
      world.update(duration + recovery, recovery / 2);
      await returning;
      expect(flower.parent).toBe(world.scene.getObjectByName('flowers-deck-target')!.parent);
      const landed = flower.position.clone();
      const storedNet = world.scene.getObjectByName('boat-supply:fishingNet:copy-1')!;
      const storedBasket = storedNet.localToWorld(new Vector3(0, 0, -0.56));
      expect(storedBasket.distanceTo(flower.getWorldPosition(new Vector3()))).toBeLessThan(0.01);
      const collected = world.reactToEventOutcome('flowers', {
        accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none',
        eventPresentationKey: 'flowers.collect',
      });
      world.update(duration + recovery + 1, 1);
      await collected;
      expect(flower.position).toEqual(landed);
      world.clearEvent();
      expect(flower.parent?.name).toBe('event-prop:flowers');
      expect(flower.visible).toBe(true);
    } finally {
      world.dispose();
      borrow.mockRestore();
      propModels.dispose();
    }
  });

  it.each([
    ['leak', 'bucket', 'bucket', 'dedicated-event-boat', 'bucket-scoop', LEAK_ITEM_DURATION, 0.5],
    [
      'shower-night',
      'umbrella',
      'umbrella',
      'weather-event-world',
      'umbrella-overhead',
      weatherItemUseDuration('shower-night', 'umbrella')!,
      0.5,
    ],
    [
      'ghosts',
      'flareGun',
      'flareGun',
      'supernatural-event-world',
      'flare-target',
      supernaturalItemUseDuration('ghosts', 'flareGun')!,
      0.47,
    ],
    [
      'dangerous-waters',
      'map',
      'map',
      'dangerous-waters-passage',
      'map-read',
      DANGEROUS_WATERS_ITEM_DURATION,
      0.5,
    ],
  ] as const)(
    'keeps one controller-owned selected actor through %s scene use',
    async (
      eventId,
      choiceId,
      itemId,
      sceneProbe,
      context,
      sceneDuration,
      sceneProbeProgress,
    ) => {
      const item = savedItem(itemId);
      const propModels = createTestPropModels();
      const eventModels = eventId === 'leak'
        ? createTestEventModels()
        : undefined;
      const borrow = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
      const begin = vi.spyOn(EventItemUseAdapter.prototype, 'begin');
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        ...createTestSkyTextures(),
        [item],
        undefined,
        undefined,
        'high',
        eventModels,
      );
      world.syncInventory(snapshot([item]));
      if (eventId === 'leak') {
        world.stageEvent({ eventId, targetInstanceId: null, variantSeed: 11 });
      } else {
        world.stageEvent(eventId);
      }

      const use = world.playEventItemUse(eventId, choiceId, item.instanceId);
      const sceneDelta = sceneDuration * sceneProbeProgress;
      world.update(sceneDelta, sceneDelta);
      expect(world.scene.getObjectByName(sceneProbe)?.visible).toBe(true);
      expect(borrow).toHaveBeenCalledTimes(1);
      expect(begin).toHaveBeenCalledTimes(1);

      const useDuration = Math.max(sceneDuration, eventItemUseDuration(context));
      world.update(useDuration, useDuration - sceneDelta);
      await use;
      const actor = borrow.mock.results[0]!.value as BorrowedSupplyActor;
      const release = vi.spyOn(actor, 'release');
      expect(actor.root.parent).not.toBeNull();
      expect(release).not.toHaveBeenCalled();

      const outcome = {
        accepted: true,
        code: 'event-resolved' as const,
        message: 'The event settles.',
        deltas: {},
        cue: 'none' as const,
      };
      const presentation = {
        outcome,
        resourceDeltas: {},
        gainedInstanceIds: [],
        brokenInstanceIds: [],
        lostInstanceIds: [],
        consumedInstanceIds: [],
        selectedInstanceId: item.instanceId,
        selectedCondition: 'usable' as const,
        targetInstanceId: null,
      };
      const reaction = world.reactToEventOutcome(
        eventId,
        outcome,
        { choiceId, instanceId: item.instanceId, condition: 'usable' },
        presentation,
      );
      world.update(8, 4);
      await reaction;
      if (eventId === 'shower-night') {
        expect(release).not.toHaveBeenCalled();
        expect(actor.root.visible).toBe(true);
        world.clearEvent();
      }
      expect(release).toHaveBeenCalledOnce();

      world.dispose();
      begin.mockRestore();
      borrow.mockRestore();
      propModels.dispose();
    },
  );

  it('applies the canonical supply restore and event pose once per frame', () => {
    const propModels = createTestPropModels();
    const updateSupply = vi.spyOn(BoatSupplyDisplay.prototype, 'update');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    updateSupply.mockClear();

    world.stageEvent('windy-night');
    void world.revealEvent('windy-night');
    world.update(1, 0.25);

    expect(updateSupply).toHaveBeenCalledOnce();
    updateSupply.mockRestore();
    world.dispose();
    propModels.dispose();
  });

  it('keeps a selected lost duplicate still through its camera-only reaction', async () => {
    const maps = [savedItem('map', 1), savedItem('map', 2)] as const;
    const inventory = new SurvivalInventoryState(maps);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      maps,
    );
    world.syncInventory(snapshot(maps, { inventory: inventory.snapshot() }));
    world.setEventSelectedItem(maps[1].instanceId);
    const mapRoot = world.scene.getObjectByName('boat-supply:map')!;

    const use = world.playEventItemUse(
      'windy-night',
      'map',
      maps[1].instanceId,
    );
    const mapUseDuration = Math.max(
      weatherItemUseDuration('windy-night', 'map')!,
      eventItemUseDuration('map-read'),
    );
    world.update(mapUseDuration, mapUseDuration);
    await use;
    const mapActor = world.scene.getObjectByName(
      `boat-supply-event:${maps[1].instanceId}`,
    )!;
    inventory.lose(maps[1].instanceId);
    world.syncInventory(snapshot(maps, { inventory: inventory.snapshot() }));
    expect(mapRoot.visible).toBe(false);
    expect(mapActor.visible).toBe(true);

    const reaction = world.reactToEventOutcome(
      'windy-night',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The map is lost.',
        deltas: {},
        cue: 'none',
      },
      { choiceId: 'map', actors: [{ instanceId: maps[1].instanceId, condition: 'lost' }] },
      {
        outcome: {
          accepted: true,
          code: 'event-resolved',
          message: 'The map is lost.',
          deltas: {},
          cue: 'none',
        },
        resourceDeltas: {},
        gainedInstanceIds: [],
        brokenInstanceIds: [],
        lostInstanceIds: [maps[1].instanceId],
        consumedInstanceIds: [],
        selectedInstanceId: maps[1].instanceId,
        selectedCondition: 'lost',
        targetInstanceId: null,
      },
    );
    const lossDuration = eventItemOutcomeDuration('map', 'depart');
    const lossMidpoint = lossDuration * 0.5;
    world.update(lossMidpoint, lossMidpoint);
    world.update(lossDuration, lossDuration - lossMidpoint);
    await reaction;
    expect(mapActor.parent).toBeNull();

    world.syncInventory(snapshot(maps, { inventory: inventory.snapshot() }));
    world.dispose();
    propModels.dispose();
  });

  it('coordinates supernatural staging, item motion, and cleanup', async () => {
    const weatherSupport = vi.spyOn(WeatherEventAnimator.prototype, 'supportsItemUse');
    const supernaturalSupport = vi.spyOn(
      SupernaturalEventAnimator.prototype,
      'supportsItemUse',
    );
    const flare = savedItem('flareGun');
    const propModels = createTestPropModels();
    const create = vi.fn((id: string) => {
      const root = new Group();
      root.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
      if (id === 'siren') {
        const head = new Group();
        head.name = 'Formad_Head';
        root.add(head);
      }
      return root;
    });
    const eventModels = {
      create,
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [flare],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.syncInventory(snapshot([flare]));

    world.stageEvent('ghosts');
    const ghostVisibility = () => Array.from({ length: 5 }, (_, index) => (
      world.scene.getObjectByName(`ghost-${index + 1}`)?.visible
    ));
    expect(ghostVisibility()).toEqual([true, true, true, true, true]);
    const ghostMist = world.scene.getObjectByName('supernatural-sea-mist') as Group;
    const ghostMistLayer = world.scene.getObjectByName(
      'supernatural-sea-mist-layer-1',
    ) as Mesh<BufferGeometry, ShaderMaterial>;
    expect(ghostMist.visible).toBe(true);
    expect(ghostMist.position.x).toBeGreaterThan(0);
    expect(ghostMist.scale.x).toBeGreaterThan(4);
    const ghostMistOpacity = ghostMistLayer.material.uniforms.uOpacity!.value as number;
    expect(ghostMistOpacity).toBeGreaterThan(0.1);

    const firstGhost = world.scene.getObjectByName('ghost-1')!;
    const startPosition = firstGhost.position.clone();
    world.update(0.01, 0.01);
    const travel = firstGhost.position.clone().sub(startPosition);
    travel.y = 0;
    travel.normalize();
    const forwardX = -Math.sin(firstGhost.rotation.y);
    const forwardZ = -Math.cos(firstGhost.rotation.y);
    expect(forwardX * travel.x + forwardZ * travel.z).toBeGreaterThan(0.98);

    const reveal = world.revealEvent('ghosts');
    world.update(0, 0);
    expect(ghostVisibility()).toEqual([true, true, true, true, true]);

    world.stageEvent('eerie-melody');
    await reveal;
    const sirenMist = world.scene.getObjectByName('supernatural-sea-mist') as Group;
    const sirenMistLayer = world.scene.getObjectByName(
      'supernatural-sea-mist-layer-1',
    ) as Mesh<BufferGeometry, ShaderMaterial>;
    expect(sirenMist.scale.toArray()).toEqual([1, 1, 1]);
    expect(sirenMistLayer.material.uniforms.uOpacity!.value).toBeGreaterThan(
      ghostMistOpacity,
    );
    world.stageEvent('ghosts');

    const itemUse = world.playEventItemUse('ghosts', 'flareGun', flare.instanceId);
    expect(weatherSupport).not.toHaveBeenCalled();
    expect(supernaturalSupport).toHaveBeenCalledWith('ghosts', 'flareGun');
    const flarePeak = supernaturalItemUseDuration('ghosts', 'flareGun')! * 0.47;
    world.update(flarePeak, flarePeak);
    const flareFlash = world.scene.getObjectByName('supernatural-flare-flash')!;
    expect(flareFlash.visible).toBe(false);
    const flareDuration = supernaturalItemUseDuration('ghosts', 'flareGun')!;
    const useDuration = Math.max(
      flareDuration,
      eventItemUseDuration('flare-target'),
    );
    world.update(useDuration, useDuration - flarePeak);
    await itemUse;
    const reaction = world.reactToEventOutcome(
      'ghosts',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The flare cuts through the mist.',
        deltas: {},
        cue: 'none',
      },
      {
        choiceId: 'flareGun',
        actors: [{ instanceId: flare.instanceId, condition: 'consumed' }],
      },
    );
    world.update(2, 0.84);
    await reaction;

    world.clearEvent();
    expect(world.scene.getObjectByName('ghost-1')?.visible).toBe(false);
    world.dispose();
    propModels.dispose();
    weatherSupport.mockRestore();
    supernaturalSupport.mockRestore();
  });

  it('shows a newly gained supply without allocating a model during inventory sync', () => {
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      ...createTestSkyTextures(),
    );
    const createdAtConstruction = create.mock.calls.length;
    const gained = savedItem('energyBar');

    world.syncInventory(snapshot([], {
      inventory: {
        [gained.instanceId]: { ...gained, condition: 'usable' as const },
      },
    }));

    expect(create).toHaveBeenCalledTimes(createdAtConstruction);
    expect(world.scene.getObjectByName('boat-supply:energyBar:copy-1')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'supply:energyBar',
        backingInstanceId: 'energyBar-1',
      }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('ignores stale borrowed actor commands after another supply becomes active', () => {
    const map = savedItem('map');
    const ring = savedItem('swimRing');
    const propModels = createTestPropModels();
    const display = new BoatSupplyDisplay(propModels, new Group(), [map, ring]);
    display.sync(snapshot([map, ring]));
    const mapActor = display.borrowEventActor(map.instanceId)!;
    const ringActor = display.borrowEventActor(ring.instanceId)!;
    const ringStoredPosition = ringActor.root.position.clone();

    mapActor.release();
    expect(display.borrowEventActor('missing-1' as ItemInstanceId)).toBeNull();
    ringActor.applyPose({
      x: 0.3,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    display.update(0);

    expect(mapActor.root.position.toArray()).toEqual([0, 0, 0]);
    expect(ringActor.root.position).toEqual(
      ringStoredPosition.clone().add(new Vector3(0.3, 0, 0)),
    );

    ringActor.release();
    display.dispose();
    propModels.dispose();
  });

  it('keeps the active actor bound when a known saved sibling is absent', () => {
    const firstMap = savedItem('map', 1);
    const absentMap = savedItem('map', 2);
    const propModels = createTestPropModels();
    const display = new BoatSupplyDisplay(
      propModels,
      new Group(),
      [firstMap, absentMap],
    );
    display.sync(snapshot([firstMap]));
    const activeActor = display.borrowEventActor(firstMap.instanceId)!;
    const storedPosition = activeActor.root.position.clone();

    expect(display.recordFor('map')?.backingInstanceId).toBe(firstMap.instanceId);
    expect(display.borrowEventActor(absentMap.instanceId)).toBeNull();
    expect(display.recordFor('map')?.backingInstanceId).toBe(firstMap.instanceId);

    activeActor.applyPose({
      x: -0.25,
      y: 0.1,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    display.update(0);
    expect(activeActor.root.position).toEqual(
      storedPosition.clone().add(new Vector3(-0.25, 0.1, 0)),
    );

    activeActor.release();
    display.dispose();
    propModels.dispose();
  });

  it('disposes each top-level owner and unique scene resource once', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [savedItem('medicalKit')],
    );
    const internals = world as unknown as {
      cameraController: { dispose(): void };
      interactionProjector: { dispose(): void };
      carlitosDelegation: { dispose(): void };
      itemUseController: { dispose(): void };
      eventPresentationHost: { dispose(): void };
      itemUseAdapter: { dispose(): void };
      diveController: { dispose(): void };
      carlitos: { dispose(): void };
      supplyDisplay: { dispose(): void };
      chestDisplay: { dispose(): void };
      toolHoverOutline: { dispose(): void };
      hangingLantern: { dispose(): void };
      sleepPillow: { dispose(): void };
      fishingPresentation: {
        disposeAnimation(): void;
        disposeCatches(): void;
        disposeParticles(): void;
        detach(): void;
        disposeVisualResources(): void;
        dependencies: {
          catches: { dispose(): void };
          biteParticles: { dispose(): void };
        };
        ownedGeometries: Set<BufferGeometry>;
        ownedMaterials: Set<Material>;
      };
      ocean: { dispose(): void };
      weatherEffects: { dispose(): void };
      sky: { dispose(): void };
      repairToolboxAnimation: { cancel(): void };
      ownedGeometries: Set<BufferGeometry>;
      ownedMaterials: Set<Material>;
      ownedTextures: Set<Texture>;
    };
    const ownerDisposals = [
      vi.spyOn(internals.cameraController, 'dispose'),
      vi.spyOn(internals.interactionProjector, 'dispose'),
      vi.spyOn(internals.carlitosDelegation, 'dispose'),
      vi.spyOn(internals.itemUseController, 'dispose'),
      vi.spyOn(internals.eventPresentationHost, 'dispose'),
      vi.spyOn(internals.itemUseAdapter, 'dispose'),
      vi.spyOn(internals.diveController, 'dispose'),
      vi.spyOn(internals.carlitos, 'dispose'),
      vi.spyOn(internals.supplyDisplay, 'dispose'),
      vi.spyOn(internals.chestDisplay, 'dispose'),
      vi.spyOn(internals.toolHoverOutline, 'dispose'),
      vi.spyOn(internals.hangingLantern, 'dispose'),
      vi.spyOn(internals.sleepPillow, 'dispose'),
      vi.spyOn(internals.fishingPresentation.dependencies.catches, 'dispose'),
      vi.spyOn(internals.fishingPresentation.dependencies.biteParticles, 'dispose'),
      vi.spyOn(internals.ocean, 'dispose'),
      vi.spyOn(internals.weatherEffects, 'dispose'),
      vi.spyOn(internals.sky, 'dispose'),
    ];
    const fishingPhaseDisposals = [
      vi.spyOn(internals.fishingPresentation, 'disposeAnimation'),
      vi.spyOn(internals.fishingPresentation, 'disposeCatches'),
      vi.spyOn(internals.fishingPresentation, 'disposeParticles'),
      vi.spyOn(internals.fishingPresentation, 'detach'),
      vi.spyOn(internals.fishingPresentation, 'disposeVisualResources'),
    ];
    const repairCancel = vi.spyOn(internals.repairToolboxAnimation, 'cancel');
    const resources = [
      ...internals.ownedGeometries,
      ...internals.ownedMaterials,
      ...internals.ownedTextures,
      ...internals.fishingPresentation.ownedGeometries,
      ...internals.fishingPresentation.ownedMaterials,
    ];
    const resourceDisposals = resources.map((resource) => vi.spyOn(resource, 'dispose'));

    world.dispose();
    world.dispose();
    internals.fishingPresentation.disposeAnimation();
    internals.fishingPresentation.disposeCatches();
    internals.fishingPresentation.disposeParticles();
    internals.fishingPresentation.detach();
    internals.fishingPresentation.disposeVisualResources();

    expect(resources).toHaveLength(new Set(resources).size);
    ownerDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    fishingPhaseDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(2));
    resourceDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(repairCancel).toHaveBeenCalledOnce();
    propModels.dispose();
  });

  it('keeps projected item and tool anchors steady while riding waves', () => {
    const savedItems = [savedItem('bucket')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems));
    world.update(0.5, 1 / 60);
    const settled = new Map(
      world.projectInteractionAnchors(800, 600).map((anchor) => [anchor.id, anchor]),
    );

    world.update(8, 0.5);
    const ridingWave = new Map(
      world.projectInteractionAnchors(800, 600).map((anchor) => [anchor.id, anchor]),
    );

    for (const id of [
      'supply:bucket',
      'fishing-tools',
      'repair-tools',
      'end-day-pillow',
    ]) {
      expect(ridingWave.get(id)?.x, id).toBeCloseTo(settled.get(id)!.x);
      expect(ridingWave.get(id)?.y, id).toBeCloseTo(settled.get(id)!.y);
      expect(ridingWave.get(id)?.hitArea?.width, id)
        .toBeCloseTo(settled.get(id)!.hitArea!.width);
      expect(ridingWave.get(id)?.hitArea?.height, id)
        .toBeCloseTo(settled.get(id)!.hitArea!.height);
    }

    world.dispose();
    propModels.dispose();
  });

  it('reuses one water exclusion region and list across frames', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const ocean = (world as unknown as { ocean: OceanRenderer }).ocean;
    const exclusions: Parameters<OceanRenderer['setExclusions']>[0][] = [];
    const setExclusions = ocean.setExclusions.bind(ocean);
    vi.spyOn(ocean, 'setExclusions').mockImplementation((regions) => {
      exclusions.push(regions);
      setExclusions(regions);
    });

    world.update(1, 1 / 60);
    world.update(2, 1 / 60);

    expect(exclusions).toHaveLength(2);
    expect(exclusions[1]).toBe(exclusions[0]);
    expect(exclusions[1]![0]).toBe(exclusions[0]![0]);
    world.dispose();
    propModels.dispose();
  });

  it('keeps ocean water continuous beneath the drifting lifeboat', async () => {
    const propModels = createTestPropModels();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel', 'wreckageBox', 'wreckageCrate', 'wreckagePallet',
      'emptyLifeboat',
      'emptyLifeboatContainer',
      'shippingContainer',
    ]);
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      featuredModels,
    );
    const ocean = (world as unknown as { ocean: OceanRenderer }).ocean;
    const exclusions: Parameters<OceanRenderer['setExclusions']>[0][] = [];
    vi.spyOn(ocean, 'setExclusions').mockImplementation((regions) => {
      exclusions.push(regions);
    });

    world.stageEvent('drifting-supplies', 2);
    world.update(1, 1 / 60);

    const lifeboat = world.scene.getObjectByName('drifting-supplies:lifeboat')!;
    const floor = lifeboat.getObjectByName('drifting-supplies:lifeboat-floor');
    expect(floor).toBeInstanceOf(Mesh);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toHaveLength(1);

    world.dispose();
    featuredModels.dispose();
    propModels.dispose();
  });

  it('keeps the frame-captured wave scale when an event update changes weather', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const internals = world as unknown as {
      fishingPresentation: FishingPresentation;
      eventPresentationHost: { update(time: number, delta: number): void };
    };
    world.setPresentationWeather('calm');
    world.showFishingWaiting(world.centeredFishingCast());
    const presentationDependencies = internals.fishingPresentation as unknown as {
      dependencies: {
        sampleWaveInto: (
          output: WaveSample,
          time: number,
          x: number,
          z: number,
          amplitudeScale: number,
        ) => void;
      };
    };
    const sampleWave = vi.spyOn(presentationDependencies.dependencies, 'sampleWaveInto');
    sampleWave.mockClear();
    const eventUpdate = internals.eventPresentationHost.update
      .bind(internals.eventPresentationHost);
    vi.spyOn(internals.eventPresentationHost, 'update').mockImplementation((time, delta) => {
      eventUpdate(time, delta);
      world.setPresentationWeather('waves');
    });

    world.update(2, 1 / 60);

    expect(sampleWave.mock.calls.at(-1)?.[4]).toBe(
      presentationWeatherProfile('calm').waveScale,
    );
    world.dispose();
    propModels.dispose();
  });

});
