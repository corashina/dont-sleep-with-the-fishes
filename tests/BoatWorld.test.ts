// Importance: 8/10 (scaled from 4/5). Protects survival world integration and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  AmbientLight,
  AnimationClip,
  Box3,
  BoxGeometry,
  BufferGeometry,
  FogExp2,
  Group,
  Line,
  MathUtils,
  Matrix4,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  Quaternion,
  QuaternionKeyframeTrack,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { BoatBuoyancy } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { HOVER_OUTLINE_NAME } from '../src/rendering/HoverOutline';
import {
  tryCreateVolumetricClouds,
} from '../src/world/VolumetricClouds';
import {
  type WaveSample,
} from '../src/ocean/WaveField';
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
import {
  BoatWorld,
  DAY_CLOUD_BOUNCE_INTENSITY,
} from '../src/survival/BoatWorld';
import {
  FISHING_PLAYER_SEAT,
  FishingPresentation,
} from '../src/survival/FishingPresentation';
import {
  BoatSupplyDisplay,
  GENERIC_EVENT_ITEM_USE_DURATION,
  type BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { CarlitosDelegationPresentation } from '../src/survival/CarlitosDelegationPresentation';
import { CarlitosPresentation } from '../src/survival/CarlitosPresentation';
import {
  CHEST_DISPLAY_SCALE,
  ChestDisplay,
} from '../src/survival/ChestDisplay';
import { DANGEROUS_WATERS_ITEM_DURATION } from '../src/survival/DangerousWatersPresentation';
import { DivePresentationController } from '../src/survival/DivePresentationController';
import {
  type FocusedEventInteractionTarget,
  type FocusedEventPresentation,
  type FocusedEventPresentationFactories,
} from '../src/survival/FocusedEventPresentation';
import type { EventPresentationCue } from '../src/survival/eventPresentationCue';
import { FOCUSED_EVENT_IDS } from '../src/survival/eventPresentationRoutes';
import { MONSTER_IMPACT_SECONDS } from '../src/survival/midnightTourChoreography';
import type { SupplyAdditivePose } from '../src/survival/BoatSupplyDisplay';
import { EventPresentationLayer } from '../src/survival/EventPresentationLayer';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';
import { EventPresentationRegistry } from '../src/survival/EventPresentationRegistry';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  eventItemUseDurationForItem,
  resolveEventItemUseContext,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import { SWARM_ITEM_DURATION } from '../src/survival/events/sharkSwarmChoreography';
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
import { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';
import {
  boatStorageTransform,
  boatSupplyTransform,
} from '../src/world/BoatStorage';
import { projectBoatBounds } from '../src/survival/BoatInteraction';
import { collectMeshResources } from '../src/world/SceneResources';
import { SurvivalInventoryState } from '../src/survival/inventory';
import {
  SURVIVAL_EVENTS,
  type DriftingItemEventId,
  type SurvivalEventId,
} from '../src/survival/eventCatalog';
import { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import type {
  ActionOutcome,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import type { SkyPalette } from '../src/world/skyPalette';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';
import { createTestShipFurniture } from './helpers/shipFurniture';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});



class FakeBoatSupplyDisplay {
  readonly pinCalls: ItemInstanceId[] = [];
  readonly pinHistory: ItemInstanceId[] = [];
  readonly poses = new Map<ItemInstanceId, SupplyAdditivePose>();
  ambientRoll = 0;
  ambientLift = 0;
  clearCount = 0;
  private pinnedActor: ItemInstanceId | null = null;

  constructor(private readonly rejectedActorId: ItemInstanceId | null = null) {}

  applyEventAmbientPose(roll: number, lift: number): void {
    this.ambientRoll = roll;
    this.ambientLift = lift;
  }

  applyEventItemPose(instanceId: ItemInstanceId, pose: SupplyAdditivePose): boolean {
    this.poses.set(instanceId, { ...pose });
    return true;
  }

  pinEventActor(instanceId: ItemInstanceId): boolean {
    this.pinCalls.push(instanceId);
    if (instanceId === this.rejectedActorId) return false;
    if (instanceId !== this.pinnedActor) {
      this.pinnedActor = instanceId;
      this.pinHistory.push(instanceId);
    }
    return true;
  }

  releaseEventActorOnNextSync(): void {
    this.pinnedActor = null;
  }

  releaseEventActor(): void {
    this.pinnedActor = null;
  }

  resetEventPoseForFrame(): void {
    this.ambientRoll = 0;
    this.ambientLift = 0;
    this.poses.clear();
  }

  clearEventPose(): void {
    this.resetEventPoseForFrame();
  }

  clearEventMotion(): void {
    this.resetEventPoseForFrame();
    this.pinnedActor = null;
    this.clearCount += 1;
  }

  itemType(instanceId: ItemInstanceId): ItemId | null {
    const itemId = instanceId.slice(0, instanceId.lastIndexOf('-')) as ItemId;
    return Object.hasOwn(ITEM_DEFINITIONS, itemId) ? itemId : null;
  }

  borrowEventActor(instanceId: ItemInstanceId): BorrowedSupplyActor | null {
    if (instanceId === this.rejectedActorId) return null;
    const root = new Group();
    return {
      instanceId,
      root,
      applyPose: (pose) => {
        if (
          pose.x === 0 && pose.y === 0 && pose.z === 0
          && pose.yaw === 0 && pose.pitch === 0 && pose.roll === 0
          && pose.scaleX === 1 && pose.scaleY === 1 && pose.scaleZ === 1
        ) {
          this.poses.delete(instanceId);
          return;
        }
        this.poses.set(instanceId, { ...pose });
      },
      releaseOnNextSync: () => undefined,
      release: () => this.poses.delete(instanceId),
    };
  }
}

function createTestItemUseAdapter(camera = new PerspectiveCamera()): EventItemUseAdapter {
  return new EventItemUseAdapter(camera, new EventItemEffects());
}

function createTestEventModels(): EventModelLibrary {
  return {
    create: vi.fn((id: string) => (
      ['fogMan', 'ghost', 'siren', 'sirenRock'].includes(id)
        ? new Group()
        : {
            root: new Group(),
            dispose: vi.fn(),
          } satisfies EventModelInstance
    )),
    animations: vi.fn(() => []),
    dispose: vi.fn(),
  } as unknown as EventModelLibrary;
}

async function createTestFeaturedModels(
  ids: Parameters<typeof SurvivalEventModelLibrary.load>[0],
): Promise<SurvivalEventModelLibrary> {
  return SurvivalEventModelLibrary.load(ids, {
    load: async (url) => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
      return root;
    },
  });
}

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) found = object;
  });
  if (!found) throw new Error('Expected saved prop mesh');
  return found;
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

function expectTestModelTransform(root: Object3D): void {
  const model = testPropModel(root);
  expect(model.position.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.position);
  model.rotation.toArray().slice(0, 3).forEach((value, index) => {
    expect(value).toBeCloseTo(TEST_PROP_MODEL_TRANSFORM.rotation[index]!);
  });
  expect(model.scale.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.scale);
}

function boundsRelativeTo(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const bounds = new Box3().makeEmpty();
  const localMatrix = new Matrix4();
  const point = new Vector3();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const geometryBounds = object.geometry.boundingBox;
    if (geometryBounds === null) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let corner = 0; corner < 8; corner += 1) {
      point.set(
        corner & 1 ? geometryBounds.max.x : geometryBounds.min.x,
        corner & 2 ? geometryBounds.max.y : geometryBounds.min.y,
        corner & 4 ? geometryBounds.max.z : geometryBounds.min.z,
      ).applyMatrix4(localMatrix);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
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
    repairMaterial: 0,
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

  it('keeps the skybox active when cloud construction falls back', () => {
    const propModels = createTestPropModels();
    const createClouds = vi.fn(() => null) as typeof tryCreateVolumetricClouds;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      undefined,
      undefined,
      {},
      'low',
      createClouds,
    );

    expect(world.volumetricCloudsAvailable()).toBe(false);
    expect(world.scene.getObjectByName('procedural-skybox')).toBeDefined();

    world.dispose();
    propModels.dispose();
  });

  it('uses the resolved thunderstorm profile for atmosphere and shared wave motion', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const profile = presentationWeatherProfile('thunderstorm');
    const internals = world as unknown as {
      ambient: { intensity: number };
      dayCloudBounce: { intensity: number };
      key: { intensity: number };
      sky: { palette: Readonly<SkyPalette> };
      weatherEffects: {
        state: { profile: ReturnType<typeof presentationWeatherProfile> };
      };
    };

    try {
      world.setPresentationWeather('thunderstorm');
      world.update(4, 2);

      expect(buoyancySample.mock.calls.at(-1)?.[4]).toBe(profile.waveScale);
      expect(oceanUpdate.mock.calls.at(-1)?.[1]).toBe(profile.waveScale);
      expect(internals.weatherEffects.state.profile).toBe(profile);
      expect((world.scene.fog as FogExp2).density)
        .toBeCloseTo(internals.sky.palette.fogDensity * profile.fogDensityScale);
      expect(internals.ambient.intensity)
        .toBeCloseTo(internals.sky.palette.ambientLightIntensity * profile.lightIntensityScale);
      expect(internals.key.intensity)
        .toBeCloseTo(internals.sky.palette.keyLightIntensity * profile.lightIntensityScale);
      expect(internals.dayCloudBounce.intensity)
        .toBeCloseTo(DAY_CLOUD_BOUNCE_INTENSITY * profile.lightIntensityScale);
      expect(internals.sky.palette.fogDensity).toBeCloseTo(0.027);
      expect(internals.sky.palette.ambientLightIntensity).toBeCloseTo(0.44);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps ocean and boat on the shared wave field during ambient pause updates', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');

    try {
      world.updateAmbient(7, 0.25);

      expect(buoyancySample).toHaveBeenLastCalledWith(
        expect.any(Object),
        7,
        0,
        0,
        presentationWeatherProfile('calm').waveScale,
      );
      expect(oceanUpdate.mock.calls.at(-1)?.[0]).toBe(7);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps the focused cargo vessel held for natural rescue', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    world.stageEvent('other-people');
    const reveal = world.revealEvent('other-people');
    world.setDocumentHidden(true);
    await reveal;
    const rescue = world.play('rescue');
    world.skipSequence();
    await rescue;
    expect(world.scene.getObjectByName('event-prop:other-people')).toBeUndefined();
    expect(
      world.scene.getObjectByName('focused-event:other-people')?.visible,
    ).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('does not reset an active Other People reaction during rescue progress', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );

    try {
      world.stageEvent('other-people');
      const reveal = world.revealEvent('other-people');
      world.setDocumentHidden(true);
      await reveal;
      const presentation = world.scene.getObjectByName('focused-event:other-people')!;
      const reaction = world.reactToEventOutcome('other-people', {
        accepted: true,
        code: 'event-resolved',
        message: 'The ship answers the signal.',
        deltas: {},
        cue: 'none',
        eventResult: {
          eventId: 'other-people',
          choiceId: 'flashlight',
          resultId: 'people-rescue',
        },
      }, {
        choiceId: 'flashlight',
        instanceId: null,
        condition: null,
      });
      const rescue = world.play('rescue');

      world.update(0.2, 0.2);

      expect(presentation.userData.state).toBe('answering');
      expect(await remainsPending(reaction)).toBe(true);

      world.update(4.2, 4);
      await Promise.all([reaction, rescue]);
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('reapplies the active moon presenter without advancing it during ambient pause', () => {
    const propModels = createTestPropModels();
    const adapter = eventAdapterTestDouble('face-on-the-moon');
    const create = vi.spyOn(EventPresentationRegistry.prototype, 'create')
      .mockReturnValue(adapter);
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );

    try {
      world.stageEvent('face-on-the-moon');
      world.updateAmbient(21.9, 20);
      expect(adapter.update).toHaveBeenCalledWith(21.9, 0);
    } finally {
      world.dispose();
      create.mockRestore();
      propModels.dispose();
    }
  });

  it('clears the rescue callback when adapter detachment fails after deactivation', () => {
    const propModels = createTestPropModels();
    const focused = focusedPresenterTestDouble('other-people');
    const targetRoot = new Group();
    targetRoot.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()));
    focused.presenter.root.add(targetRoot);
    const presenter = Object.assign(focused.presenter, {
      setRescueCue: vi.fn(),
      interactionTargets: () => [{
        id: 'custom:rescue',
        label: 'RESCUE',
        description: 'Custom rescue target.',
        choiceId: 'signal',
        root: targetRoot,
      }],
    });
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { 'other-people': () => presenter },
    );
    const internals = world as unknown as {
      fallbackEventPresentation: EventPresentationAdapter | null;
      activeRescueCueCallback: ((progress: number | null) => void) | null;
    };
    world.stageEvent('other-people');
    const adapter = internals.fallbackEventPresentation!;
    const adapterRoot = adapter.roots[0]!.root;
    const detachError = new Error('root detach failed');
    const removeFromParent = adapterRoot.removeFromParent.bind(adapterRoot);
    const remove = vi.spyOn(adapterRoot, 'removeFromParent').mockImplementation(() => {
      removeFromParent();
      throw detachError;
    });

    expect(internals.activeRescueCueCallback).not.toBeNull();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'custom:rescue')).toBeDefined();
    expect(() => world.detach(adapter)).toThrow(detachError);
    expect(internals.activeRescueCueCallback).toBeNull();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'custom:rescue')).toBeUndefined();
    expect(() => world.detach(adapter)).not.toThrow();
    expect(remove).toHaveBeenCalledOnce();

    remove.mockRestore();
    world.dispose();
    propModels.dispose();
  });

  it('rolls back host roots when focused target installation fails', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    const parent = new Group();
    const root = new Group();
    const adapter: EventPresentationAdapter = {
      ...eventAdapterTestDouble('handyman'),
      roots: [{ parent, root }],
    };
    const internals = world as unknown as {
      interactionProjector: {
        installFocusedInteractionTargets(
          targets: readonly FocusedEventInteractionTarget[],
        ): void;
      };
    };
    const installError = new Error('target install failed');
    const rollbackError = new Error('root rollback failed');
    const install = vi.spyOn(
      internals.interactionProjector,
      'installFocusedInteractionTargets',
    ).mockImplementationOnce(() => { throw installError; });
    const removeFromParent = root.removeFromParent.bind(root);
    let rollbackCalls = 0;
    const remove = vi.spyOn(root, 'removeFromParent').mockImplementation(() => {
      const attached = root.parent === parent;
      const result = removeFromParent();
      if (attached) {
        rollbackCalls += 1;
        throw rollbackError;
      }
      return result;
    });

    expect(() => world.attach(adapter)).toThrow(installError);
    expect(root.parent).toBeNull();
    expect(rollbackCalls).toBe(1);

    install.mockRestore();
    remove.mockRestore();
    world.attach(adapter);
    expect(root.parent).toBe(parent);
    world.detach(adapter);
    world.dispose();
    propModels.dispose();
  });

  it('keeps active focused targets when the wrong adapter detach is rejected', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      ...createTestSkyTextures(),
    );
    const root = new Group();
    const targetRoot = new Group();
    targetRoot.position.z = -4;
    targetRoot.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()));
    root.add(targetRoot);
    const active: EventPresentationAdapter = {
      ...eventAdapterTestDouble('handyman'),
      roots: [{ parent: world.scene, root }],
      interactionTargets: vi.fn(() => [{
        id: 'custom:active',
        label: 'ACTIVE',
        description: 'Active target.',
        choiceId: 'keep',
        root: targetRoot,
      }]),
    };
    const other = eventAdapterTestDouble('night-trader');

    world.attach(active);
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'custom:active')).toBeDefined();
    expect(() => world.detach(other)).toThrow(
      'Cannot detach an inactive event presentation.',
    );
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'custom:active')).toBeDefined();

    world.detach(active);
    world.dispose();
    propModels.dispose();
  });

  it('clears the rescue callback when host disposal fails', () => {
    const propModels = createTestPropModels();
    const focused = focusedPresenterTestDouble('other-people');
    const presenter = Object.assign(focused.presenter, { setRescueCue: vi.fn() });
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { 'other-people': () => presenter },
    );
    const internals = world as unknown as {
      fallbackEventPresentation: EventPresentationAdapter | null;
      activeRescueCueCallback: ((progress: number | null) => void) | null;
    };
    world.stageEvent('other-people');
    const adapterRoot = internals.fallbackEventPresentation!.roots[0]!.root;
    const detachError = new Error('root detach failed');
    const removeFromParent = adapterRoot.removeFromParent.bind(adapterRoot);
    const remove = vi.spyOn(adapterRoot, 'removeFromParent').mockImplementation(() => {
      removeFromParent();
      throw detachError;
    });

    expect(internals.activeRescueCueCallback).not.toBeNull();
    expect(() => world.dispose()).toThrow(detachError);
    expect(internals.activeRescueCueCallback).toBeNull();
    expect(remove).toHaveBeenCalled();

    remove.mockRestore();
    propModels.dispose();
  });

  it('does not construct inactive weather choreography for focused and featured routes', async () => {
    const propModels = createTestPropModels();
    const focused = focusedPresenterTestDouble('handyman');
    const weatherReveal = vi.spyOn(WeatherEventAnimator.prototype, 'reveal');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { handyman: () => focused.presenter },
    );

    try {
      world.stageEvent('handyman');
      await world.revealEvent('handyman');

      world.stageEvent('flowers');
      const featuredReveal = world.revealEvent('flowers');
      world.setDocumentHidden(true);
      await featuredReveal;
      expect(weatherReveal).not.toHaveBeenCalled();
    } finally {
      weatherReveal.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

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

  it('plays Other People Sleep as letting the boat pass', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );

    world.stageEvent('other-people');
    const choice = world.playEventChoice('other-people', {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });

    expect(
      world.scene.getObjectByName('focused-event:other-people')?.userData.state,
    ).toBe('letting-pass');
    world.update(0.32, 0.32);
    await choice;
    expect(
      world.scene.getObjectByName('focused-event:other-people')?.userData.state,
    ).toBe('choice-pass');

    world.dispose();
    propModels.dispose();
  });

  it.each([
    {
      label: 'a missing event result',
      eventResult: undefined,
      received: 'missing',
    },
    {
      label: 'a wrong event id',
      eventResult: {
        eventId: 'handyman',
        choiceId: 'map',
        resultId: 'trader-reward',
      },
      received: 'handyman/map',
    },
    {
      label: 'a wrong choice id',
      eventResult: {
        eventId: 'night-trader',
        choiceId: 'umbrella',
        resultId: 'trader-reward',
      },
      received: 'night-trader/umbrella',
    },
  ])('rejects $label before any focused or weather reaction', async ({
    eventResult,
    received,
  }) => {
    const propModels = createTestPropModels();
    const active = focusedPresenterTestDouble('night-trader');
    const weatherReact = vi.spyOn(WeatherEventAnimator.prototype, 'react');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { 'night-trader': () => active.presenter },
    );
    const choice = {
      choiceId: 'map',
      instanceId: 'map-1' as ItemInstanceId,
      condition: 'lost' as const,
    };
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: 'The trader gives you a compass.',
      deltas: {},
      cue: 'none',
      ...(eventResult === undefined ? {} : { eventResult }),
    };
    world.stageEvent('night-trader');

    await expect(
      world.reactToEventOutcome('night-trader', outcome, choice),
    ).rejects.toThrow(
      `Focused event night-trader requires result night-trader/map; received ${received}.`,
    );
    expect(active.react).not.toHaveBeenCalled();
    expect(weatherReact).not.toHaveBeenCalled();

    world.dispose();
    weatherReact.mockRestore();
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

  it('turns smoothly before the Chest Attack bite begins', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const cues: EventPresentationCue[] = [];
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
    );
    world.setEventCueHandler((cue) => cues.push(cue));
    world.syncInventory(snapshot([], {
      chest: { state: 'mimic', acquiredDay: 1 },
    }));
    world.stageEvent('chest-attack');

    const attack = world.playEventChoice('chest-attack', {
      choiceId: 'attack',
      instanceId: null,
      condition: null,
    });
    const turnSides: number[] = [];
    for (let index = 1; index <= 6; index += 1) {
      world.update(index * 0.2, 0.2);
      const direction = camera.getWorldDirection(new Vector3());
      if (Math.abs(direction.x) > 1e-4) turnSides.push(Math.sign(direction.x));
    }

    const chest = world.scene.getObjectByName('persistent-chest')!;
    expect(new Set(turnSides).size).toBe(1);
    expect(chest.userData.mouthOpen).toBe(0);
    expect(chest.userData.bite).toBe(0);
    expect(await remainsPending(attack)).toBe(true);

    world.update(1.8, 0.6);
    expect(chest.userData.mouthOpen).toBe(0);
    expect(chest.userData.bite).toBe(0);
    expect(await remainsPending(attack)).toBe(true);
    expect(cues).toEqual([]);

    world.update(1.9, 0.1);
    expect(cues).toEqual([{ eventId: 'chest-attack', cue: 'attack' }]);

    world.update(2.6, 0.7);
    await attack;
    expect(chest.userData.bite).toBe(1);
    expect(cues).toEqual([{ eventId: 'chest-attack', cue: 'attack' }]);

    world.dispose();
    propModels.dispose();
  });

  it('clears generic item motion before a focused trade reaction starts', async () => {
    const propModels = createTestPropModels();
    const active = focusedPresenterTestDouble('night-trader');
    const clearEventMotion = vi.spyOn(
      BoatSupplyDisplay.prototype,
      'clearEventMotion',
    );
    active.react.mockImplementation(() => {
      expect(clearEventMotion).toHaveBeenCalled();
      return Promise.resolve();
    });
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      { 'night-trader': () => active.presenter },
    );
    world.stageEvent('night-trader');
    clearEventMotion.mockClear();

    await world.reactToEventOutcome('night-trader', {
      accepted: true,
      code: 'event-resolved',
      message: 'The trader gives you a compass.',
      deltas: {},
      cue: 'none',
      eventResult: {
        eventId: 'night-trader',
        choiceId: 'map',
        resultId: 'trader-reward',
      },
    }, {
      choiceId: 'map',
      instanceId: 'map-1',
      condition: 'lost',
    });

    expect(clearEventMotion).toHaveBeenCalledOnce();
    expect(active.react).toHaveBeenCalledOnce();
    world.dispose();
    clearEventMotion.mockRestore();
    propModels.dispose();
  });

  it('turns the seated camera 180 degrees and returns it forward', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
    );
    const position = camera.position.clone();

    world.setRearCameraView(true);
    world.update(0.65, 0.65);
    const rearDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(camera.position.toArray()).toEqual(position.toArray());
    expect(rearDirection.x).toBeCloseTo(0);
    expect(rearDirection.y).toBeLessThan(-0.6);
    expect(rearDirection.z).toBeGreaterThan(0.7);

    world.setRearCameraView(false);
    world.update(1.3, 0.65);
    const frontDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(camera.position.toArray()).toEqual(position.toArray());
    expect(frontDirection.x).toBeCloseTo(0);
    expect(frontDirection.y).toBeCloseTo(0);
    expect(frontDirection.z).toBeCloseTo(-1);

    world.dispose();
    propModels.dispose();
  });

  it('outlines the persistent chest in the rear view', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));
    world.setRearCameraView(true, true);
    const chest = world.scene.getObjectByName('persistent-chest')!;

    world.setHighlightedItem('persistent-chest');

    expect(chest.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setHighlightedItem(null);
    expect(chest.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('outlines the sleep pillow during the day and an event', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const pillow = world.scene.getObjectByName('sleep-pillow')!;

    world.setHighlightedItem('end-day-pillow');
    expect(pillow.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setHighlightedItem(null);
    expect(pillow.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();

    world.stageEvent('handyman');
    world.setHighlightedItem('end-day-pillow');
    expect(pillow.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setHighlightedItem(null);
    expect(pillow.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('applies the Item Animation Lab free look without moving the camera', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
    );
    const position = camera.position.clone();
    const forwardQuaternion = camera.quaternion.clone();

    world.setItemAnimationLabCameraLook(Math.PI / 2, -0.2);
    world.update(1 / 60, 1 / 60);

    expect(camera.position.toArray()).toEqual(position.toArray());
    expect(camera.quaternion.equals(forwardQuaternion)).toBe(false);

    world.setItemAnimationLabCameraLook(0, 0);
    world.update(2 / 60, 1 / 60);
    expect(camera.position.toArray()).toEqual(position.toArray());
    expect(camera.quaternion.toArray()).toEqual(forwardQuaternion.toArray());

    world.dispose();
    propModels.dispose();
  });

  it('restores Handyman supply and chest trade actors on clear', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));
    const supply = world.scene.getObjectByName('boat-supply:bucket')!;
    const chest = world.scene.getObjectByName('persistent-chest')!;
    const supplyBasePosition = supply.position.toArray();
    const supplyBaseQuaternion = supply.quaternion.toArray();
    const supplyBaseScale = supply.scale.toArray();
    const chestBasePosition = chest.position.toArray();
    const chestBaseQuaternion = chest.quaternion.toArray();
    const chestBaseScale = chest.scale.toArray();

    world.stageEvent('handyman');
    const supplyTrade = world.playEventChoice('handyman', {
      choiceId: 'bucket',
      instanceId: bucket.instanceId,
      condition: 'usable',
    });
    world.update(1.2, 1.2);
    await supplyTrade;
    expect(supply.position.toArray()).not.toEqual(supplyBasePosition);

    world.clearEvent();
    expect(supply.position.toArray()).toEqual(supplyBasePosition);
    expect(supply.quaternion.toArray()).toEqual(supplyBaseQuaternion);
    expect(supply.scale.toArray()).toEqual(supplyBaseScale);

    world.stageEvent('handyman');
    const chestTrade = world.playEventChoice('handyman', {
      choiceId: 'chest',
      instanceId: null,
      condition: null,
    });
    world.update(2.4, 1.2);
    await chestTrade;
    expect(chest.position.toArray()).not.toEqual(chestBasePosition);

    world.clearEvent();
    expect(chest.position.toArray()).toEqual(chestBasePosition);
    expect(chest.quaternion.toArray()).toEqual(chestBaseQuaternion);
    expect(chest.scale.toArray()).toEqual(chestBaseScale);
    expect(chest.visible).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('keeps the generic tableau when focused construction fails', () => {
    const propModels = createTestPropModels();
    const factories: FocusedEventPresentationFactories = {
      'chest-attack': () => {
        throw new Error('Chest presenter construction failed.');
      },
    };
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      factories,
    );

    world.stageEvent('chest-attack');
    expect(world.scene.getObjectByName('event-prop:chest-attack')?.visible)
      .toBe(true);
    expect(world.scene.getObjectByName('focused-event:chest-attack'))
      .toBeUndefined();

    world.dispose();
    propModels.dispose();
  });

  it('disposes the previous focused presenter before the next event', () => {
    const propModels = createTestPropModels();
    const chest = focusedPresenterTestDouble('chest-attack');
    const tour = focusedPresenterTestDouble('midnight-tour');
    const factories: FocusedEventPresentationFactories = {
      'chest-attack': () => chest.presenter,
      'midnight-tour': () => tour.presenter,
    };
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      factories,
    );

    world.stageEvent('chest-attack');
    expect(chest.stage).toHaveBeenCalledOnce();
    expect(world.scene.getObjectByName('focused-event:chest-attack')?.visible)
      .toBe(true);

    world.stageEvent('midnight-tour');
    expect(chest.dispose).toHaveBeenCalledOnce();
    expect(tour.stage).toHaveBeenCalledOnce();
    expect(world.scene.getObjectByName('focused-event:midnight-tour')?.visible)
      .toBe(true);

    world.dispose();
    world.dispose();
    expect(chest.dispose).toHaveBeenCalledOnce();
    expect(tour.dispose).toHaveBeenCalledOnce();
    propModels.dispose();
  });

  it('keeps focused routing when optional event models are missing', () => {
    const propModels = createTestPropModels();
    const createEventModel = vi.spyOn(propModels, 'createEventModel')
      .mockReturnValue(null);
    const doubles = new Map(
      FOCUSED_EVENT_IDS.map((eventId) => [
        eventId,
        focusedPresenterTestDouble(eventId),
      ]),
    );
    const factories = Object.fromEntries(
      FOCUSED_EVENT_IDS.map((eventId) => [
        eventId,
        (dependencies) => {
          dependencies.propModels.createEventModel('chestClosed');
          return doubles.get(eventId)!.presenter;
        },
      ]),
    ) as FocusedEventPresentationFactories;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      factories,
    );

    for (const eventId of FOCUSED_EVENT_IDS) {
      world.stageEvent(eventId);
      expect(doubles.get(eventId)!.stage).toHaveBeenCalledOnce();
    }
    expect(createEventModel).toHaveBeenCalledTimes(FOCUSED_EVENT_IDS.length + 2);
    expect(createEventModel).toHaveBeenCalledWith('riggedHand');

    world.dispose();
    propModels.dispose();
  });

  it('routes active focused update, visibility settle, clear, and dispose once', () => {
    const propModels = createTestPropModels();
    const active = focusedPresenterTestDouble('handyman');
    const factories: FocusedEventPresentationFactories = {
      handyman: () => active.presenter,
    };
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      factories,
    );

    world.stageEvent('handyman');
    world.update(4, 0.25);
    expect(active.update).toHaveBeenLastCalledWith(4, 0.25);
    world.setDocumentHidden(true);
    expect(active.settle).toHaveBeenCalledOnce();
    world.clearEvent();
    expect(active.clear).toHaveBeenCalledOnce();
    world.stageEvent('handyman');
    world.dispose();
    world.dispose();
    expect(active.dispose).toHaveBeenCalledOnce();
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

  it.each([
    ['drifting-supplies', 0, 'drifting-supplies:barrel'],
    ['drifting-chest', 8, 'drifting-chest:model'],
  ] as const)('outlines %s while its event anchor is hovered', (
    eventId,
    variantSeed,
    itemName,
  ) => {
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
    world.stageEvent(eventId, variantSeed);
    const item = world.scene.getObjectByName(itemName)!;

    world.setHighlightedItem(`event:${eventId}`);

    expect(item.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setHighlightedItem(null);
    expect(item.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.dispose();
    furniture.dispose();
    propModels.dispose();
  });

  it.each([
    'drifting-supplies',
    'drifting-chest',
  ] as const)('focuses and retrieves %s to its storage target', async (eventId) => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel',
      'mysteryChest',
      'emptyLifeboat',
      'emptyLifeboatContainer',
      'shippingContainer',
    ]);
    const camera = new PerspectiveCamera(65, 4 / 3, 0.08, 220);
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      furniture,
      'low',
      featuredModels,
    );
    const basePosition = camera.position.clone();
    const baseQuaternion = camera.quaternion.clone();
    world.stageEvent(eventId, eventId === 'drifting-supplies' ? 0 : 8);

    const entered = world.enterFocusedEventView(eventId);
    world.update(1.2, 1.2);
    await entered;

    expect(camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
    const itemName = eventId === 'drifting-supplies'
      ? 'drifting-supplies:barrel'
      : 'drifting-chest:model';
    const item = world.scene.getObjectByName(itemName)!;
    const direction = camera.getWorldDirection(new Vector3());
    const directionToItem = item.getWorldPosition(new Vector3())
      .sub(camera.getWorldPosition(new Vector3()))
      .normalize();
    expect(direction.dot(directionToItem)).toBeGreaterThan(0.995);

    const retrieved = world.retrieveDriftingItem(eventId);
    world.update(3.2, 2);
    await retrieved;
    const target = world.scene.getObjectByName('persistent-chest')!;
    expect(item.getWorldPosition(new Vector3()).distanceTo(
      target.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);
    expect(item.visible).toBe(false);

    const exited = world.exitFocusedEventView();
    world.update(4.4, 1.2);
    await exited;
    expect(camera.position.toArray()).toEqual(basePosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());

    world.dispose();
    featuredModels.dispose();
    furniture.dispose();
    propModels.dispose();
  });

  it('hands a recovered drifting chest to the persistent stern storage', async () => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const featuredModels = await createTestFeaturedModels(['mysteryChest']);
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      furniture,
      'low',
      featuredModels,
    );
    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));
    world.stageEvent('drifting-chest', 8);
    const eventChest = world.scene.getObjectByName('drifting-chest:model')!;
    const storedChest = world.scene.getObjectByName('persistent-chest')!;

    const retrieved = world.retrieveDriftingItem('drifting-chest');
    expect(storedChest.visible).toBe(false);
    world.update(2, 2);
    await retrieved;

    expect(eventChest.getWorldPosition(new Vector3()).distanceTo(
      storedChest.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);
    expect(eventChest.scale.toArray()).toEqual([
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
      CHEST_DISPLAY_SCALE,
    ]);
    expect(eventChest.visible).toBe(false);
    expect(storedChest.visible).toBe(true);

    world.dispose();
    featuredModels.dispose();
    furniture.dispose();
    propModels.dispose();
  });

  it('updates the full scene matrix once during a focused drifting-item frame', async () => {
    const propModels = createTestPropModels();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel',
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

    expect(updateMatrixWorld).toHaveBeenCalledOnce();
    world.dispose();
    featuredModels.dispose();
    propModels.dispose();
  });

  it.each(['hidden', 'clear', 'dispose'] as const)(
    'settles repeated drifting item camera work on %s',
    async (interruption) => {
      const propModels = createTestPropModels();
      const camera = new PerspectiveCamera(65, 4 / 3, 0.08, 220);
      const world = new BoatWorld(camera, propModels, ...createTestSkyTextures());
      const basePosition = camera.position.clone();
      const eventId: DriftingItemEventId = 'drifting-supplies';
      world.stageEvent(eventId, 8);
      let settled = 0;
      const first = world.enterFocusedEventView(eventId).then(() => { settled += 1; });
      const second = world.enterFocusedEventView(eventId).then(() => { settled += 1; });

      if (interruption === 'hidden') world.setDocumentHidden(true);
      else if (interruption === 'clear') world.clearEvent();
      else world.dispose();
      await Promise.all([first, second]);
      expect(settled).toBe(2);
      if (interruption === 'hidden') {
        expect(camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
        const exitFirst = world.exitFocusedEventView();
        const exitSecond = world.exitFocusedEventView();
        world.setDocumentHidden(true);
        await Promise.all([exitFirst, exitSecond]);
      }
      if (interruption !== 'dispose') {
        expect(camera.position.toArray()).toEqual(basePosition.toArray());
        world.dispose();
      }
      propModels.dispose();
    },
  );

  it('keeps the Bad Sleep broken Umbrella collapsed through the result hold', async () => {
    const cameraRig = new Group();
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
    );

    const result = animator.react(
      'bad-sleep',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The umbrella breaks.',
        deltas: {},
        cue: 'none',
      },
      {
        choiceId: 'umbrella',
        actors: [{ instanceId: 'umbrella-1', condition: 'broken' }],
      },
    );
    animator.update(2, 2);
    await result;

    expect(supplies.poses.get('umbrella-1')?.scaleY).toBeLessThan(0.8);

    animator.clear();
    expect(supplies.poses.size).toBe(0);
    animator.dispose();
  });

  it('restores the camera and every supply pose on animator clear', () => {
    const cameraRig = new Group();
    cameraRig.position.set(2, 3, 4);
    cameraRig.rotation.set(0.1, 0.2, 0.3);
    const basePosition = cameraRig.position.toArray();
    const baseRotation = [
      cameraRig.rotation.x,
      cameraRig.rotation.y,
      cameraRig.rotation.z,
    ] as const;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0.88, 1.72);
    camera.rotation.set(-0.2, 0.08, 0);
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
      undefined,
      camera,
    );

    void animator.reveal('windy-night');
    animator.update(0.9, 0.9);
    expect(supplies.ambientRoll).toBe(0);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);

    animator.clear();

    expect(cameraRig.position.toArray()).toEqual(basePosition);
    cameraRig.rotation.toArray().slice(0, 3).forEach((value, index) => {
      expect(value).toBeCloseTo(baseRotation[index]!);
    });
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).toEqual(baseCameraQuaternion);
    expect(supplies.poses.size).toBe(0);
    expect(supplies.ambientRoll).toBe(0);
    expect(supplies.ambientLift).toBe(0);
    animator.dispose();
  });

  it('keeps the opening view still and looks directly at either stern actor', async () => {
    const checkBack = SURVIVAL_EVENTS.find(({ id }) => id === 'check-the-back')!;
    expect(checkBack.choices.find(({ id }) => id === 'check')?.outcomes)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          presentationKey: 'check-the-back.fish',
          effects: { resources: [{ resource: 'food', operation: 'add', value: 1 }] },
        }),
      ]));
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, propModels, ...createTestSkyTextures());
    const cues: EventPresentationCue[] = [];
    world.setEventCueHandler((cue) => cues.push(cue));
    const expectLooksAt = (actorName: string): void => {
      const actor = world.scene.getObjectByName(actorName)!;
      const expected = actor.getWorldPosition(new Vector3())
        .sub(camera.getWorldPosition(new Vector3()))
        .normalize();
      expect(camera.getWorldDirection(new Vector3()).dot(expected)).toBeGreaterThan(0.995);
    };

    world.stageEvent('check-the-back');
    expect(world.scene.getObjectByName('check-back:wake')).toBeUndefined();
    expect(world.projectEventInteractionBounds('check-the-back', 800, 600)).toBeNull();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'event:check-the-back')).toBeUndefined();
    const reveal = world.revealEvent('check-the-back');
    const openingQuaternion = camera.quaternion.clone();
    world.update(0.1, 0.1);
    expect(camera.quaternion.angleTo(openingQuaternion)).toBeLessThan(1e-8);
    world.update(0.25, 0.15);
    await reveal;
    expect(camera.quaternion.angleTo(openingQuaternion)).toBeLessThan(1e-8);
    expect(world.scene.getObjectByName('check-back:fish')?.visible).toBe(false);
    expect(world.scene.getObjectByName('check-back:anglerfish')?.visible).toBe(false);

    const fish = world.reactToEventOutcome('check-the-back', {
      accepted: true,
      code: 'event-resolved',
      message: 'A fish has landed aboard.',
      deltas: { food: 1 },
      cue: 'none',
      eventPresentationKey: 'check-the-back.fish',
    });
    world.update(3, 2.75);
    expect(world.scene.getObjectByName('check-back:fish')?.visible).toBe(true);
    world.update(4.45, 1.45);
    await fish;
    const fishModel = world.scene.getObjectByName('check-back:fish')!;
    const sternFloor = world.scene.getObjectByName('check-back-stern-floor')!;
    expect(fishModel.visible).toBe(true);
    expect(fishModel.getWorldPosition(new Vector3()).distanceTo(
      sternFloor.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);
    expectLooksAt('check-back:fish');
    expect(cues).toContainEqual({ eventId: 'check-the-back', cue: 'fish' });

    const bad = world.reactToEventOutcome('check-the-back', {
      accepted: true,
      code: 'event-resolved',
      message: 'An anglerfish waits in the stern.',
      deltas: { health: -25 },
      cue: 'impact',
      eventPresentationKey: 'check-the-back.bad',
    });
    world.update(12.2, 4.2);
    await bad;
    const anglerfish = world.scene.getObjectByName('check-back:anglerfish')!;
    expect(anglerfish.visible).toBe(true);
    expect(anglerfish.getWorldPosition(new Vector3()).distanceTo(
      sternFloor.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);
    expect(world.scene.getObjectByName('check-back:fish')?.visible).toBe(false);
    expectLooksAt('check-back:anglerfish');
    expect(cues).toContainEqual({ eventId: 'check-the-back', cue: 'anglerfish' });

    const ignore = world.reactToEventOutcome('check-the-back', {
      accepted: true,
      code: 'event-resolved',
      message: 'The wake passes behind the boat.',
      deltas: {},
      cue: 'none',
      eventPresentationKey: 'check-the-back.ignore',
    });
    world.update(6, 2);
    await ignore;
    expect(world.scene.getObjectByName('check-back:fish')?.visible).toBe(false);
    expect(world.scene.getObjectByName('check-back:anglerfish')?.visible).toBe(false);

    world.dispose();
    propModels.dispose();
  });

  it('presents Dangerous Waters through its authored scene and Map motion', async () => {
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [map],
    );
    world.syncInventory(snapshot([map]));
    const mapRoot = world.scene.getObjectByName('boat-supply:map')!;
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cueCameraRig = world.scene.getObjectByName('boat-cue-camera-rig')!;
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();

    world.stageEvent('dangerous-waters');
    const presentation = world.scene.getObjectByName('dangerous-waters-presentation')!;
    expect(presentation.visible).toBe(true);
    const rocks = presentation.getObjectByName('dangerous-waters-passage')!.children
      .filter(({ name }) => name.startsWith('dangerous-waters-rock:'));
    expect(rocks).toHaveLength(42);
    const rockXs = rocks.map(({ position }) => position.x);
    const rockZs = rocks.map(({ position }) => position.z);
    expect(Math.max(...rockXs) - Math.min(...rockXs)).toBeGreaterThan(50);
    expect(Math.min(...rockZs)).toBeLessThanOrEqual(-59);
    expect(Math.max(...rockZs)).toBeLessThanOrEqual(-6.8);
    const visibleDistantRocks = rocks.filter(({ position, name }) => (
      name >= 'dangerous-waters-rock:distant-22'
      && name <= 'dangerous-waters-rock:distant-29'
      && Math.abs(position.x / position.z) < 0.65
    ));
    expect(visibleDistantRocks).toHaveLength(8);
    const edgeRocks = rocks.filter(({ name }) => (
      name >= 'dangerous-waters-rock:distant-30'
      && name <= 'dangerous-waters-rock:distant-35'
    ));
    expect(edgeRocks).toHaveLength(6);
    expect(edgeRocks.filter(({ position }) => position.x < 0)).toHaveLength(3);
    expect(edgeRocks.filter(({ position }) => position.x > 0)).toHaveLength(3);
    expect(edgeRocks.every(({ position }) => {
      const edgeRatio = Math.abs(position.x / position.z);
      return edgeRatio > 0.9 && edgeRatio < 1.1;
    })).toBe(true);
    expect(presentation.getObjectByName('dangerous-waters-foam')).toBeUndefined();
    world.scene.updateMatrixWorld(true);
    const rockMatrices = rocks.map(({ matrixWorld }) => matrixWorld.toArray());
    const expectFixedRocks = () => {
      world.scene.updateMatrixWorld(true);
      rocks.forEach(({ matrixWorld }, index) => {
        expect(matrixWorld.toArray()).toEqual(rockMatrices[index]);
      });
    };
    const baseMotionX = motionRig.position.x;
    const reveal = world.revealEvent('dangerous-waters');
    world.update(1.2, 1.2);
    expectFixedRocks();
    expect(Math.abs(motionRig.position.x - baseMotionX)).toBeLessThan(0.1);
    expect(presentation.getObjectByName('dangerous-waters-lurker')).toBeUndefined();
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).toEqual(baseCameraQuaternion);
    expect(cueCameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    world.update(2.4, 1.2);
    await reveal;

    const itemUse = world.playEventItemUse(
      'dangerous-waters',
      'map',
      map.instanceId,
    );
    const mapActor = world.scene.getObjectByName(`boat-supply-event:${map.instanceId}`)!;
    const baseScale = mapActor.scale.clone();
    world.update(2.95, 0.55);
    expectFixedRocks();
    expect(mapRoot.visible).toBe(false);
    expect(mapActor.scale.x).toBeGreaterThan(baseScale.x);
    const itemDuration = Math.max(
      DANGEROUS_WATERS_ITEM_DURATION,
      eventItemUseDuration('map-read'),
    );
    world.update(2.4 + itemDuration, itemDuration - 0.55);
    expectFixedRocks();
    world.update(8, 5);
    await itemUse;

    world.clearEvent();
    expect(presentation.visible).toBe(false);
    world.dispose();
    propModels.dispose();
  });

  it('keeps the generic impact cue visible during an event-specific reaction', async () => {
    const anchor = savedItem('anchor');
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [anchor],
    );
    const basePosition = camera.position.toArray();
    const baseQuaternion = camera.quaternion.toArray();
    world.syncInventory(snapshot([anchor]));

    const impact = world.play('impact');
    const reaction = world.reactToEventOutcome(
      'restless-waves',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The anchor checks the drift.',
        deltas: { hull: -5 },
        cue: 'impact',
      },
      {
        choiceId: 'anchor',
        actors: [{ instanceId: anchor.instanceId, condition: 'usable' }],
      },
    );

    world.update(0.4, 0.4);
    const cueCameraRig = world.scene.getObjectByName('boat-cue-camera-rig');
    expect(cueCameraRig).toBeDefined();
    expect(cueCameraRig!.position.toArray()).toEqual([0, 0, 0]);
    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion);

    world.skipSequence();
    world.clearEvent();
    await Promise.all([impact, reaction]);
    world.dispose();
    propModels.dispose();
  });

  it('settles active weather animation handles on clear and dispose', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));

    const reveal = world.revealEvent('windy-night');
    world.update(1, 1);
    expect(await remainsPending(reveal)).toBe(true);
    world.clearEvent();
    await reveal;
    expect(world.scene.getObjectByName('boat-camera-rig')?.rotation.y).toBe(0);

    const itemUse = world.playEventItemUse(
      'shower-night',
      'bucket',
      bucket.instanceId,
    );
    world.update(1.2, 0.2);
    expect(await remainsPending(itemUse)).toBe(true);
    world.clearEvent();
    await Promise.resolve();
    await Promise.resolve();
    expect(await remainsPending(itemUse)).toBe(false);

    const response = {
      choiceId: 'bucket',
      actors: [{ instanceId: bucket.instanceId, condition: 'usable' as const }],
    };
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: 'The rain is managed.',
      deltas: {},
      cue: 'none',
    };
    const reaction = world.reactToEventOutcome(
      'shower-night',
      outcome,
      response,
    );
    world.update(2, 0.2);
    expect(await remainsPending(reaction)).toBe(true);
    world.dispose();
    await reaction;
    expect(world.scene.getObjectByName('weather-event-world')).toBeUndefined();
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

  it.each([
    ['death-stare', 'flashlight', 'flashlight'],
    ['swarm-of-sharks', 'flashlight', 'flashlight'],
    ['swarm-of-sharks', 'baitTin', 'baitTin'],
    ['tornado', 'swimRing', 'swimRing'],
  ] as const)(
    'settles the %s %s item action after elapsed time and across visibility',
    async (eventId, choiceId, itemType) => {
      const item = savedItem(itemType);
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        ...createTestSkyTextures(),
        [item],
        undefined,
        undefined,
        'high',
        createTestEventModels(),
      );
      world.syncInventory(snapshot([item]));
      world.stageEvent({ eventId, targetInstanceId: null, variantSeed: 27 });

      const elapsedUse = world.playEventItemUse(eventId, choiceId, item.instanceId);
      world.update(0.6, 0.6);
      expect(await remainsPending(elapsedUse)).toBe(true);
      const sceneDuration = eventId === 'death-stare'
        ? DEATH_STARE_ITEM_DURATION
        : eventId === 'swarm-of-sharks'
          ? SWARM_ITEM_DURATION
          : TORNADO_ITEM_DURATION;
      const context = eventId === 'tornado'
        ? 'throw-target'
        : 'flashlight-threat-beam';
      const duration = Math.max(
        sceneDuration,
        eventItemUseDurationForItem(context, itemType),
      );
      world.update(duration, duration - 0.6);
      await expect(elapsedUse).resolves.toBeUndefined();

      const hiddenUse = world.playEventItemUse(eventId, choiceId, item.instanceId);
      world.update(1.5, 0.2);
      expect(await remainsPending(hiddenUse)).toBe(true);
      world.setDocumentHidden(true);
      await expect(hiddenUse).resolves.toBeUndefined();
      world.setDocumentHidden(false);

      world.dispose();
      propModels.dispose();
    },
  );

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
      for (const [context, eventId, choiceId, itemId, routedDuration] of cases) {
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

  it('settles a shared item to a readable restored pose when hidden', async () => {
    const item = savedItem('spyglass');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    world.syncInventory(snapshot([item]));
    const root = world.scene.getObjectByName('boat-supply:spyglass')!;
    const use = world.playEventItemUse('flowers', 'spyglass', item.instanceId);
    world.update(0.68, 0.68);

    world.setDocumentHidden(true);
    await expect(use).resolves.toBeUndefined();

    expect(root.visible).toBe(true);
    expect(root.position.toArray()).toEqual([0, 0, 0]);
    root.rotation.toArray().slice(0, 3)
      .forEach((angle) => expect(angle).toBeCloseTo(0));
    expect(root.scale.toArray()).toEqual([1, 1, 1]);
    world.dispose();
    propModels.dispose();
  });

  it('animates the Radio signal only when the lab allows its day-action item', async () => {
    const radio = savedItem('radio');
    const propModels = createTestPropModels();
    const controllerPlay = vi.spyOn(EventItemUseController.prototype, 'play');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [radio],
    );
    world.syncInventory(snapshot([radio]));

    const use = world.playEventItemUse(
      'item-animation-lab',
      'radioSignal',
      radio.instanceId,
      undefined,
      true,
    );

    expect(controllerPlay.mock.calls.at(-1)?.[0]).toMatchObject({
      itemId: 'radio',
      context: 'radio-signal-receive',
    });
    const duration = eventItemUseDuration('radio-signal-receive');
    world.update(duration, duration);
    await use;

    world.dispose();
    controllerPlay.mockRestore();
    propModels.dispose();
  });

  it('routes each catalog item choice into its shared or dedicated owner once', async () => {
    const itemIds = [...new Set(SURVIVAL_EVENTS.flatMap(({ choices }) => (
      choices.flatMap(({ itemId }) => itemId === undefined ? [] : [itemId])
    )))];
    const items = itemIds.map((itemId) => savedItem(itemId));
    const itemById = new Map(items.map((item) => [item.type, item]));
    const propModels = createTestPropModels();
    const controllerPlay = vi.spyOn(EventItemUseController.prototype, 'play');
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const begin = vi.spyOn(EventItemUseAdapter.prototype, 'begin');
    const dedicatedPlay = vi.spyOn(EventPresentationCoordinator.prototype, 'playItemUse');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      items,
      undefined,
      undefined,
      'low',
      createTestEventModels(),
    );
    world.syncInventory(snapshot(items, { food: 99, bait: 99 }));

    for (const event of SURVIVAL_EVENTS) {
      for (const choice of event.choices) {
        if (choice.itemId === undefined) continue;
        if (resolveEventItemUseContext(event.id, choice.id, choice.itemId) === null) continue;
        const item = itemById.get(choice.itemId)!;
        world.stageEvent(event.id);
        const playCount = controllerPlay.mock.calls.length;
        const borrowCount = borrowActor.mock.calls.length;
        const beginCount = begin.mock.calls.length;
        const dedicatedCount = dedicatedPlay.mock.calls.length;
        const use = world.playEventItemUse(
          event.id,
          choice.id,
          item.instanceId,
        );

        if (event.id === 'wreckage' && choice.id === 'dive') {
          expect(controllerPlay).toHaveBeenCalledTimes(playCount);
          expect(borrowActor).toHaveBeenCalledTimes(borrowCount);
          expect(begin).toHaveBeenCalledTimes(beginCount);
          expect(dedicatedPlay).toHaveBeenCalledTimes(dedicatedCount + 1);
          world.update(10, 10);
          world.clearEvent();
          await use;
          continue;
        }

        expect(controllerPlay).toHaveBeenCalledTimes(playCount + 1);
        expect(borrowActor).toHaveBeenCalledTimes(borrowCount + 1);
        expect(begin).toHaveBeenCalledTimes(beginCount + 1);
        expect(controllerPlay.mock.calls.at(-1)?.[0]).toMatchObject({
          eventId: event.id,
          choiceId: choice.id,
          instanceId: item.instanceId,
          itemId: choice.itemId,
        });

        world.clearEvent();
        await use;
      }
    }

    world.dispose();
    dedicatedPlay.mockRestore();
    begin.mockRestore();
    borrowActor.mockRestore();
    controllerPlay.mockRestore();
    propModels.dispose();
  });

  it('uses the fallback bounce only when generic actor borrowing fails', async () => {
    const item = savedItem('flashlight');
    const propModels = createTestPropModels();
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor')
      .mockReturnValueOnce(null);
    const supplyItem = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    world.syncInventory(snapshot([item]));
    world.stageEvent('flowers');

    const use = world.playEventItemUse('flowers', 'flashlight', item.instanceId);
    await Promise.resolve();
    await Promise.resolve();

    expect(borrowActor).toHaveBeenCalledWith(item.instanceId);
    expect(supplyItem).toHaveBeenCalledWith(item.instanceId);
    world.update(
      GENERIC_EVENT_ITEM_USE_DURATION,
      GENERIC_EVENT_ITEM_USE_DURATION,
    );
    await use;

    world.dispose();
    supplyItem.mockRestore();
    borrowActor.mockRestore();
    propModels.dispose();
  });

  it.each([
    ['event replacement', (world: BoatWorld) => world.stageEvent('check-the-back')],
    ['visibility settle', (world: BoatWorld) => world.setDocumentHidden(true)],
    ['disposal', (world: BoatWorld) => world.dispose()],
  ] as const)(
    'clears and releases a shared event actor on %s',
    async (_reason, clear) => {
      const item = savedItem('energyBar');
      const propModels = createTestPropModels();
      const clearAdapter = vi.spyOn(EventItemUseAdapter.prototype, 'clear');
      const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        ...createTestSkyTextures(),
        [item],
      );
      world.syncInventory(snapshot([item]));
      world.stageEvent('flowers');
      const use = world.playEventItemUse('flowers', 'energyBar', item.instanceId);
      const actor = borrowActor.mock.results.at(-1)!.value as BorrowedSupplyActor;
      const release = vi.spyOn(actor, 'release');
      clearAdapter.mockClear();

      clear(world);
      await use;

      expect(clearAdapter).toHaveBeenCalled();
      expect(release).toHaveBeenCalledOnce();
      expect(clearAdapter.mock.invocationCallOrder[0]!).toBeLessThan(
        release.mock.invocationCallOrder[0]!,
      );
      world.dispose();
      clearAdapter.mockRestore();
      borrowActor.mockRestore();
      propModels.dispose();
    },
  );

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

  it('releases a completed night item only on the covered dawn transition', async () => {
    const item = savedItem('flashlight');
    const propModels = createTestPropModels();
    const releaseDayStowedItems = vi.spyOn(
      BoatSupplyDisplay.prototype,
      'releaseDayStowedItems',
    );
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    const outcome = {
      accepted: true,
      code: 'event-resolved' as const,
      message: 'The event settles.',
      deltas: {},
      cue: 'none' as const,
    };
    world.syncInventory(snapshot([item]));
    world.setPhase('night');
    world.stageEvent('flowers');
    const use = world.playEventItemUse('flowers', 'flashlight', item.instanceId);
    const useDuration = eventItemUseDuration('flashlight-threat-beam');
    world.update(useDuration, useDuration);
    await use;
    const reaction = world.reactToEventOutcome(
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
    const recoveryDuration = eventItemOutcomeDuration('flashlight', 'recover');
    world.update(useDuration + recoveryDuration, recoveryDuration);
    await reaction;

    world.clearEvent();
    expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(false);
    world.setPhase('night');
    expect(releaseDayStowedItems).not.toHaveBeenCalled();

    world.setPhase('day');
    world.syncInventory(snapshot([item]));
    expect(releaseDayStowedItems).toHaveBeenCalledOnce();
    expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(true);
    world.setPhase('day');
    expect(releaseDayStowedItems).toHaveBeenCalledOnce();

    world.dispose();
    releaseDayStowedItems.mockRestore();
    propModels.dispose();
  });

  it('changes presentation time without changing the gameplay phase', () => {
    const releaseDayStowedItems = vi.fn();
    const skyState = { weather: 'calm', phase: 'day', severity: 0 };
    const world = Object.create(BoatWorld.prototype) as BoatWorld;
    Object.assign(world, {
      disposed: false,
      phase: 'day',
      presentationPhaseOverride: null,
      skyState,
      supplyDisplay: { releaseDayStowedItems },
    });

    world.setPresentationPhaseOverride('night');

    expect(skyState.phase).toBe('night');
    expect((world as unknown as { phase: string }).phase).toBe('day');
    expect(releaseDayStowedItems).not.toHaveBeenCalled();

    world.setPresentationPhaseOverride(null);

    expect(skyState.phase).toBe('day');
  });

  it('returns an unfinished day item after clear without stowing it', async () => {
    const item = savedItem('flashlight');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    world.syncInventory(snapshot([item]));
    world.stageEvent('flowers');

    const use = world.playEventItemUse('flowers', 'flashlight', item.instanceId);
    world.clearEvent();
    await use;

    expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(true);
    world.dispose();
    propModels.dispose();
  });

  it('returns a completed day item after its outcome motion and event clear', async () => {
    const item = savedItem('flashlight');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    const outcome = {
      accepted: true,
      code: 'event-resolved' as const,
      message: 'The event settles.',
      deltas: {},
      cue: 'none' as const,
    };
    world.syncInventory(snapshot([item]));
    world.stageEvent('flowers');

    const use = world.playEventItemUse('flowers', 'flashlight', item.instanceId);
    const useDuration = eventItemUseDuration('flashlight-threat-beam');
    world.update(useDuration, useDuration);
    await use;
    const reaction = world.reactToEventOutcome(
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
    const recoveryDuration = eventItemOutcomeDuration('flashlight', 'recover');
    world.update(useDuration + recoveryDuration, recoveryDuration);
    await reaction;

    expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(false);
    world.clearEvent();
    expect(world.scene.getObjectByName('boat-supply:flashlight')?.visible).toBe(true);

    world.dispose();
    propModels.dispose();
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
      expect(release).toHaveBeenCalledOnce();

      world.dispose();
      begin.mockRestore();
      borrow.mockRestore();
      propModels.dispose();
    },
  );

  it('keeps controller motion when a weather scene declines item animation', async () => {
    const umbrella = savedItem('umbrella');
    const propModels = createTestPropModels();
    const sceneUse = vi.spyOn(WeatherEventAnimator.prototype, 'playItemUse')
      .mockResolvedValue(false);
    const begin = vi.spyOn(EventItemUseAdapter.prototype, 'begin');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [umbrella],
    );
    world.syncInventory(snapshot([umbrella]));
    world.stageEvent('shower-night');

    const use = world.playEventItemUse('shower-night', 'umbrella', umbrella.instanceId);
    const animatedUmbrella = world.scene.getObjectByName(
      `boat-supply-event:${umbrella.instanceId}`,
    )!;
    const umbrellaStorage = boatSupplyTransform('umbrella', 0);
    expect(animatedUmbrella.position.toArray())
      .toEqual(umbrellaStorage.position.toArray());
    world.update(0.7, 0.7);
    expect(begin).toHaveBeenCalledOnce();
    const active = (world as unknown as {
      itemUseController: { held: { request: { instanceId: ItemInstanceId } } | null };
    }).itemUseController.held;
    expect(active?.request.instanceId).toBe(umbrella.instanceId);
    const duration = eventItemUseDuration('umbrella-overhead');
    world.update(duration, duration - 0.7);
    await use;

    world.dispose();
    begin.mockRestore();
    sceneUse.mockRestore();
    propModels.dispose();
  });

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

  it('keeps the nearby loaded Fog Man visible until the event clears', async () => {
    const propModels = createTestPropModels();
    const fogMan = new Group();
    const geometry = new BufferGeometry();
    const importedMaterial = new MeshStandardMaterial();
    const figure = new Mesh(geometry, importedMaterial);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeImportedMaterial = vi.spyOn(importedMaterial, 'dispose');
    fogMan.add(figure);
    const create = vi.fn((id: string) => id === 'fogMan' ? fogMan : new Group());
    const eventModels = {
      create,
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent('man-in-the-fog');
    expect(figure.material).not.toBe(importedMaterial);
    expect(disposeImportedMaterial).toHaveBeenCalledOnce();
    const silhouetteMaterial = figure.material as Material;
    const disposeSilhouetteMaterial = vi.spyOn(silhouetteMaterial, 'dispose');
    expect(create).toHaveBeenCalledWith('fogMan');
    const silhouette = world.scene.getObjectByName('fog-man-silhouette')!;
    const fogCurtain = world.scene.getObjectByName('weather-fog-man-mist')!;
    const fogLayer = fogCurtain.children[0] as Mesh<BufferGeometry, Material>;
    const disposeFogGeometry = vi.spyOn(fogLayer.geometry, 'dispose');
    const disposeFogMaterial = vi.spyOn(fogLayer.material, 'dispose');
    expect(silhouette.position.z).toBe(-8);
    expect(fogCurtain.children).toHaveLength(5);
    expect(fogCurtain.visible).toBe(true);

    const reveal = world.revealEvent('man-in-the-fog');
    world.update(2.6, 2.6);
    expect(silhouette.visible).toBe(true);
    expect(fogCurtain.visible).toBe(true);
    world.update(5.2, 2.6);
    await reveal;
    expect(silhouette.visible).toBe(true);
    expect(fogCurtain.visible).toBe(true);

    world.clearEvent();
    expect(silhouette.visible).toBe(false);
    expect(fogCurtain.visible).toBe(false);

    world.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeSilhouetteMaterial).toHaveBeenCalledOnce();
    expect(disposeImportedMaterial).toHaveBeenCalledOnce();
    expect(disposeFogGeometry).toHaveBeenCalledOnce();
    expect(disposeFogMaterial).toHaveBeenCalledOnce();
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
    expect(ghostMist.scale.toArray()).toEqual([4, 5, 1.8]);
    const ghostMistOpacity = ghostMistLayer.material.uniforms.uOpacity!.value as number;

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

  function expectMoonFaceShader(sky: Mesh<BufferGeometry, ShaderMaterial>): void {
    expect(sky.material.fragmentShader).toContain('lunarFaceRelief');
    expect(sky.material.fragmentShader).toContain('eyeSocketRelief');
    expect(sky.material.fragmentShader).toContain('pupilPitRelief');
    expect(sky.material.fragmentShader).toContain('browRidgeRelief');
    expect(sky.material.fragmentShader).toContain('noseRidgeRelief');
    expect(sky.material.fragmentShader).toContain('mouthCraterRelief');
    expect(sky.material.fragmentShader).toContain('toothRidgeRelief');
    expect(sky.material.fragmentShader).toContain('reliefNormal');
    expect(sky.material.fragmentShader).toContain('reliefLighting');
    expect(sky.material.fragmentShader).toContain('moonTextureLuma');
    expect(sky.material.fragmentShader).toContain(
      '(moonUv - vec2(0.5, 0.5)) / 0.82',
    );
    expect(sky.material.fragmentShader).not.toContain('uMoonFaceMap');
    expect(sky.material.fragmentShader).not.toContain('faceSample');
    expect(sky.material.fragmentShader).not.toContain('authoredFaceMask');
    expect(sky.material.fragmentShader).not.toContain('tornMouth');
    expect(sky.material.fragmentShader).not.toContain('predatoryGrin');
    expect(sky.material.fragmentShader).not.toContain('coldPupilMask');
    expect(sky.material.fragmentShader).not.toContain('distortedSocket');
    expect(sky.material.fragmentShader).not.toContain('tornMouthCavity');
    expect(sky.material.fragmentShader).toContain('uMoonDread');
    expect(sky.material.fragmentShader).not.toContain('taperedEyeHollow');
    expect(sky.material.fragmentShader).not.toContain('thinMouthShape');
    expect(sky.material.fragmentShader).not.toContain('moonFaceShadow');
    expect(sky.material.fragmentShader).not.toContain('angryBrowShadow');
    expect(sky.material.fragmentShader).not.toContain('openMouthCavity');
    expect(sky.material.fragmentShader).not.toContain('unevenTeeth');
  }

  async function revealMoonFace(world: BoatWorld, sky: Mesh<BufferGeometry, ShaderMaterial>): Promise<number> {
    const uniforms = sky.material.uniforms;
    world.stageEvent('face-on-the-moon');
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    expect(uniforms.uMoonFaceReveal!.value).toBe(0);
    const reveal = world.revealEvent('face-on-the-moon');
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    world.update(2.4, 2.4);
    expect(uniforms.uMoonFaceReveal!.value).toBe(0);
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    expect(await remainsPending(reveal)).toBe(true);
    world.update(4.5, 2.1);
    expect(uniforms.uMoonFaceReveal!.value).toBeGreaterThan(0);
    expect(uniforms.uMoonFaceReveal!.value).toBeLessThan(1);
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    world.update(7.6, 3.1);
    expect(uniforms.uMoonFaceReveal!.value).toBe(1);
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    world.update(9.2, 1.6);
    await reveal;
    expect(uniforms.uMoonFaceReveal!.value).toBe(1);
    expect(uniforms.uMoonDread!.value).toBeGreaterThan(0.7);
    expect(uniforms.uMoonEventDim!.value).toBeGreaterThan(0.1);
    expect(uniforms.uMoonScale!.value).toBeCloseTo(2.8);
    return uniforms.uMoonDread!.value as number;
  }

  function expectMoonFaceReset(sky: Mesh<BufferGeometry, ShaderMaterial>): void {
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(sky.material.uniforms.uMoonDread?.value).toBe(0);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(1);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(sky.material.uniforms.uMoonScale?.value).toBe(1);
  }

  it('reveals the moon face after a normal-moon hold and clears every sky transient', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;

    expectMoonFaceShader(sky);
    const firstPulse = await revealMoonFace(world, sky);
    world.update(0.7, 0.7);
    expect(sky.material.uniforms.uMoonDread?.value).not.toBeCloseTo(firstPulse, 4);

    world.clearEvent();
    expectMoonFaceReset(sky);

    world.dispose();
    propModels.dispose();
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

  it('shows one living companion model and projects its scene anchor', () => {
    const carlitos = savedItem('carlitos');
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      ...createTestSkyTextures(),
      [carlitos],
    );

    expect(create.mock.calls.filter(([instance]) => (
      instance.type === 'carlitos'
    ))).toHaveLength(1);
    expect(world.scene.getObjectByName('boat-supply:carlitos:copy-1'))
      .toBeUndefined();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'carlitos')).toBeUndefined();

    world.syncInventory(snapshot([], { carlitos: null }));
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'carlitos')).toBeUndefined();

    world.syncInventory(snapshot([], {
      carlitos: {
        alive: true,
        energy: 3,
        hunger: 3,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      },
    }));

    expect(world.scene.getObjectByName('carlitos-companion')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'carlitos',
        companionId: 'carlitos',
        backingInstanceId: 'carlitos-1',
        label: 'CARLITOS',
        description: 'Check his hunger, happiness, and health.',
        itemType: null,
        toolId: null,
        action: null,
      }),
    ]));

    world.syncInventory(snapshot([], {
      carlitos: {
        alive: false,
        energy: 0,
        hunger: 0,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: 'starvation',
      },
    }));
    expect(world.scene.getObjectByName('carlitos-companion')?.visible).toBe(false);
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'carlitos')).toBeUndefined();

    world.dispose();
    propModels.dispose();
  });

  it('moves Carlitos to delegated loot and restores him after the pull', async () => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      furniture,
    );
    world.syncInventory(snapshot([], {
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    }));
    world.stageEvent('drifting-supplies');
    const reveal = world.revealEvent('drifting-supplies');
    world.update(1, 0.9);
    await reveal;
    const companion = world.scene.getObjectByName('carlitos-companion')!;
    const basePosition = companion.position.clone();

    const delegated = world.delegateDriftingItem('drifting-supplies');
    world.update(2, 0.35);
    expect(companion.position.equals(basePosition)).toBe(false);
    world.update(3, 1.35);
    await delegated;

    expect(companion.position.toArray()).toEqual(basePosition.toArray());
    world.dispose();
    furniture.dispose();
    propModels.dispose();
  });

  it.each(['clear', 'visibility', 'dispose'] as const)(
    'restores delegated Carlitos when %s interrupts the pull',
    async (interruption) => {
      const propModels = createTestPropModels();
      const furniture = createTestShipFurniture();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 4 / 3, 0.08, 220),
        propModels,
        ...createTestSkyTextures(),
        [],
        undefined,
        furniture,
      );
      world.syncInventory(snapshot([], {
        carlitos: {
          alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
          pettedToday: false, deathCause: null,
        },
      }));
      const companion = world.scene.getObjectByName('carlitos-companion')!;
      const ambientPosition = companion.position.clone();
      world.stageEvent('drifting-chest');
      const reveal = world.revealEvent('drifting-chest');
      world.update(1, 0.9);
      await reveal;
      const basePosition = companion.position.clone();
      const delegated = world.delegateDriftingItem('drifting-chest');
      world.update(2, 0.3);
      expect(companion.position.equals(basePosition)).toBe(false);

      if (interruption === 'clear') world.clearEvent();
      else if (interruption === 'visibility') world.setDocumentHidden(true);
      else world.dispose();
      await delegated;

      const restoredPosition = interruption === 'clear'
        ? ambientPosition
        : basePosition;
      expect(companion.position.toArray()).toEqual(restoredPosition.toArray());
      if (interruption !== 'dispose') world.dispose();
      furniture.dispose();
      propModels.dispose();
    },
  );

  it('skips a Guarded Sleep event with its general cue exactly once', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.syncInventory(snapshot([], {
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    }));
    const companion = world.scene.getObjectByName('carlitos-companion')!;
    const pose = companion.getObjectByName('carlitos-pose')!;
    const baseRotation = pose.rotation.clone();
    world.stageEvent({
      eventId: 'guarded-sleep',
      targetInstanceId: null,
      variantSeed: 4,
    });
    let revealCompletions = 0;
    let cueCompletions = 0;
    const reveal = world.revealEvent('guarded-sleep').then(() => {
      revealCompletions += 1;
    });
    const cue = world.play('impact').then(() => {
      cueCompletions += 1;
    });
    world.update(1, 0.25);

    world.skipSequence();
    world.skipSequence();
    await Promise.all([reveal, cue]);

    expect(revealCompletions).toBe(1);
    expect(cueCompletions).toBe(1);
    expect(pose.rotation.toArray()).toEqual(baseRotation.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('restores an animated item group without changing its canonical copy transform', async () => {
    const item = savedItem('energyBar');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      ...createTestSkyTextures(),
      [item],
    );
    world.syncInventory(snapshot([item]));
    const group = world.scene.getObjectByName('boat-supply:energyBar')!;
    const copy = world.scene.getObjectByName('boat-supply:energyBar:copy-1')!;
    const expected = boatSupplyTransform('energyBar', 0);
    const pending = world.playEventItemUse(
      'strange-noise',
      'energyBar',
      item.instanceId,
    );
    await Promise.resolve();

    const duration = eventItemUseDuration('throw-target');
    world.update(duration, duration);
    await pending;

    expect(group.position.toArray()).toEqual([0, 0, 0]);
    group.rotation.toArray().slice(0, 3).forEach((value) => {
      expect(value).toBeCloseTo(0);
    });
    expect(copy.position.toArray()).toEqual(expected.position.toArray());
    expect(copy.rotation.toArray()).toEqual(expected.rotation.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('registers only the active dedicated event on additive pose roots', () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.stageEvent('tornado');

    const coordinatorWorld = world.scene.getObjectByName('dedicated-event-world')!;
    const coordinatorBoat = world.scene.getObjectByName('dedicated-event-boat')!;
    const cameraEffects = world.scene.getObjectByName('dedicated-event-camera-effects')!;
    const boatEffects = world.scene.getObjectByName('dedicated-event-boat-effects')!;

    expect(coordinatorWorld.children.map(({ name }) => name)).toEqual([
      'tornado-world',
    ]);
    expect(coordinatorBoat.children.map(({ name }) => name)).toEqual([
      'tornado-boat',
    ]);
    const tornadoWorld = coordinatorWorld.getObjectByName('tornado-world')!;
    const tornadoBoat = coordinatorBoat.getObjectByName('tornado-boat')!;
    expect(tornadoWorld.children.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'tornado-model',
      'tornado-wind-band-1',
      'tornado-wind-band-2',
      'tornado-wind-band-3',
      'tornado-sea-spray-1',
      'tornado-sea-spray-2',
      'tornado-sea-spray-3',
      'tornado-sea-spray-4',
      'tornado-sea-spray-5',
      'tornado-sea-spray-6',
    ]));
    expect(tornadoWorld.children).toHaveLength(10);
    expect(tornadoBoat.children).toHaveLength(0);
    expect(cameraEffects.parent?.name).toBe('boat-featured-event-camera-rig');
    expect(cameraEffects.parent?.parent?.name).toBe('boat-cue-camera-rig');
    expect(cameraEffects.getObjectByName('boat-camera-rig')).toBeDefined();
    expect(boatEffects.parent?.name).toBe('boat-motion-rig');
    expect(coordinatorBoat.parent).toBe(
      boatEffects.getObjectByName('lifeboat'),
    );

    world.dispose();
    propModels.dispose();
  });

  it('cleans completed event and world siblings when coordinator construction fails', () => {
    const propModels = createTestPropModels();
    const schoolModelDispose = vi.fn();
    const constructionFailure = new Error('school model failed');
    let createCount = 0;
    const eventModels = {
      create: vi.fn(() => {
        createCount += 1;
        if (createCount === 2) throw constructionFailure;
        return {
          root: new Group(),
          dispose: schoolModelDispose,
        } satisfies EventModelInstance;
      }),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    const disposeSupplies = vi.spyOn(BoatSupplyDisplay.prototype, 'dispose');
    const disposeCompanion = vi.spyOn(CarlitosPresentation.prototype, 'dispose');

    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    expect(() => world.stageEvent('school-of-fish')).toThrow(constructionFailure);
    expect(schoolModelDispose).toHaveBeenCalledOnce();
    expect(disposeSupplies).not.toHaveBeenCalled();
    expect(disposeCompanion).not.toHaveBeenCalled();
    world.dispose();
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(eventModels.dispose).not.toHaveBeenCalled();

    disposeSupplies.mockRestore();
    disposeCompanion.mockRestore();
    propModels.dispose();
  });

  it('rolls back the companion and earlier owners when supply construction fails', () => {
    const propModels = createTestPropModels();
    const failure = new Error('supply construction failed');
    const originalCreatePracticalLight = propModels.createPracticalLight.bind(propModels);
    let practicalLightCall = 0;
    let hangingGeometryDispose: ReturnType<typeof vi.spyOn> | null = null;
    let hangingMaterialDispose: ReturnType<typeof vi.spyOn> | null = null;
    const createPracticalLight = vi.spyOn(propModels, 'createPracticalLight')
      .mockImplementation((id) => {
        const root = originalCreatePracticalLight(id);
        practicalLightCall += 1;
        if (practicalLightCall === 1) {
          const mesh = firstMesh(root);
          hangingGeometryDispose = vi.spyOn(mesh.geometry, 'dispose');
          const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
          hangingMaterialDispose = vi.spyOn(material, 'dispose');
        }
        return root;
      });
    const originalCreate = propModels.createPresentation.bind(propModels);
    const create = vi.spyOn(propModels, 'createPresentation').mockImplementation((instance) => {
      if (instance.type !== 'carlitos') throw failure;
      return originalCreate(instance);
    });
    const disposeCompanion = vi.spyOn(CarlitosPresentation.prototype, 'dispose');

    expect(() => new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    )).toThrow(failure);
    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(hangingGeometryDispose).not.toBeNull();
    expect(hangingGeometryDispose!).toHaveBeenCalledOnce();
    expect(hangingMaterialDispose!).toHaveBeenCalledOnce();

    createPracticalLight.mockRestore();
    create.mockRestore();
    disposeCompanion.mockRestore();
    propModels.dispose();
  });

  it('rolls back supplies, the companion, and earlier owners when chest construction fails', () => {
    const propModels = createTestPropModels();
    const failure = new Error('chest construction failed');
    const originalCreateEventModel = propModels.createEventModel.bind(propModels);
    const createEventModel = vi.spyOn(propModels, 'createEventModel')
      .mockImplementation((id) => {
        if (id === 'chestClosed') throw failure;
        return originalCreateEventModel(id);
      });
    const disposeSupplies = vi.spyOn(BoatSupplyDisplay.prototype, 'dispose');
    const disposeCompanion = vi.spyOn(CarlitosPresentation.prototype, 'dispose');

    expect(() => new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    )).toThrow(failure);
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(disposeCompanion).toHaveBeenCalledOnce();

    createEventModel.mockRestore();
    disposeSupplies.mockRestore();
    disposeCompanion.mockRestore();
    propModels.dispose();
  });

  it('rolls back every earlier owner when late dive construction fails after the rod', () => {
    const originalParent = new Group();
    const camera = new PerspectiveCamera();
    camera.position.set(3, 4, 5);
    camera.rotation.set(0.2, -0.3, 0.1);
    originalParent.add(camera);
    const originalPosition = camera.position.clone();
    const originalQuaternion = camera.quaternion.clone();
    const propModels = createTestPropModels();
    const failure = new Error('late dive construction failed');
    const originalCreateEquipment = propModels.createEquipment.bind(propModels);
    let rodGeometryDispose: ReturnType<typeof vi.spyOn> | null = null;
    let rodMaterialDispose: ReturnType<typeof vi.spyOn> | null = null;
    const createEquipment = vi.spyOn(propModels, 'createEquipment')
      .mockImplementation((id) => {
        const root = originalCreateEquipment(id);
        const mesh = firstMesh(root);
        rodGeometryDispose = vi.spyOn(mesh.geometry, 'dispose');
        const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        rodMaterialDispose = vi.spyOn(material, 'dispose');
        return root;
      });
    const create = vi.spyOn(propModels, 'create').mockImplementation(() => {
      throw failure;
    });
    const disposeCompanion = vi.spyOn(CarlitosPresentation.prototype, 'dispose');
    const disposeSupplies = vi.spyOn(BoatSupplyDisplay.prototype, 'dispose');
    const disposeChest = vi.spyOn(ChestDisplay.prototype, 'dispose');

    expect(() => new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
    )).toThrow(failure);

    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(disposeChest).toHaveBeenCalledOnce();
    expect(rodGeometryDispose).not.toBeNull();
    expect(rodGeometryDispose!).toHaveBeenCalledOnce();
    expect(rodMaterialDispose!).toHaveBeenCalledOnce();
    expect(camera.parent).toBe(originalParent);
    expect(camera.position.toArray()).toEqual(originalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(originalQuaternion.toArray());

    createEquipment.mockRestore();
    create.mockRestore();
    disposeCompanion.mockRestore();
    disposeSupplies.mockRestore();
    disposeChest.mockRestore();
    propModels.dispose();
  });

  it('routes dedicated events before generic and weather paths', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const dedicatedStage = vi.spyOn(EventPresentationCoordinator.prototype, 'stage');
    const dedicatedDispose = vi.spyOn(EventPresentationCoordinator.prototype, 'dispose');
    const dedicatedItem = vi.spyOn(EventPresentationCoordinator.prototype, 'playItemUse')
      .mockResolvedValue(false);
    const dedicatedReact = vi.spyOn(EventPresentationCoordinator.prototype, 'react')
      .mockResolvedValue();
    const genericStage = vi.spyOn(EventPresentationLayer.prototype, 'stage');
    const genericClear = vi.spyOn(EventPresentationLayer.prototype, 'clear');
    const genericReact = vi.spyOn(EventPresentationLayer.prototype, 'react');
    const weatherStage = vi.spyOn(WeatherEventAnimator.prototype, 'stage');
    const weatherClear = vi.spyOn(WeatherEventAnimator.prototype, 'clear');
    const weatherItem = vi.spyOn(WeatherEventAnimator.prototype, 'playItemUse');
    const weatherReact = vi.spyOn(WeatherEventAnimator.prototype, 'react');
    const supplyItem = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [savedItem('bucket')],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    (world as unknown as {
      ensureEventPresenter(eventId: 'leak'): void;
    }).ensureEventPresenter('leak');
    const context = {
      eventId: 'leak' as const,
      targetInstanceId: null,
      variantSeed: 77,
    };
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: 'The bucket breaks.',
      deltas: { hull: -7 },
      cue: 'impact',
    };
    const presentation = {
      outcome,
      resourceDeltas: { hull: -7 },
      gainedInstanceIds: [],
      brokenInstanceIds: ['bucket-1'] as ItemInstanceId[],
      lostInstanceIds: [],
      consumedInstanceIds: [],
      selectedInstanceId: 'bucket-1' as ItemInstanceId,
      selectedCondition: 'broken' as const,
      targetInstanceId: null,
    };

    world.stageEvent(context);
    await world.playEventItemUse('leak', 'bucket', 'bucket-1');
    await world.reactToEventOutcome(
      'leak',
      outcome,
      { choiceId: 'bucket', instanceId: 'bucket-1', condition: 'broken' },
      presentation,
    );

    expect(dedicatedStage).toHaveBeenCalledWith(context);
    expect(dedicatedItem).toHaveBeenCalledWith('bucket', 'bucket-1');
    expect(dedicatedReact).toHaveBeenCalledWith(presentation);
    expect(genericStage).not.toHaveBeenCalled();
    expect(genericClear).not.toHaveBeenCalled();
    expect(genericReact).not.toHaveBeenCalled();
    expect(weatherStage).not.toHaveBeenCalled();
    expect(weatherClear).not.toHaveBeenCalled();
    expect(weatherItem).not.toHaveBeenCalled();
    expect(weatherReact).not.toHaveBeenCalled();
    expect(supplyItem).toHaveBeenCalledWith('bucket-1');

    world.stageEvent('windy-night');
    expect(genericStage).toHaveBeenCalledWith('windy-night', 0);
    expect(weatherStage).toHaveBeenCalledWith('windy-night', 0);
    expect(dedicatedDispose).toHaveBeenCalledOnce();

    world.dispose();
    dedicatedStage.mockRestore();
    dedicatedDispose.mockRestore();
    dedicatedItem.mockRestore();
    dedicatedReact.mockRestore();
    genericStage.mockRestore();
    genericClear.mockRestore();
    genericReact.mockRestore();
    weatherStage.mockRestore();
    weatherClear.mockRestore();
    weatherItem.mockRestore();
    weatherReact.mockRestore();
    supplyItem.mockRestore();
    propModels.dispose();
  });

  it('clears the coordinator, supplies, pose roots, and shared vortex', () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const clearCoordinator = vi.spyOn(EventPresentationCoordinator.prototype, 'clear');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.stageEvent('tornado');
    const internals = world as unknown as {
      supplyDisplay: BoatSupplyDisplay;
      cameraEffectsRoot: Group;
      boatEffectsRoot: Group;
      vortexWave: {
        centerX: number;
        centerZ: number;
        radius: number;
        depression: number;
        tangentStrength: number;
        phase: number;
        strength: number;
      };
    };
    const clearSupplies = vi.spyOn(internals.supplyDisplay, 'clearEventMotion');
    internals.cameraEffectsRoot.rotation.z = 0.4;
    internals.boatEffectsRoot.rotation.y = 0.7;
    Object.assign(internals.vortexWave, {
      centerX: 2,
      centerZ: -3,
      radius: 8,
      depression: 2,
      tangentStrength: 1,
      phase: 5,
      strength: 1,
    });

    world.clearEvent();

    expect(clearCoordinator).toHaveBeenCalledOnce();
    expect(clearSupplies).toHaveBeenCalled();
    expect(internals.cameraEffectsRoot.rotation.toArray().slice(0, 3))
      .toEqual([0, 0, 0]);
    expect(internals.boatEffectsRoot.rotation.toArray().slice(0, 3))
      .toEqual([0, 0, 0]);
    expect(internals.vortexWave).toEqual({
      centerX: 0,
      centerZ: 0,
      radius: 0,
      depression: 0,
      tangentStrength: 0,
      phase: 0,
      strength: 0,
    });

    world.dispose();
    clearCoordinator.mockRestore();
    propModels.dispose();
  });

  it('keeps a real borrowed actor at its stored world pose at progress zero', () => {
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(propModels, parent, [map]);
    const preparedEventActors = (display as unknown as {
      preparedEventActors: ReadonlyMap<ItemInstanceId, { readonly root: Group }>;
    }).preparedEventActors;
    expect(preparedEventActors).toBeInstanceOf(Map);
    const preparedActorRoot = preparedEventActors.get(map.instanceId)?.root;
    expect(preparedActorRoot).toBeDefined();
    expect(preparedActorRoot?.parent).toBeNull();
    display.sync(snapshot([map]));
    parent.updateMatrixWorld(true);
    const storedCopy = parent.getObjectByName('boat-supply:map:copy-1')!;
    const storedWorldPosition = storedCopy.getWorldPosition(new Vector3());
    const storedWorldQuaternion = storedCopy.getWorldQuaternion(new Quaternion());
    const storedWorldScale = storedCopy.getWorldScale(new Vector3());
    const actor = display.borrowEventActor(map.instanceId);
    const sameActor = display.borrowEventActor(map.instanceId);

    expect(actor).not.toBeNull();
    expect(actor?.root).toBe(preparedActorRoot);
    expect(sameActor).toBe(actor);
    expect(actor?.instanceId).toBe(map.instanceId);
    expect(actor?.root.name).toBe(`boat-supply-event:${map.instanceId}`);
    expect(actor?.root.parent).toBe(parent);
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(false);
    const heldCopy = actor!.root.children.find((child) => child.visible)!;
    expect(heldCopy.position.toArray()).toEqual([0, 0, 0]);
    expect(heldCopy.quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
    expect(heldCopy.scale.toArray()).toEqual([1, 1, 1]);

    const adapter = new EventItemUseAdapter(
      new PerspectiveCamera(),
      new EventItemEffects(),
    );
    const progressZero = createEventItemUseSample();
    adapter.begin(actor!, 'map', null);
    sampleEventItemUse('map-read', 0, progressZero);
    adapter.apply(progressZero);
    parent.updateMatrixWorld(true);
    expect(actor!.root.getWorldPosition(new Vector3()).distanceTo(storedWorldPosition))
      .toBeLessThan(1e-6);
    expect(actor!.root.getWorldQuaternion(new Quaternion()).angleTo(storedWorldQuaternion))
      .toBeLessThan(1e-6);
    expect(actor!.root.getWorldScale(new Vector3()).distanceTo(storedWorldScale))
      .toBeLessThan(1e-6);
    adapter.dispose();
    const storedLocalPosition = actor!.root.position.clone();

    const mesh = firstMesh(actor!.root);
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialDisposals = materials.map((material) => vi.spyOn(material, 'dispose'));
    actor!.applyPose({
      x: 0.4,
      y: 0.2,
      z: -0.3,
      yaw: 0.1,
      pitch: 0.2,
      roll: -0.15,
      scaleX: 1.1,
      scaleY: 0.9,
      scaleZ: 1.2,
    });
    expect(actor!.root.position).toEqual(
      storedLocalPosition.clone().add(new Vector3(0.4, 0.2, -0.3)),
    );
    display.update(0);
    expect(actor!.root.position).toEqual(
      storedLocalPosition.clone().add(new Vector3(0.4, 0.2, -0.3)),
    );

    actor!.releaseOnNextSync();
    display.sync(snapshot([map]));
    expect(actor!.root.position.toArray()).toEqual([0, 0, 0]);
    expect(actor!.root.parent).toBeNull();
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(true);
    expect(geometryDispose).not.toHaveBeenCalled();
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());

    display.dispose();
    propModels.dispose();
  });

  it('returns every rearranged item actor to its canonical storage pose', () => {
    const itemIds = [
      'cannedFood',
      'ductTape',
      'compass',
      'map',
      'flareGun',
      'anchor',
      'umbrella',
      'swimRing',
      'flashlight',
      'shotgun',
    ] as const satisfies readonly ItemId[];
    const items = itemIds.map((itemId) => savedItem(itemId));
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(propModels, parent, items);
    const currentSnapshot = snapshot(items, {
      food: 1,
      recoveredFood: 1,
    });
    display.sync(currentSnapshot);

    for (const saved of items) {
      const expected = boatSupplyTransform(saved.type, 0);
      const actor = display.borrowEventActor(saved.instanceId);

      expect(actor, saved.type).not.toBeNull();
      expect(actor!.root.position.toArray()).toEqual(expected.position.toArray());
      expect(actor!.root.quaternion.angleTo(new Quaternion().setFromEuler(expected.rotation)))
        .toBeLessThan(1e-6);
      expect(actor!.root.scale.toArray()).toEqual([
        expected.scale,
        expected.scale,
        expected.scale,
      ]);

      actor!.applyPose({
        x: 0.2,
        y: 0.1,
        z: -0.15,
        yaw: 0.12,
        pitch: -0.08,
        roll: 0.04,
        scaleX: 1.05,
        scaleY: 0.95,
        scaleZ: 1.1,
      });
      actor!.releaseOnNextSync();
      display.sync(currentSnapshot);

      const storedCopy = parent.getObjectByName(`boat-supply:${saved.type}:copy-1`)!;
      expect(storedCopy.position.toArray()).toEqual(expected.position.toArray());
      expect(storedCopy.rotation.toArray()).toEqual(expected.rotation.toArray());
      expect(storedCopy.scale.toArray()).toEqual([
        expected.scale,
        expected.scale,
        expected.scale,
      ]);
      expect(actor!.root.parent).toBeNull();
    }

    display.dispose();
    propModels.dispose();
  });

  it('hides one presentation item without changing its inventory quantity', () => {
    const scuba = savedItem('scubaSet');
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(propModels, parent, [scuba]);
    const currentSnapshot = snapshot([scuba]);
    display.sync(currentSnapshot);

    display.setPresentationItemHidden(scuba.instanceId, true);
    expect(display.recordFor('scubaSet')).toMatchObject({
      quantity: 1,
      usableQuantity: 1,
    });
    expect(parent.getObjectByName('boat-supply:scubaSet')?.visible).toBe(false);

    display.setPresentationItemHidden(scuba.instanceId, false);
    display.setPresentationItemHidden(scuba.instanceId, false);
    expect(parent.getObjectByName('boat-supply:scubaSet')?.visible).toBe(true);

    display.setPresentationItemHidden(scuba.instanceId, true);
    display.sync(currentSnapshot);
    expect(parent.getObjectByName('boat-supply:scubaSet')?.visible).toBe(false);
    display.setPresentationItemHidden(scuba.instanceId, false);
    expect(parent.getObjectByName('boat-supply:scubaSet')?.visible).toBe(true);

    display.dispose();
    propModels.dispose();
  });

  it('plays and clears the dive presentation with shared wave updates', async () => {
    const scuba = savedItem('scubaSet');
    const camera = new PerspectiveCamera();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [scuba],
    );
    world.syncInventory(snapshot([scuba]));
    world.update(80, 0.1);
    const storedScuba = world.scene.getObjectByName(
      'boat-supply:scubaSet:copy-1',
    )!;
    const storedScubaPosition = storedScuba.position.clone();
    expect([storedScubaPosition.x, storedScubaPosition.z]).toEqual([1.33, -1.15]);
    const initialPosition = camera.position.clone();
    const initialQuaternion = camera.quaternion.clone();
    const internals = world as unknown as {
      diveController: DivePresentationController;
    };
    const updateDive = vi.spyOn(internals.diveController, 'update');
    const impact = vi.fn();

    const pending = world.playDive(scuba.instanceId, {
      onWaterImpact: impact,
    });
    expect(world.scene.getObjectByName('boat-supply:scubaSet')?.visible).toBe(false);
    expect(world.scene.getObjectByName('glasses25.001')).not.toBeUndefined();

    world.update(81.1, 1.1);
    expect(updateDive).toHaveBeenCalledWith(81.1, 1.1);
    const seatedX = camera.position.x;
    expect(seatedX).toBeGreaterThan(1.6);
    expect(camera.position.z).toBeLessThan(-1.1);
    const initialDirection = new Vector3(0, 0, -1).applyQuaternion(initialQuaternion);
    const seatedDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(initialDirection.angleTo(seatedDirection)).toBeCloseTo(Math.PI / 2);
    expect(camera.position.toArray()).not.toEqual(initialPosition.toArray());
    world.update(83.6, 2.5);
    expect(camera.position.x).toBeGreaterThan(seatedX + 0.85);
    expect(camera.position.x).toBeGreaterThan(2.3);
    world.update(84, 0.4);
    expect(impact).toHaveBeenCalledOnce();

    world.clearDivePresentation();
    world.clearDivePresentation();
    await pending;
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    expect(world.scene.getObjectByName('boat-supply:scubaSet')?.visible).toBe(true);
    expect(storedScuba.position.toArray()).toEqual(storedScubaPosition.toArray());

    world.dispose();
    propModels.dispose();
  });

  it('keeps the Wreckage hold camera and restores real roots when hidden', async () => {
    const scuba = savedItem('scubaSet');
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [scuba],
      undefined,
      undefined,
      'low',
      createTestEventModels(),
    );
    world.syncInventory(snapshot([scuba]));
    world.stageEvent({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
    const focus = world.enterFocusedEventView('wreckage');
    world.update(1.1, 1.1);
    await focus;
    const focusedPosition = camera.position.clone();
    const waterImpact = vi.fn();

    const dive = world.playEventItemUse(
      'wreckage',
      'dive',
      scuba.instanceId,
      waterImpact,
    );
    expect(camera.position.toArray()).toEqual(focusedPosition.toArray());

    world.update(1.11, 0.01);
    expect(camera.position.distanceTo(focusedPosition)).toBeLessThan(0.01);
    expect(waterImpact).not.toHaveBeenCalled();
    world.update(2.2, 1.09);
    expect(camera.position.x).toBeCloseTo(1.66);
    world.update(4.69, 2.49);
    expect(waterImpact).not.toHaveBeenCalled();
    world.update(4.7, 0.01);
    expect(waterImpact).toHaveBeenCalledExactlyOnceWith(0);
    world.update(6.9, 2.2);

    const holdPosition = camera.getWorldPosition(new Vector3());
    expect(holdPosition.x).toBeCloseTo(4.2);
    expect(holdPosition.y).toBeCloseTo(-3.4);
    expect(holdPosition.z).toBeCloseTo(-4.3);
    expect(world.scene.getObjectByName('dedicated-event-boat-effects')?.visible).toBe(false);
    expect(world.scene.getObjectByName('dedicated-event-camera-effects')?.visible).toBe(false);
    expect(world.scene.getObjectByName('event-item-effects')?.visible).toBe(false);
    expect(world.scene.getObjectByName('wreckage-wreck')?.visible).toBe(true);

    world.update(7, 0.1);
    const nextHoldPosition = camera.getWorldPosition(new Vector3());
    expect(nextHoldPosition.x).toBeCloseTo(4.2);
    expect(nextHoldPosition.y).toBeCloseTo(-3.4);
    expect(nextHoldPosition.z).toBeCloseTo(-4.3);

    world.setDocumentHidden(true);
    await dive;
    expect(world.scene.getObjectByName('dedicated-event-boat-effects')?.visible).toBe(true);
    expect(world.scene.getObjectByName('dedicated-event-camera-effects')?.visible).toBe(true);
    expect(world.scene.getObjectByName('event-item-effects')?.visible).toBe(true);

    world.clearEvent();
    world.dispose();
    propModels.dispose();
  });

  it('projects clickable Wreckage debris on the right in default and focused views', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      undefined,
      'low',
      createTestEventModels(),
    );
    try {
      world.stageEvent({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
      const reveal = world.revealEvent('wreckage');
      world.update(1.2, 1.2);
      await reveal;

      const interaction = world.projectInteractionAnchors(1280, 720)
        .find(({ id }) => id === 'event:wreckage');

      expect(interaction).toEqual(expect.objectContaining({
        id: 'event:wreckage',
        eventFocusId: 'wreckage',
        tooltip: false,
        visible: true,
      }));
      if (interaction?.hitArea === undefined) {
        throw new Error('Projected Wreckage debris requires a click area.');
      }
      expect(interaction).not.toHaveProperty('eventChoiceId');
      expect(interaction.x).toBeGreaterThan(640);
      expect(interaction.x).toBeLessThan(1280);
      expect(interaction.y).toBeGreaterThan(0);
      expect(interaction.y).toBeLessThan(720);
      expect(interaction.hitArea.width).toBeGreaterThanOrEqual(96);
      expect(interaction.hitArea.height).toBeGreaterThanOrEqual(72);

      const focus = world.enterFocusedEventView('wreckage');
      world.update(1.1, 1.1);
      await focus;
      const focusedBounds = world.projectEventInteractionBounds('wreckage', 1280, 720);
      expect(focusedBounds).toEqual(expect.objectContaining({ visible: true }));
      expect(focusedBounds!.x).toBeGreaterThan(720);
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('runs the real Carlitos visit through the Wreckage presentation boundary', async () => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
      [],
      undefined,
      furniture,
      'low',
      createTestEventModels(),
    );
    try {
      world.syncInventory(snapshot([], {
        carlitos: {
          alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
          pettedToday: false, deathCause: null,
        },
      }));
      world.stageEvent({ eventId: 'wreckage', targetInstanceId: null, variantSeed: 17 });
      const companion = world.scene.getObjectByName('carlitos-companion')!;
      const basePosition = companion.position.clone();
      let finished = false;

      const visit = world.playEventChoice('wreckage', 'delegate-carlitos')
        .then(() => { finished = true; });
      await Promise.resolve();
      expect(finished).toBe(false);

      world.update(0.35, 0.35);
      expect(companion.position.equals(basePosition)).toBe(false);
      expect(finished).toBe(false);

      world.update(1.5, 1.15);
      await visit;
      expect(finished).toBe(true);
      expect(companion.position.toArray()).toEqual(basePosition.toArray());
    } finally {
      world.dispose();
      furniture.dispose();
      propModels.dispose();
    }
  });

  it('drives two exact same-group actors until each owner releases it', () => {
    const firstMap = savedItem('map', 3);
    const secondMap = savedItem('map', 6);
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(
      propModels,
      parent,
      [firstMap, secondMap],
    );
    display.sync(snapshot([firstMap, secondMap]));
    const releaseBorrowedActor = vi.spyOn(
      display as unknown as {
        releaseBorrowedEventActor(
          instanceId: ItemInstanceId,
          syncLatestSnapshot: boolean,
        ): void;
      },
      'releaseBorrowedEventActor',
    );

    const firstActor = display.borrowEventActor(firstMap.instanceId)!;
    const secondActor = display.borrowEventActor(secondMap.instanceId)!;
    const firstStoredPosition = firstActor.root.position.clone();
    const secondStoredPosition = secondActor.root.position.clone();
    expect(display.borrowEventActor(firstMap.instanceId)).toBe(firstActor);
    expect(display.borrowEventActor(secondMap.instanceId)).toBe(secondActor);
    expect(firstActor.root).not.toBe(secondActor.root);
    expect(firstActor.root.name).toBe(
      `boat-supply-event:${firstMap.instanceId}`,
    );
    expect(secondActor.root.name).toBe(
      `boat-supply-event:${secondMap.instanceId}`,
    );
    expect(firstActor.root.parent).toBe(parent);
    expect(secondActor.root.parent).toBe(parent);
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(false);
    expect(firstActor.root.visible).toBe(true);
    expect(secondActor.root.visible).toBe(true);
    expect(firstMesh(firstActor.root).geometry).toBe(
      firstMesh(secondActor.root).geometry,
    );
    expect(firstMesh(firstActor.root).material).toBe(
      firstMesh(secondActor.root).material,
    );
    const firstRemove = vi.spyOn(firstActor.root, 'removeFromParent');
    const secondRemove = vi.spyOn(secondActor.root, 'removeFromParent');

    firstActor.applyPose({
      x: 1.2,
      y: 0.3,
      z: -0.4,
      yaw: 0.2,
      pitch: 0,
      roll: -0.5,
      scaleX: 0.8,
      scaleY: 0.8,
      scaleZ: 0.8,
    });
    secondActor.applyPose({
      x: -1.4,
      y: 0.5,
      z: -0.7,
      yaw: -0.3,
      pitch: 0.1,
      roll: 0.6,
      scaleX: 0.7,
      scaleY: 0.7,
      scaleZ: 0.7,
    });
    display.update(0);

    expect(firstActor.root.position).toEqual(
      firstStoredPosition.clone().add(new Vector3(1.2, 0.3, -0.4)),
    );
    expect(secondActor.root.position).toEqual(
      secondStoredPosition.clone().add(new Vector3(-1.4, 0.5, -0.7)),
    );

    firstActor.release();
    secondActor.applyPose({
      x: -1.8,
      y: 0.6,
      z: -0.9,
      yaw: -0.4,
      pitch: 0.15,
      roll: 0.8,
      scaleX: 0.6,
      scaleY: 0.6,
      scaleZ: 0.6,
    });
    display.update(0);
    expect(firstActor.root.parent).toBeNull();
    expect(secondActor.root.position).toEqual(
      secondStoredPosition.clone().add(new Vector3(-1.8, 0.6, -0.9)),
    );
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(false);

    secondActor.releaseOnNextSync();
    display.sync(snapshot([]));
    expect(secondActor.root.parent).toBeNull();
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(false);
    expect(display.recordFor('map')).toMatchObject({
      backingInstanceId: null,
      visibleCopies: 0,
    });

    display.dispose();
    expect(firstRemove).toHaveBeenCalledOnce();
    expect(secondRemove).toHaveBeenCalledOnce();
    expect(releaseBorrowedActor).toHaveBeenCalledTimes(2);
    expect(releaseBorrowedActor).toHaveBeenNthCalledWith(
      1,
      firstMap.instanceId,
      true,
    );
    expect(releaseBorrowedActor).toHaveBeenNthCalledWith(
      2,
      secondMap.instanceId,
      false,
    );
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

  it('disposes the hanging lantern during normal world cleanup', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
    );
    const light = world.scene.getObjectByName('hanging-lantern:light') as PointLight;
    const shadowDispose = vi.spyOn(light.shadow, 'dispose');
    world.dispose();
    world.dispose();
    expect(shadowDispose).toHaveBeenCalledOnce();
    propModels.dispose();
  });

  it('continues owned geometry, material, and texture cleanup and rethrows the first error', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      ...createTestSkyTextures(),
      [savedItem('medicalKit')],
    );
    world.syncInventory(snapshot([savedItem('medicalKit')]));
    const propMesh = firstMesh(
      world.scene.getObjectByName('boat-supply:medicalKit:copy-1')!,
    );
    const lifeboatMaterials = new Set<Material>();
    collectMeshResources(
      world.scene.getObjectByName('lifeboat')!,
      new Set<BufferGeometry>(),
      lifeboatMaterials,
    );
    const textures = new Set<Texture>();
    lifeboatMaterials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof Texture) textures.add(value);
      });
    });
    const texture = textures.values().next().value!;
    expect(texture).toBeInstanceOf(Texture);
    const firstError = new Error('boat geometry disposal failed');
    const laterError = new Error('boat material disposal failed');
    const geometryDispose = vi.spyOn(propMesh.geometry, 'dispose').mockImplementation(() => {
      throw firstError;
    });
    const material = Array.isArray(propMesh.material) ? propMesh.material[0]! : propMesh.material;
    const materialDispose = vi.spyOn(material, 'dispose').mockImplementation(() => {
      throw laterError;
    });
    const textureDispose = vi.spyOn(texture, 'dispose');

    expect(() => world.dispose()).toThrow(firstError);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(() => world.dispose()).not.toThrow();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();

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

  it('continues every owner and camera cleanup step after early failures', () => {
    const originalParent = new Group();
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);
    camera.rotation.set(0.2, -0.3, 0.1);
    originalParent.add(camera);
    const originalPosition = camera.position.clone();
    const originalQuaternion = camera.quaternion.clone();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      [savedItem('medicalKit')],
    );
    const internals = world as unknown as {
      ocean: { dispose(): void };
      fishingPresentation: {
        disposeAnimation(): void;
        disposeCatches(): void;
        disposeParticles(): void;
        detach(): void;
        disposeVisualResources(): void;
      };
      sky: { dispose(): void };
      ownedGeometries: Set<BufferGeometry>;
      ownedMaterials: Set<Material>;
      ownedTextures: Set<Texture>;
    };
    const geometry = internals.ownedGeometries.values().next().value!;
    const material = internals.ownedMaterials.values().next().value!;
    const texture = internals.ownedTextures.values().next().value!;
    const firstError = new Error('survival ocean cleanup failed');
    const laterSkyError = new Error('survival sky cleanup failed');
    const laterCameraError = new Error('camera detach cleanup failed');
    const calls: string[] = [];
    const originalOceanDispose = internals.ocean.dispose.bind(internals.ocean);
    const oceanDispose = vi.spyOn(internals.ocean, 'dispose').mockImplementation(() => {
      calls.push('ocean');
      originalOceanDispose();
      throw firstError;
    });
    const fishing = internals.fishingPresentation;
    const originalAnimationDispose = fishing.disposeAnimation.bind(fishing);
    const animationDispose = vi.spyOn(fishing, 'disposeAnimation').mockImplementation(() => {
      calls.push('fishing-animation');
      originalAnimationDispose();
    });
    const originalCatchDispose = fishing.disposeCatches.bind(fishing);
    const catchDispose = vi.spyOn(fishing, 'disposeCatches').mockImplementation(() => {
      calls.push('fishing-catches');
      originalCatchDispose();
    });
    const originalParticleDispose = fishing.disposeParticles.bind(fishing);
    const particleDispose = vi.spyOn(fishing, 'disposeParticles').mockImplementation(() => {
      calls.push('fishing-particles');
      originalParticleDispose();
    });
    const originalDetach = fishing.detach.bind(fishing);
    const fishingDetach = vi.spyOn(fishing, 'detach').mockImplementation(() => {
      calls.push('fishing-detach');
      originalDetach();
    });
    const originalVisualDispose = fishing.disposeVisualResources.bind(fishing);
    const visualDispose = vi.spyOn(fishing, 'disposeVisualResources').mockImplementation(() => {
      calls.push('fishing-visuals');
      originalVisualDispose();
    });
    const originalSkyDispose = internals.sky.dispose.bind(internals.sky);
    const skyDispose = vi.spyOn(internals.sky, 'dispose').mockImplementation(() => {
      calls.push('sky');
      originalSkyDispose();
      throw laterSkyError;
    });
    const originalSceneRemove = world.scene.remove.bind(world.scene);
    let ownerSceneRemoveCalls = 0;
    const sceneRemove = vi.spyOn(world.scene, 'remove')
      .mockImplementation((...objects: Object3D[]) => {
        if (objects.length > 1 && objects.some(({ name }) => name === 'boat-motion-rig')) {
          ownerSceneRemoveCalls += 1;
          calls.push('scene');
        }
        return originalSceneRemove(...objects);
      });
    const originalCameraRemove = camera.removeFromParent.bind(camera);
    let injectCameraFailure = true;
    const cameraRemove = vi.spyOn(camera, 'removeFromParent').mockImplementation(() => {
      const result = originalCameraRemove();
      if (injectCameraFailure) {
        injectCameraFailure = false;
        calls.push('camera');
        throw laterCameraError;
      }
      return result;
    });
    const originalGeometryDispose = geometry.dispose.bind(geometry);
    const geometryDispose = vi.spyOn(geometry, 'dispose').mockImplementation(() => {
      calls.push('geometry');
      originalGeometryDispose();
    });
    const originalMaterialDispose = material.dispose.bind(material);
    const materialDispose = vi.spyOn(material, 'dispose').mockImplementation(() => {
      calls.push('material');
      originalMaterialDispose();
    });
    const originalTextureDispose = texture.dispose.bind(texture);
    const textureDispose = vi.spyOn(texture, 'dispose').mockImplementation(() => {
      calls.push('texture');
      originalTextureDispose();
    });

    expect(() => world.dispose()).toThrow(firstError);

    expect(calls).toEqual([
      'fishing-animation',
      'fishing-catches',
      'ocean',
      'fishing-particles',
      'sky',
      'fishing-detach',
      'scene',
      'camera',
      'geometry',
      'material',
      'texture',
      'fishing-visuals',
    ]);
    expect(world.scene.children).toEqual([]);
    expect(camera.parent).toBe(originalParent);
    expect(camera.position.toArray()).toEqual(originalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(originalQuaternion.toArray());
    expect(internals.ownedGeometries.size).toBe(0);
    expect(internals.ownedMaterials.size).toBe(0);
    expect(internals.ownedTextures.size).toBe(0);
    expect(() => world.dispose()).not.toThrow();
    [
      oceanDispose,
      animationDispose,
      catchDispose,
      particleDispose,
      fishingDetach,
      visualDispose,
      skyDispose,
      geometryDispose,
      materialDispose,
      textureDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(sceneRemove).toHaveBeenCalled();
    expect(ownerSceneRemoveCalls).toBe(1);
    expect(cameraRemove).toHaveBeenCalledTimes(2);

    propModels.dispose();
  });

  it('projects usable actions and hides consumed instances', () => {
    const savedItems = [
      savedItem('ductTape'),
      savedItem('baitTin'), savedItem('baitTin', 2),
      savedItem('flareGun'), savedItem('flashlight'),
    ];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      ...createTestSkyTextures(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.consumeInstance('baitTin-2');

    world.syncInventory(snapshot(savedItems, { bait: 3, recoveredBait: 1, inventory: inventory.snapshot() }));
    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'supply:ductTape', remainingUses: 1, quantity: 1,
      }),
      expect.objectContaining({
        id: 'supply:baitTin', remainingUses: 1, quantity: 3,
      }),
      expect.objectContaining({
        id: 'supply:flareGun', remainingUses: 1, backingInstanceId: 'flareGun-1',
      }),
      expect.objectContaining({
        id: 'supply:flashlight', remainingUses: null, backingInstanceId: 'flashlight-1',
      }),
    ]));
    world.dispose();
    propModels.dispose();
  });

  it('projects the radio action only while a signal is active', () => {
    const savedItems = [savedItem('radio')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      ...createTestSkyTextures(),
      savedItems,
    );

    world.syncInventory(snapshot(savedItems));
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'supply:radio')).toBeUndefined();

    world.setEventEligibleItems(new Set([savedItems[0]!.instanceId]));
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'supply:radio')).toMatchObject({
        itemType: 'radio',
      });

    world.setEventEligibleItems(null);
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'supply:radio')).toBeUndefined();

    world.syncInventory(snapshot(savedItems, { radioSignalAvailable: true }));
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'supply:radio')).toMatchObject({
        itemType: 'radio',
        action: 'answerRadio',
      });

    world.dispose();
    propModels.dispose();
  });

  it('uses the full projected item model as its pointer target', () => {
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

    const bucket = world.projectInteractionAnchors(8_000, 6_000)
      .find(({ id }) => id === 'supply:bucket')!;

    expect(bucket.hitArea?.width).toBeGreaterThan(50);
    expect(bucket.hitArea?.height).toBeGreaterThan(50);
    world.dispose();
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

  it('preserves phased cleanup order and every simultaneous-failure priority', () => {
    type CleanupStep =
      | 'animation'
      | 'catches'
      | 'ocean'
      | 'weather'
      | 'particles'
      | 'sky'
      | 'detach'
      | 'world-resources'
      | 'fishing-visuals';
    const cleanupOrder = [
      'animation',
      'catches',
      'ocean',
      'weather',
      'particles',
      'sky',
      'detach',
      'world-resources',
      'fishing-visuals',
    ] as const satisfies readonly CleanupStep[];
    const failureCases = cleanupOrder.slice(1).map((first, index) => ({
      first,
      failures: new Set<CleanupStep>(cleanupOrder.slice(index + 1)),
    }));

    for (const { first, failures } of failureCases) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        ...createTestSkyTextures(),
      );
      const internals = world as unknown as {
        fishingPresentation: FishingPresentation;
        ocean: { dispose(): void };
        weatherEffects: { dispose(): void };
        sky: { dispose(): void };
        ownedGeometries: Set<BufferGeometry>;
      };
      const errors = new Map<CleanupStep, Error>(cleanupOrder.map((step) => [
        step,
        new Error(`${step} cleanup failed`),
      ]));
      const order: CleanupStep[] = [];
      const throwIfFailed = (step: CleanupStep): void => {
        if (failures.has(step)) throw errors.get(step)!;
      };
      const presentation = internals.fishingPresentation;
      const disposeAnimation = presentation.disposeAnimation.bind(presentation);
      vi.spyOn(presentation, 'disposeAnimation').mockImplementation(() => {
        order.push('animation');
        disposeAnimation();
      });
      const disposeCatches = presentation.disposeCatches.bind(presentation);
      vi.spyOn(presentation, 'disposeCatches').mockImplementation(() => {
        order.push('catches');
        disposeCatches();
        throwIfFailed('catches');
      });
      const disposeOcean = internals.ocean.dispose.bind(internals.ocean);
      vi.spyOn(internals.ocean, 'dispose').mockImplementation(() => {
        order.push('ocean');
        disposeOcean();
        throwIfFailed('ocean');
      });
      const disposeWeather = internals.weatherEffects.dispose.bind(internals.weatherEffects);
      vi.spyOn(internals.weatherEffects, 'dispose').mockImplementation(() => {
        order.push('weather');
        disposeWeather();
        throwIfFailed('weather');
      });
      const disposeParticles = presentation.disposeParticles.bind(presentation);
      vi.spyOn(presentation, 'disposeParticles').mockImplementation(() => {
        order.push('particles');
        disposeParticles();
        throwIfFailed('particles');
      });
      const disposeSky = internals.sky.dispose.bind(internals.sky);
      vi.spyOn(internals.sky, 'dispose').mockImplementation(() => {
        order.push('sky');
        disposeSky();
        throwIfFailed('sky');
      });
      const detach = presentation.detach.bind(presentation);
      vi.spyOn(presentation, 'detach').mockImplementation(() => {
        order.push('detach');
        detach();
        throwIfFailed('detach');
      });
      const geometry = internals.ownedGeometries.values().next().value!;
      const disposeGeometry = geometry.dispose.bind(geometry);
      vi.spyOn(geometry, 'dispose').mockImplementation(() => {
        order.push('world-resources');
        disposeGeometry();
        throwIfFailed('world-resources');
      });
      const disposeFishingVisuals = presentation.disposeVisualResources.bind(presentation);
      vi.spyOn(presentation, 'disposeVisualResources').mockImplementation(() => {
        order.push('fishing-visuals');
        disposeFishingVisuals();
        throwIfFailed('fishing-visuals');
      });

      expect(() => world.dispose()).toThrow(errors.get(first));
      expect(order).toEqual(cleanupOrder);
      expect(() => world.dispose()).not.toThrow();
      propModels.dispose();
    }
  });

  it('resets base lighting, motion, cue, and rescue state on ready entry and clear', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const internals = world as unknown as {
      ambient: AmbientLight;
      motionRig: Group;
      cueCameraRig: Group;
      boatPose: { y: number; pitch: number; roll: number; driftX: number; driftZ: number };
      activeRescueCueCallback: ((progress: number | null) => void) | null;
    };
    const entry = world.enterFishingView();
    world.update(1.1, 1.1);
    await entry;

    const expectImmediateBaseReset = async (action: () => void | Promise<void>) => {
      internals.ambient.intensity = -1;
      internals.motionRig.position.set(9, 9, 9);
      internals.motionRig.rotation.set(1, 1, 1);
      internals.cueCameraRig.position.set(8, 8, 8);
      internals.cueCameraRig.rotation.set(2, 2, 2);
      const rescue = vi.fn();
      internals.activeRescueCueCallback = rescue;

      await action();

      expect(internals.ambient.intensity).toBeGreaterThan(0);
      expect(internals.motionRig.position.toArray()).toEqual([
        internals.boatPose.driftX,
        0.22 + internals.boatPose.y,
        internals.boatPose.driftZ,
      ]);
      expect(internals.motionRig.rotation.toArray().slice(0, 3)).toEqual([
        internals.boatPose.pitch,
        0,
        -internals.boatPose.roll,
      ]);
      expect(internals.cueCameraRig.position.toArray()).toEqual([0, 0, 0]);
      expect(internals.cueCameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(rescue).toHaveBeenCalledWith(null);
    };

    await expectImmediateBaseReset(() => world.enterFishingView());
    await expectImmediateBaseReset(() => world.clearFishingPresentation());

    world.dispose();
    propModels.dispose();
  });

  it('preserves the complete effective frame order', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      ...createTestSkyTextures(),
    );
    const internals = world as unknown as {
      ocean: OceanRenderer;
      buoyancy: BoatBuoyancy;
      cameraController: {
        update(delta: number): void;
        updateFocusedEventView(delta: number, target: Object3D | null): void;
      };
      hangingLantern: { update(...args: unknown[]): void };
      diveController: DivePresentationController;
      sky: { update(...args: unknown[]): void };
      supplyDisplay: {
        updatePropAnimations(delta: number): void;
        resetEventPoseForFrame(): void;
        update(delta: number): void;
      };
      carlitos: { update(delta: number): void };
      chestDisplay: { update(delta: number): void };
      fishingPresentation: FishingPresentation;
      eventPresentationHost: { update(time: number, delta: number): void };
      carlitosDelegation: CarlitosDelegationPresentation;
      itemUseController: { update(delta: number): void };
      repairToolboxAnimation: { update(delta: number): void };
      weatherEffects: { update(...args: unknown[]): void };
    };
    const order: string[] = [];
    vi.spyOn(internals.ocean, 'setVortex').mockImplementation(() => {
      order.push('ocean-vortex');
    });
    vi.spyOn(internals.buoyancy, 'sampleTargetInto').mockImplementation(() => {
      order.push('buoyancy');
    });
    vi.spyOn(internals.cameraController, 'update').mockImplementation(() => {
      order.push('camera');
    });
    vi.spyOn(internals.hangingLantern, 'update').mockImplementation(() => {
      order.push('lantern');
    });
    vi.spyOn(internals.diveController, 'update').mockImplementation(() => {
      order.push('dive');
    });
    vi.spyOn(internals.sky, 'update').mockImplementation(() => {
      order.push('sky');
    });
    vi.spyOn(internals.supplyDisplay, 'updatePropAnimations').mockImplementation(() => {
      order.push('supply-props');
    });
    vi.spyOn(internals.carlitos, 'update').mockImplementation(() => {
      order.push('carlitos');
    });
    vi.spyOn(internals.chestDisplay, 'update').mockImplementation(() => {
      order.push('chest');
    });
    vi.spyOn(internals.fishingPresentation, 'advance').mockImplementation(() => {
      order.push('fishing-animation');
    });
    vi.spyOn(internals.supplyDisplay, 'resetEventPoseForFrame').mockImplementation(() => {
      order.push('supply-event-reset');
    });
    vi.spyOn(internals.eventPresentationHost, 'update').mockImplementation(() => {
      order.push('event');
    });
    vi.spyOn(internals.cameraController, 'updateFocusedEventView').mockImplementation(() => {
      order.push('drifting-camera');
    });
    vi.spyOn(internals.carlitosDelegation, 'update').mockImplementation(() => {
      order.push('carlitos-delegation');
    });
    vi.spyOn(internals.supplyDisplay, 'update').mockImplementation(() => {
      order.push('supply');
    });
    vi.spyOn(internals.itemUseController, 'update').mockImplementation(() => {
      order.push('item');
    });
    vi.spyOn(internals.repairToolboxAnimation, 'update').mockImplementation(() => {
      order.push('repair');
    });
    vi.spyOn(internals.fishingPresentation, 'updateParticles').mockImplementation(() => {
      order.push('fishing-particles');
    });
    vi.spyOn(internals.fishingPresentation, 'updateSurface').mockImplementation(() => {
      order.push('fishing-surface');
    });
    vi.spyOn(internals.ocean, 'update').mockImplementation(() => {
      order.push('ocean');
    });
    vi.spyOn(world.scene, 'updateMatrixWorld').mockImplementation(() => {
      order.push('scene-matrix');
    });
    vi.spyOn(internals.fishingPresentation, 'updateLineGeometry').mockImplementation(() => {
      order.push('fishing-line');
    });
    vi.spyOn(internals.ocean, 'setExclusions').mockImplementation(() => {
      order.push('ocean-exclusion');
    });
    vi.spyOn(internals.weatherEffects, 'update').mockImplementation(() => {
      order.push('weather');
    });
    vi.spyOn(internals.ocean, 'follow').mockImplementation(() => {
      order.push('ocean-follow');
    });

    world.update(4, 1 / 60);

    expect(order).toEqual([
      'ocean-vortex',
      'buoyancy',
      'camera',
      'lantern',
      'dive',
      'sky',
      'supply-props',
      'carlitos',
      'chest',
      'fishing-animation',
      'supply-event-reset',
      'event',
      'drifting-camera',
      'carlitos-delegation',
      'supply',
      'item',
      'repair',
      'fishing-particles',
      'fishing-surface',
      'ocean',
      'scene-matrix',
      'fishing-line',
      'ocean-exclusion',
      'weather',
      'ocean-follow',
    ]);
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
