// Importance: 8/10 (scaled from 4/5). Protects survival world integration and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  AnimationClip,
  Bone,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
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
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  Vector4,
  VectorKeyframeTrack,
} from 'three';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
import {
  BoatWorld,
  FISHING_PLAYER_SEAT,
  SURVIVAL_CELESTIAL_DIRECTION,
} from '../src/survival/BoatWorld';
import {
  BoatSupplyDisplay,
  GENERIC_EVENT_ITEM_USE_DURATION,
  type BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { CarlitosPresentation } from '../src/survival/CarlitosPresentation';
import {
  CHEST_DISAPPEAR_DURATION,
  CHEST_DISPLAY_SCALE,
  ChestDisplay,
} from '../src/survival/ChestDisplay';
import { DANGEROUS_WATERS_ITEM_DURATION } from '../src/survival/DangerousWatersPresentation';
import { DivePresentation } from '../src/survival/DivePresentation';
import {
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_NIGHT_INTENSITY,
} from '../src/survival/HangingLantern';
import {
  type FocusedEventPresentation,
  type FocusedEventPresentationDependencies,
  type FocusedEventPresentationFactories,
} from '../src/survival/FocusedEventPresentation';
import { FOCUSED_EVENT_IDS } from '../src/survival/eventPresentationRoutes';
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
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import { SWARM_ITEM_DURATION } from '../src/survival/events/anglerfishSwarmChoreography';
import { DEATH_STARE_ITEM_DURATION } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { TORNADO_ITEM_DURATION } from '../src/survival/events/tornadoChoreography';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import {
  GHOST_FLOAT_PATHS,
  supernaturalItemUseDuration,
  supernaturalRevealDuration,
} from '../src/survival/supernaturalEventChoreography';
import type {
  EventModelInstance,
} from '../src/survival/EventModelLibrary';
import { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import { weatherItemUseDuration } from '../src/survival/weatherEventChoreography';
import {
  boatStorageTransform,
  boatSupplyTransform,
} from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
import { projectBoatBounds } from '../src/survival/BoatInteraction';
import { collectMeshResources } from '../src/world/SceneResources';
import { HOVER_OUTLINE_NAME } from '../src/rendering/HoverOutline';
import { SurvivalInventoryState } from '../src/survival/inventory';
import {
  SURVIVAL_EVENTS,
  type DriftingItemEventId,
  type SurvivalEventId,
} from '../src/survival/eventCatalog';
import { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import type {
  ActionOutcome,
  SurvivalSnapshot,
} from '../src/survival/survivalTypes';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import type { SkyPalette } from '../src/world/skyPalette';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { loadProductionPropModels } from './helpers/productionPropModels';
import { createTestMoonTexture } from './helpers/skyAssets';
import { createTestShipFurniture } from './helpers/shipFurniture';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});

const HANDYMAN_FINGER_CHAINS = [
  ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
  ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
  ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
  ['RingF_lower', 'RingF_middle', 'RingF_tip'],
  ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
] as const;

function testRiggedHand(): Group {
  const root = new Group();
  const bones: Bone[] = [];
  for (const chain of HANDYMAN_FINGER_CHAINS) {
    let parent: Bone | null = null;
    for (const name of chain) {
      const bone = new Bone();
      bone.name = name;
      if (parent === null) root.add(bone);
      else parent.add(bone);
      bones.push(bone);
      parent = bone;
    }
  }
  const geometry = new BoxGeometry(1, 0.25, 1.5);
  const vertexCount = geometry.getAttribute('position').count;
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    weights[index * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.name = 'handyman-imported-palm-surface';
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  return root;
}

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
      const size = url.includes('driftingBottle')
        ? [0.18, 0.68, 0.18] as const
        : [1, 1, 1] as const;
      root.add(new Mesh(new BoxGeometry(...size), new MeshStandardMaterial()));
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
    endingReason: 'standard',
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
    rescueProgress: 0,
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

function expectedSurvivalPose(
  time: number,
  delta: number,
  amplitudeScale: number,
) {
  const buoyancy = new BoatBuoyancy((sampleTime, x, z, scale) =>
    sampleWaveField(DEFAULT_WAVES, sampleTime, x, z, scale));
  const target = buoyancy.sampleTarget(time, 0, 0, amplitudeScale);
  return smoothBoatPose(
    { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
    target,
    delta,
    7,
  );
}

describe('BoatWorld helpers', () => {
  it('forwards water quality to its owned ocean', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const setQuality = vi.spyOn(OceanRenderer.prototype, 'setQuality');

    world.setWaterQuality('ultra');
    expect(setQuality).toHaveBeenCalledWith('ultra');

    world.dispose();
    propModels.dispose();
  });

  it('uses a level default survival camera pitch', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const direction = camera.getWorldDirection(new Vector3());

    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);

    world.dispose();
    propModels.dispose();
  });

  it('keeps both celestial bodies in the upper center of survival view', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    world.scene.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const expected = new Vector3(...SURVIVAL_CELESTIAL_DIRECTION).normalize();
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;
    const key = world.scene.children.find(
      (object): object is DirectionalLight => object instanceof DirectionalLight,
    )!;
    const screenPosition = expected.clone()
      .multiplyScalar(50)
      .add(camera.getWorldPosition(new Vector3()))
      .project(camera);

    expect(sky.material.uniforms.uSunDirection!.value).toEqual(expected);
    expect(sky.material.uniforms.uMoonDirection!.value).toEqual(expected);
    expect(ocean.material.uniforms.uLightDirection!.value).toEqual(expected);
    expect(key.position.clone().sub(key.target.position).normalize()).toEqual(expected);
    expect(screenPosition.x).toBeCloseTo(0);
    expect(screenPosition.y).toBeGreaterThan(0);
    expect(screenPosition.y).toBeLessThan(0.5);

    world.dispose();
    propModels.dispose();
  });

  it('uses canonical supply transforms without the old slatted platform', () => {
    const savedItems = createItemInstances();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems, {
      food: ITEM_DEFINITIONS.cannedFood.spawnCount,
      bait: ITEM_DEFINITIONS.baitTin.spawnCount,
      recoveredFood: ITEM_DEFINITIONS.cannedFood.spawnCount,
      recoveredBait: ITEM_DEFINITIONS.baitTin.spawnCount,
      carlitos: {
        alive: true,
        energy: 3,
        hunger: 5,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      },
    }));

    expect(world.scene.getObjectByName('survival-supply-platform')).toBeUndefined();
    for (const type of Object.keys(ITEM_DEFINITIONS) as ItemId[]) {
      for (let index = 0; index < ITEM_DEFINITIONS[type].spawnCount; index += 1) {
        const copy = type === 'carlitos'
          ? world.scene.getObjectByName('carlitos-companion')!
          : world.scene.getObjectByName(
              `boat-supply:${type}:copy-${index + 1}`,
            )!;
        const expected = boatSupplyTransform(type, index);
        if (type === 'carlitos') {
          expected.position.x = -Math.abs(expected.position.x);
          expected.rotation.y = -Math.abs(expected.rotation.y);
        }

        expect(copy.visible, `${type}-${index + 1}`).toBe(true);
        expect(copy.position.toArray()).toEqual(expected.position.toArray());
        expect(copy.rotation.toArray()).toEqual(expected.rotation.toArray());
        expect(copy.scale.toArray()).toEqual([
          expected.scale,
          expected.scale,
          expected.scale,
        ]);
      }
    }

    const scuba = world.scene.getObjectByName('boat-supply:scubaSet:copy-1')!;
    const umbrella = world.scene.getObjectByName('boat-supply:umbrella:copy-1')!;
    const medicalKit = world.scene.getObjectByName('boat-supply:medicalKit:copy-1')!;
    const fishingNet = world.scene.getObjectByName('boat-supply:fishingNet:copy-1')!;
    const bucket = world.scene.getObjectByName('boat-supply:bucket:copy-1')!;
    expect([scuba.position.x, scuba.position.z]).toEqual([1.33, -1.15]);
    expect([umbrella.position.x, umbrella.position.z]).toEqual([0.55, -0.90]);
    expect([medicalKit.position.x, medicalKit.position.z]).toEqual([-0.50, -1.27]);
    expect([fishingNet.position.x, fishingNet.position.z]).toEqual([-0.96, -1.15]);
    expect([bucket.position.x, bucket.position.z]).toEqual([1.03, -1.00]);

    const supplyBounds = (id: ItemId): Box3 => {
      const transform = boatSupplyTransform(id, 0);
      const bounds = ITEM_MODEL_SPECS[id].normalizedBounds;
      return new Box3(
        new Vector3(...bounds.min),
        new Vector3(...bounds.max),
      ).applyMatrix4(new Matrix4().compose(
        transform.position,
        new Quaternion().setFromEuler(transform.rotation),
        new Vector3().setScalar(transform.scale),
      ));
    };
    const medicalKitBounds = supplyBounds('medicalKit');
    const fishingNetBounds = supplyBounds('fishingNet');
    const bucketBounds = supplyBounds('bucket');
    const scubaBounds = supplyBounds('scubaSet');
    const umbrellaBounds = supplyBounds('umbrella');
    const flareGunBounds = supplyBounds('flareGun');
    const bottledPaperBounds = supplyBounds('bottledPaper');
    const starboardShelf = world.scene.getObjectByName('lifeboat-edge-wear-1-1')!;
    const flareShelf = world.scene.getObjectByName('lifeboat-edge-wear--1-1')!;
    const starboardShelfBounds = new Box3().setFromObject(starboardShelf);
    const flareShelfBounds = new Box3().setFromObject(flareShelf);
    expect(bucketBounds.intersectsBox(umbrellaBounds)).toBe(false);
    expect(bucketBounds.intersectsBox(scubaBounds)).toBe(false);
    expect(fishingNetBounds.intersectsBox(medicalKitBounds)).toBe(false);
    expect(flareGunBounds.min.y).toBeCloseTo(flareShelfBounds.max.y);
    expect(flareGunBounds.min.x).toBeGreaterThan(flareShelfBounds.min.x);
    expect(flareGunBounds.max.x).toBeLessThan(flareShelfBounds.max.x);
    expect(flareGunBounds.min.z).toBeGreaterThan(flareShelfBounds.min.z);
    expect(flareGunBounds.max.z).toBeLessThan(flareShelfBounds.max.z);
    expect(bottledPaperBounds.min.y).toBeCloseTo(starboardShelfBounds.max.y);
    expect(bottledPaperBounds.min.x).toBeGreaterThan(starboardShelfBounds.min.x);
    expect(bottledPaperBounds.max.x).toBeLessThan(starboardShelfBounds.max.x);
    expect(bottledPaperBounds.min.z).toBeGreaterThan(starboardShelfBounds.min.z);
    expect(bottledPaperBounds.max.z).toBeLessThan(starboardShelfBounds.max.z);
    expect(flareGunBounds.getCenter(new Vector3()).x).toBeCloseTo(-1.38);
    expect(flareShelf.position.x).toBeCloseTo(-starboardShelf.position.x);
    expect(flareShelf.position.y).toBeCloseTo(starboardShelf.position.y);
    expect(flareShelf.position.z).toBeCloseTo(starboardShelf.position.z);
    expect(flareShelf.rotation.y).toBeCloseTo(-starboardShelf.rotation.y);
    expect(flareShelfBounds.getSize(new Vector3()).x)
      .toBeCloseTo(starboardShelfBounds.getSize(new Vector3()).x);
    expect(flareShelfBounds.getSize(new Vector3()).z)
      .toBeCloseTo(starboardShelfBounds.getSize(new Vector3()).z);
    for (const margin of [
      flareGunBounds.min.z - flareShelfBounds.min.z,
      flareShelfBounds.max.z - flareGunBounds.max.z,
    ]) {
      expect(margin).toBeGreaterThan(0.04);
      expect(margin).toBeLessThan(0.10);
    }

    world.dispose();
    propModels.dispose();
  });

  it('uses the resolved thunderstorm profile for atmosphere and shared wave motion', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const profile = presentationWeatherProfile('thunderstorm');
    const internals = world as unknown as {
      ambient: { intensity: number };
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
      createTestMoonTexture(),
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

  it('keeps waves rougher than rain while fog remains comparatively quiet', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const amplitudes = new Map<string, number>();

    try {
      for (const [index, id] of (['waves', 'rain', 'fog'] as const).entries()) {
        world.setPresentationWeather(id);
        world.update(index + 1, 1 / 60);
        const buoyancyAmplitude = buoyancySample.mock.calls.at(-1)?.[4];
        const oceanAmplitude = oceanUpdate.mock.calls.at(-1)?.[1];
        expect(buoyancyAmplitude).toBe(oceanAmplitude);
        amplitudes.set(id, oceanAmplitude!);
      }

      expect(amplitudes.get('waves')).toBeGreaterThan(amplitudes.get('rain')!);
      expect(amplitudes.get('rain')).toBeGreaterThan(amplitudes.get('fog')!);
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
      createTestMoonTexture(),
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

  it('routes all five focused event IDs and keeps generic tableaus as fallback', async () => {
    const propModels = createTestPropModels();
    const doubles = new Map(
      FOCUSED_EVENT_IDS.map((eventId) => [
        eventId,
        focusedPresenterTestDouble(eventId),
      ]),
    );
    const factories = Object.fromEntries(
      FOCUSED_EVENT_IDS.map((eventId) => [
        eventId,
        () => doubles.get(eventId)!.presenter,
      ]),
    ) as FocusedEventPresentationFactories;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      factories,
    );

    for (const eventId of FOCUSED_EVENT_IDS) {
      const presenter = doubles.get(eventId)!;
      world.stageEvent(eventId);
      expect(presenter.stage).toHaveBeenCalledOnce();
      expect(world.scene.getObjectByName(`focused-event:${eventId}`)?.visible)
        .toBe(true);
      const generic = world.scene.getObjectByName(`event-prop:${eventId}`);
      if (
        eventId === 'night-trader'
        || eventId === 'handyman'
        || eventId === 'other-people'
      ) {
        expect(generic).toBeUndefined();
      } else {
        expect(generic?.visible).toBe(false);
      }
      await world.revealEvent(eventId);
      expect(presenter.reveal).toHaveBeenCalledOnce();
      const choice = {
        choiceId: 'test-choice',
        instanceId: null,
        condition: null,
      };
      await world.playEventChoice(eventId, choice);
      expect(presenter.playChoice).toHaveBeenCalledWith(choice);
      await world.reactToEventOutcome(eventId, {
        accepted: true,
        code: 'event-resolved',
        message: `${eventId} resolved.`,
        deltas: {},
        cue: 'none',
        eventResult: {
          eventId,
          choiceId: 'test-choice',
          resultId: 'test-result',
        },
      }, choice);
      expect(presenter.react).toHaveBeenCalledWith(
        {
          eventId,
          choiceId: 'test-choice',
          resultId: 'test-result',
        },
        expect.objectContaining({ code: 'event-resolved' }),
      );
      world.clearEvent();
      expect(presenter.clear).toHaveBeenCalledOnce();
    }

    for (const presenter of doubles.values()) {
      expect(presenter.stage).toHaveBeenCalledOnce();
    }

    world.dispose();
    for (const presenter of doubles.values()) {
      expect(presenter.dispose).toHaveBeenCalledOnce();
    }
    propModels.dispose();
  });

  it.each([
    ['dedicated', 'leak'],
    ['focused', 'other-people'],
    ['featured', 'flowers'],
    ['weather', 'windy-night'],
    ['supernatural', 'ghosts'],
    ['moon', 'face-on-the-moon'],
  ] as const)('delegates one %s event lifecycle to one adapter', async (family, eventId) => {
    const propModels = createTestPropModels();
    const adapter = eventAdapterTestDouble(eventId);
    const create = vi.spyOn(EventPresentationRegistry.prototype, 'create')
      .mockReturnValue(adapter);
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const choice = {
      choiceId: 'test-choice',
      instanceId: null,
      condition: null,
    } as const;
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: `${eventId} resolved.`,
      deltas: {},
      cue: 'none',
      ...(family === 'focused'
        ? {
            eventResult: {
              eventId,
              choiceId: choice.choiceId,
              resultId: 'test-result',
            },
          }
        : {}),
    };
    const result = {
      outcome,
      resourceDeltas: {},
      gainedInstanceIds: [],
      brokenInstanceIds: [],
      lostInstanceIds: [],
      consumedInstanceIds: [],
      selectedInstanceId: null,
      selectedCondition: null,
      targetInstanceId: null,
    };

    try {
      world.stageEvent(eventId, 17);
      await world.revealEvent(eventId);
      await world.playEventChoice(eventId, choice);
      await (world as unknown as {
        playEventSceneItemUse(
          activeEventId: string,
          choiceId: string,
          instanceId: ItemInstanceId,
        ): Promise<boolean>;
      }).playEventSceneItemUse(eventId, choice.choiceId, 'bucket-1');
      (world as unknown as {
        eventItemAimTarget(activeEventId: string): Object3D | null;
      }).eventItemAimTarget(eventId);
      world.projectEventInteractionBounds(eventId, 800, 600);
      world.projectEventResultBounds(eventId, 800, 600);
      await world.reactToEventOutcome(
        eventId,
        outcome,
        choice,
        family === 'dedicated' ? result : undefined,
      );
      world.update(1, 0.1);
      world.setDocumentHidden(true);
      world.clearEvent();

      expect(create).toHaveBeenCalledWith(eventId, expect.any(Object));
      expect(adapter.stage).toHaveBeenCalledOnce();
      expect(adapter.reveal).toHaveBeenCalledOnce();
      expect(adapter.playChoice).toHaveBeenCalledOnce();
      expect(adapter.playItemUse).toHaveBeenCalledOnce();
      expect(adapter.itemAimTarget).toHaveBeenCalledOnce();
      expect(adapter.interactionRoot).toHaveBeenCalledOnce();
      expect(adapter.resultRoot).toHaveBeenCalledOnce();
      expect(adapter.react).toHaveBeenCalledOnce();
      expect(adapter.update).toHaveBeenCalledOnce();
      expect(adapter.settleForVisibilityChange).toHaveBeenCalledOnce();
      expect(adapter.clear).toHaveBeenCalledOnce();
    } finally {
      world.dispose();
      create.mockRestore();
      propModels.dispose();
    }
    expect(adapter.clear).toHaveBeenCalledOnce();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it('clears the rescue callback when adapter detachment fails after deactivation', () => {
    const propModels = createTestPropModels();
    const focused = focusedPresenterTestDouble('other-people');
    const presenter = Object.assign(focused.presenter, { setRescueCue: vi.fn() });
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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
    expect(() => world.detach(adapter)).toThrow(detachError);
    expect(internals.activeRescueCueCallback).toBeNull();

    remove.mockRestore();
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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

  it('registers the five authored focused event presenters', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('chest-attack');
    expect(world.scene.getObjectByName('event-prop:chest-attack')?.visible)
      .toBe(false);
    expect(world.scene.getObjectByName('focused-event:chest-attack')?.visible)
      .toBe(true);

    world.stageEvent('midnight-tour');
    expect(world.scene.getObjectByName('event-prop:midnight-tour')?.visible)
      .toBe(false);
    expect(world.scene.getObjectByName('focused-event:midnight-tour')?.visible)
      .toBe(true);

    world.stageEvent('night-trader');
    expect(world.scene.getObjectByName('event-prop:night-trader'))
      .toBeUndefined();
    expect(world.scene.getObjectByName('focused-event:night-trader')?.visible)
      .toBe(true);

    world.stageEvent('handyman');
    expect(world.scene.getObjectByName('event-prop:handyman')).toBeUndefined();
    expect(world.scene.getObjectByName('focused-event:handyman')?.visible)
      .toBe(true);

    world.stageEvent('other-people');
    expect(world.scene.getObjectByName('event-prop:other-people'))
      .toBeUndefined();
    expect(
      world.scene.getObjectByName('focused-event:other-people')?.visible,
    ).toBe(true);
    const ship = world.scene.getObjectByName(
      'other-people-ship',
    )!;
    const heldPosition = ship.position.clone();
    world.update(2, 1 / 60);
    expect(
      world.scene.getObjectByName('focused-event:other-people')?.visible,
    ).toBe(true);
    expect(ship.position.distanceTo(heldPosition)).toBeGreaterThan(0);

    world.dispose();
    propModels.dispose();
  });

  it('stages the procedural Handyman palm facing the player with bounded idle motion', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('handyman');
    const palm = world.scene.getObjectByName('handyman-palm')!;
    const baseQuaternion = palm.quaternion.clone();
    expect(palm.userData.facesPlayer).toBe(true);
    expect(palm.userData.outsideHull).toBe(true);
    expect(palm.scale.x).toBeGreaterThan(1.25);
    expect(world.scene.getObjectByName('handyman-fingertips')).toBeUndefined();
    expect(world.scene.getObjectByName('handyman-joint-drain')).toBeUndefined();

    const reveal = world.revealEvent('handyman');
    world.update(1.5, 1.5);
    await reveal;
    world.scene.updateMatrixWorld(true);
    const palmSurface = world.scene.getObjectByName(
      'handyman-procedural-palm',
    )!;
    const faceNormal = new Vector3(0, 1, 0)
      .transformDirection(palmSurface.matrixWorld);
    const toPlayer = camera.getWorldPosition(new Vector3())
      .sub(palmSurface.getWorldPosition(new Vector3()))
      .normalize();
    expect(faceNormal.dot(toPlayer)).toBeGreaterThan(0.99);
    expect(palm.quaternion.angleTo(baseQuaternion)).toBeGreaterThan(0);
    expect(palm.userData.idleMotion).toBe('restrained');
    expect(Math.abs(palm.userData.wristDrift as number)).toBeLessThan(0.04);
    expect(palm.userData.fingerBend).toBeGreaterThan(0);
    expect(palm.userData.fingerBend).toBeLessThan(0.12);

    world.clearEvent();
    expect(palm.quaternion.angleTo(baseQuaternion)).toBeCloseTo(0);
    expect(palm.userData.wristDrift).toBe(0);
    expect(palm.userData.fingerTension).toBe(0);
    expect(palm.userData.fingerBend).toBe(0);

    world.dispose();
    propModels.dispose();
  });

  it('stages the imported Handyman palm face toward the player', async () => {
    const propModels = createTestPropModels();
    const createEventModel = propModels.createEventModel.bind(propModels);
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => (
      id === 'riggedHand'
        ? { root: testRiggedHand(), animations: [] }
        : createEventModel(id)
    ));
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    world.stageEvent('handyman');
    const reveal = world.revealEvent('handyman');
    world.update(1.5, 1.5);
    await reveal;
    world.scene.updateMatrixWorld(true);
    const palm = world.scene.getObjectByName('handyman-palm')!;
    const palmSurface = world.scene.getObjectByName(
      'handyman-imported-palm-surface',
    )!;
    const faceNormal = new Vector3(0, 1, 0)
      .transformDirection(palmSurface.matrixWorld);
    const toPlayer = camera.getWorldPosition(new Vector3())
      .sub(palmSurface.getWorldPosition(new Vector3()))
      .normalize();

    expect(palm.userData.modelKind).toBe('imported');
    expect(faceNormal.dot(toPlayer)).toBeGreaterThan(0.99);
    world.dispose();
    propModels.dispose();
  });

  it('stages Midnight Tour deep in the water on deterministic distant sides', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('midnight-tour', 8);
    const leftReveal = world.revealEvent('midnight-tour');
    world.setDocumentHidden(true);
    await leftReveal;
    world.setDocumentHidden(false);
    const leftIsland = world.scene.getObjectByName('midnight-tour-island')!;
    const leftX = leftIsland.position.x;
    const leftY = leftIsland.position.y;
    const leftZ = leftIsland.position.z;
    world.clearEvent();
    world.stageEvent('midnight-tour', 9);
    const rightX = world.scene.getObjectByName('midnight-tour-island')!.position.x;

    expect(leftX).toBeLessThan(0);
    expect(rightX).toBeGreaterThan(0);
    expect(Math.abs(leftX)).toBeGreaterThan(11);
    expect(Math.abs(rightX)).toBeGreaterThan(11);
    expect(leftY).toBeLessThan(-5.5);
    expect(leftZ).toBeLessThanOrEqual(-27);
    expect(leftIsland.userData.greenTopWaveClearance).toBeCloseTo(0.18);
    expect(leftIsland.userData.disableHoverOutline).not.toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('runs and restores the Midnight Tour attack cutscene on each seeded side', async () => {
    const propModels = createTestPropModels();
    const createEventModel = propModels.createEventModel.bind(propModels);
    const track = new QuaternionKeyframeTrack(
      '.quaternion',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    );
    const run = new AnimationClip('CharacterArmature|Run', 1, [track]);
    const attack = new AnimationClip(
      'CharacterArmature|Run_Attack',
      1,
      [track.clone()],
    );
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => {
      const selected = createEventModel(id);
      return id === 'midnightMonster' && selected !== null
        ? { root: selected.root, animations: [run, attack] }
        : selected;
    });
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
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
      for (let frame = 1; frame <= 28; frame += 1) {
        world.update(frame * 0.4, 0.4);
      }
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

  it('stages the Night Trader and lit lantern on the rowboat floor before reveal', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('night-trader');

    expect(world.scene.getObjectByName('night-trader-rowboat')?.visible).toBe(true);
    expect(world.scene.getObjectByName('night-trader-oar-left')).toBeUndefined();
    expect(world.scene.getObjectByName('night-trader-oar-right')).toBeUndefined();
    const trader = world.scene.getObjectByName('night-trader-trader')!;
    expect(trader.visible).toBe(true);
    expect(trader.position.y).toBeCloseTo(-0.24);
    expect(trader.userData.animationMode).toBe('none');
    expect(trader.getObjectByName('event-model:traderOctopus')).toBeDefined();
    world.scene.updateMatrixWorld(true);
    const traderDirection = trader.getWorldDirection(new Vector3());
    const directionToPlayer = trader.getWorldPosition(new Vector3())
      .multiplyScalar(-1)
      .setY(0)
      .normalize();
    traderDirection.setY(0).normalize();
    expect(traderDirection.dot(directionToPlayer)).toBeGreaterThan(0.99);
    const lantern = world.scene.getObjectByName('night-trader-lantern')!;
    expect(lantern.visible).toBe(true);
    expect(lantern.position.y).toBeCloseTo(-0.24);
    expect(lantern.getObjectByName('night-trader-lantern-model')).toBeDefined();
    expect(world.scene.getObjectByName('night-trader-lantern-reflection')?.visible)
      .toBe(true);
    expect((world.scene.getObjectByName('night-trader-lantern-light') as PointLight).intensity)
      .toBeCloseTo(5.2);
    expect(world.scene.getObjectByName('night-trader-case')).toBeUndefined();

    world.dispose();
    propModels.dispose();
  });

  it.each([
    [8, 'left', -1],
    [9, 'right', 1],
  ] as const)('stages the Night Trader on the %s seed side with Carlitos opposite', (
    variantSeed,
    side,
    direction,
  ) => {
    const carlitos = savedItem('carlitos');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [carlitos],
    );
    world.syncInventory(snapshot([], {
      seed: 3,
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    }));

    world.stageEvent('night-trader', variantSeed);
    const trader = world.scene.getObjectByName('focused-event:night-trader')!;
    const vessel = world.scene.getObjectByName('night-trader-vessel')!;
    const companion = world.scene.getObjectByName('carlitos-companion')!;
    expect(trader.userData.eventSide).toBe(side);
    expect(Math.sign(vessel.position.x)).toBe(direction);
    expect(Math.sign(companion.position.x)).toBe(-direction);

    world.clearEvent();
    expect(Math.sign(companion.position.x)).toBe(1);
    world.dispose();
    propModels.dispose();
  });

  it('seats Carlitos opposite each side-controlled event', async () => {
    const carlitos = savedItem('carlitos');
    const propModels = createTestPropModels();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel',
      'mysteryChest',
      'driftingBottle',
    ]);
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [carlitos],
      undefined,
      undefined,
      'low',
      featuredModels,
      eventModels,
    );
    world.syncInventory(snapshot([], {
      seed: 3,
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    }));
    const companion = world.scene.getObjectByName('carlitos-companion')!;
    const cases = [
      ['drifting-barrel', 8, 1],
      ['drifting-chest', 8, 1],
      ['drifting-bottle', 8, 1],
      ['drifting-bottle', 9, -1],
      ['man-in-the-fog', 8, 1],
      ['man-in-the-fog', 9, -1],
      ['tornado', 8, -1],
      ['school-of-fish', 8, -1],
      ['midnight-tour', 8, 1],
      ['midnight-tour', 9, -1],
      ['eerie-melody', 8, 1],
      ['other-people', 8, 1],
    ] as const;

    for (const [eventId, variantSeed, expectedSide] of cases) {
      world.stageEvent(eventId, variantSeed);
      expect(Math.sign(companion.position.x), eventId).toBe(expectedSide);
      world.clearEvent();
      expect(Math.sign(companion.position.x), `${eventId} cleared`).toBe(1);
    }

    world.dispose();
    eventModels.dispose();
    featuredModels.dispose();
    propModels.dispose();
  });

  it('keeps Other People on a slow cruise at triple distance', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('other-people');
    const ship = world.scene.getObjectByName('other-people-ship')!;
    expect(ship.visible).toBe(true);
    expect(Math.hypot(ship.position.x, ship.position.z)).toBeCloseTo(
      Math.hypot(8.5, 48) * 3,
    );
    expect(ship.position.z).toBeLessThan(-140);
    const start = ship.position.clone();
    world.update(4, 4);
    expect(ship.position.distanceTo(start)).toBeGreaterThan(0);
    expect(ship.position.distanceTo(start)).toBeLessThan(4);

    world.dispose();
    propModels.dispose();
  });

  it('plays Other People Sleep as letting the boat pass', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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

  it('flies one paper sheet left to right during the Windy Night cue', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    world.stageEvent('windy-night');
    const paper = world.scene.getObjectByName('weather-windy-paper')!;
    const reveal = world.revealEvent('windy-night');
    world.update(0.7, 0.7);
    const leftX = paper.position.x;
    expect(paper.visible).toBe(true);
    world.update(2.2, 1.5);
    expect(paper.position.x).toBeGreaterThan(leftX);
    world.update(3.6, 1.4);
    await reveal;
    expect(paper.visible).toBe(false);

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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      { 'chest-attack': () => active.presenter },
    );
    const choice = {
      choiceId: 'fishingNet',
      instanceId: 'fishingNet-1' as ItemInstanceId,
      condition: 'usable' as const,
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
      createTestMoonTexture(),
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

  it('keeps the boat and camera stationary during Handyman Touch', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const basePosition = camera.position.toArray();
    const baseQuaternion = camera.quaternion.toArray();
    world.stageEvent('handyman');
    const choice = world.playEventChoice('handyman', {
      choiceId: 'touch',
      instanceId: null,
      condition: null,
    });
    world.update(1, 1);
    await choice;
    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion);

    const reaction = world.reactToEventOutcome('handyman', {
      accepted: true,
      code: 'event-resolved',
      message: 'The hand closes around the camera.',
      deltas: {},
      cue: 'none',
      eventResult: {
        eventId: 'handyman',
        choiceId: 'touch',
        resultId: 'handyman-touch',
      },
    }, {
      choiceId: 'touch',
      instanceId: null,
      condition: null,
    });
    world.update(2, 2);
    await reaction;
    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(
      world.scene.getObjectByName('focused-event:handyman')?.userData.state,
    ).toBe('held-touch');

    world.update(3, 1 / 60);
    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion);

    world.clearEvent();
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
    world.dispose();
    propModels.dispose();
  });

  it('turns the seated camera 180 degrees and returns it forward', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
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

  it('shows the Handyman chest reward at half scale', async () => {
    const anchor = savedItem('anchor');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [anchor],
    );
    world.syncInventory(snapshot([anchor]));
    world.stageEvent('handyman');
    const choice = world.playEventChoice('handyman', {
      choiceId: 'anchor',
      instanceId: anchor.instanceId,
      condition: 'usable',
    });
    world.update(1.2, 1.2);
    await choice;

    const reaction = world.reactToEventOutcome('handyman', {
      accepted: true,
      code: 'event-resolved',
      message: 'The handyman gives you a chest.',
      deltas: {},
      cue: 'none',
      eventResult: {
        eventId: 'handyman',
        choiceId: 'anchor',
        resultId: 'handyman-reward',
      },
    }, {
      choiceId: 'anchor',
      instanceId: anchor.instanceId,
      condition: 'usable',
    });
    const chestReward = world.scene.getObjectByName('handyman-reward-chest')!;
    expect(chestReward.scale.toArray()).toEqual([
      0.78 * CHEST_DISPLAY_SCALE,
      0.78 * CHEST_DISPLAY_SCALE,
      0.78 * CHEST_DISPLAY_SCALE,
    ]);

    world.update(2.4, 2.4);
    await reaction;
    world.dispose();
    propModels.dispose();
  });

  it('restores Handyman supply and chest trade actors on clear', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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

  it('routes Midnight Tour presentation cues to the event cue handler', () => {
    const propModels = createTestPropModels();
    const emitCue = vi.fn();
    let dependencies: FocusedEventPresentationDependencies | null = null;
    const tour = focusedPresenterTestDouble('midnight-tour');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      {
        'midnight-tour': (value) => {
          dependencies = value;
          return tour.presenter;
        },
      },
    );

    world.setEventCueHandler(emitCue);
    world.stageEvent('midnight-tour');
    dependencies!.emitCue({ eventId: 'midnight-tour', cue: 'attack' });

    expect(emitCue).toHaveBeenCalledExactlyOnceWith({
      eventId: 'midnight-tour', cue: 'attack',
    });

    world.dispose();
    dependencies!.emitCue({ eventId: 'midnight-tour', cue: 'attack' });
    expect(emitCue).toHaveBeenCalledExactlyOnceWith({
      eventId: 'midnight-tour', cue: 'attack',
    });
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
    expect(createEventModel).toHaveBeenCalledTimes(FOCUSED_EVENT_IDS.length + 1);

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
      createTestMoonTexture(),
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

  it.each([
    ['drifting-barrel', 'BARREL', 'drifting-barrel:model', 1.35],
    ['drifting-chest', 'CHEST', 'drifting-chest:model', 1.55],
  ] as const)(
    'prespawns %s on the water before its event fade',
    async (eventId, label, modelName, retrieveDuration) => {
      const propModels = createTestPropModels();
      const furniture = createTestShipFurniture();
      const featuredModels = await createTestFeaturedModels([
        eventId === 'drifting-barrel' ? 'driftingBarrel' : 'mysteryChest',
      ]);
      const world = new BoatWorld(
        new PerspectiveCamera(65, 4 / 3, 0.08, 220),
        propModels,
        createTestMoonTexture(),
        [],
        undefined,
        furniture,
        'low',
        featuredModels,
      );
      const bowRest = world.scene.getObjectByName('drifting-item-bow-rest')!;

      expect(bowRest.position.toArray()).toEqual([0.72, 0.58, -2.52]);
      world.stageEvent(eventId);
      const model = world.scene.getObjectByName(modelName)!;
      expect(model.visible).toBe(true);
      if (eventId === 'drifting-chest') {
        expect(model.scale.toArray()).toEqual([
          0.82 * CHEST_DISPLAY_SCALE,
          0.82 * CHEST_DISPLAY_SCALE,
          0.82 * CHEST_DISPLAY_SCALE,
        ]);
      }
      expect(model.userData.motionSource).toBe('shared-wave-field');
      expect(model.userData.waterlineY).toBe(0);
      expect(world.scene.getObjectByName(`event-prop:${eventId}`)).toBeUndefined();

      const stagedPosition = model.position.clone();
      const stagedQuaternion = model.quaternion.clone();
      const reveal = world.revealEvent(eventId);
      await reveal;
      expect(model.position.toArray()).toEqual(stagedPosition.toArray());
      world.setPresentationWeather('waves');
      world.update(1, 0.9);
      const wave = sampleWaveField(
        DEFAULT_WAVES,
        1,
        -3,
        -4.2,
        presentationWeatherProfile('waves').waveScale,
      );
      expect(model.position.y).toBeCloseTo(0.02 + wave.height);
      expect(model.position.distanceTo(stagedPosition)).toBeGreaterThan(0.001);
      expect(model.quaternion.angleTo(stagedQuaternion)).toBeGreaterThan(0.001);
      const anchorId = `event:${eventId}`;
      const interaction = world.projectInteractionAnchors(800, 600)
        .find(({ id }) => id === anchorId);
      expect(interaction).toEqual(expect.objectContaining({
        id: anchorId,
        label,
        description: 'Floating salvage within reach.',
        eventFocusId: eventId,
        tooltip: false,
        visible: true,
      }));
      expect(interaction).not.toHaveProperty('eventChoiceId');
      expect(interaction?.hitArea?.width).toBeGreaterThanOrEqual(64);
      expect(interaction?.hitArea?.height).toBeGreaterThanOrEqual(64);

      world.setHighlightedItem(anchorId);
      expect(model.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

      const retrieve = world.retrieveDriftingItem(eventId);
      expect(world.projectInteractionAnchors(800, 600)
        .find(({ id }) => id === anchorId)).toBeUndefined();
      expect(model.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
      world.update(2, retrieveDuration);
      await retrieve;

      const recede = world.recedeDriftingItem(eventId);
      world.update(3, 0.8);
      await recede;
      expect(model.visible).toBe(false);

      world.dispose();
      featuredModels.dispose();
      furniture.dispose();
      propModels.dispose();
    },
  );

  it('does not dispose drifting barrel resources borrowed from the furniture library', () => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      furniture,
    );
    world.stageEvent('drifting-barrel');
    const barrel = world.scene.getObjectByName('drifting-barrel:model')!;
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

  it('prespawns the upright Drifting Bottle and floats it on shared waves', async () => {
    const propModels = createTestPropModels();
    const featuredModels = await createTestFeaturedModels(['driftingBottle']);
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      featuredModels,
    );

    world.stageEvent('drifting-bottle', 8);
    const left = world.scene.getObjectByName('event-prop:drifting-bottle')!;
    expect(left.visible).toBe(true);
    expect(left.position.x).toBeLessThan(-2.5);
    expect(left.userData.motionSource).toBe('shared-wave-field');
    expect(left.userData.waterlineY).toBe(0);
    expect(Math.abs(left.rotation.x)).toBeLessThan(0.25);
    expect(Math.abs(left.rotation.z)).toBeLessThan(0.25);
    const bottleModel = left.getObjectByName('event-model:driftingBottle')!;
    const modelSize = new Box3().setFromObject(bottleModel).getSize(new Vector3());
    expect(modelSize.y).toBeGreaterThan(modelSize.z * 2);
    const stagedPosition = left.position.clone();
    const stagedQuaternion = left.quaternion.clone();
    const stagedBounds = new Box3().setFromObject(bottleModel);
    expect(stagedBounds.min.y).toBeLessThan(0);
    expect(stagedBounds.max.y).toBeGreaterThan(0);
    await world.revealEvent('drifting-bottle');
    expect(left.position.toArray()).toEqual(stagedPosition.toArray());
    expect(world.projectInteractionAnchors(800, 600)).toContainEqual(
      expect.objectContaining({
        id: 'event:drifting-bottle',
        label: 'BOTTLE',
        eventFocusId: 'drifting-bottle',
        tooltip: false,
      }),
    );
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'event:drifting-bottle')).not.toHaveProperty('eventChoiceId');
    world.setPresentationWeather('waves');
    world.update(1, 1);
    const wave = sampleWaveField(
      DEFAULT_WAVES,
      1,
      -3.25,
      -4.35,
      presentationWeatherProfile('waves').waveScale,
    );
    expect(left.position.y).toBeCloseTo(0.14 + wave.height);
    expect(left.position.distanceTo(stagedPosition)).toBeGreaterThan(0.001);
    expect(left.quaternion.angleTo(stagedQuaternion)).toBeGreaterThan(0.001);
    expect(new Vector3(0, 1, 0).applyQuaternion(left.quaternion).y).toBeGreaterThan(0.96);

    world.clearEvent();
    world.stageEvent('drifting-bottle', 9);
    const right = world.scene.getObjectByName('event-prop:drifting-bottle')!;
    expect(right.position.x).toBeGreaterThan(2.5);
    expect(world.scene.getObjectByName('drifting-bottle:wake')).toBeUndefined();
    expect(world.scene.getObjectByName('drifting-bottle:bite-particles')).toBeUndefined();

    world.dispose();
    featuredModels.dispose();
    propModels.dispose();
  });

  it('keeps Drifting Bottle water particles removed through each result', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('drifting-bottle', 8);
    const reveal = world.revealEvent('drifting-bottle');
    world.update(2, 2);
    await reveal;
    expect(world.scene.getObjectByName('drifting-bottle:bite-particles')).toBeUndefined();

    const retrieve = world.reactToEventOutcome('drifting-bottle', {
      accepted: true,
      code: 'event-resolved',
      message: 'The bottle is aboard.',
      deltas: {},
      cue: 'none',
      eventPresentationKey: 'drifting-bottle.retrieve',
    });
    world.update(4, 2);
    await retrieve;
    expect(world.scene.getObjectByName('drifting-bottle:bite-particles')).toBeUndefined();

    world.stageEvent('drifting-bottle', 9);
    const secondReveal = world.revealEvent('drifting-bottle');
    world.update(6, 2);
    await secondReveal;
    const lost = world.reactToEventOutcome('drifting-bottle', {
      accepted: true,
      code: 'event-resolved',
      message: 'The bottle drifts away.',
      deltas: {},
      cue: 'none',
      eventPresentationKey: 'drifting-bottle.lost',
    });
    world.update(8, 2);
    await lost;
    expect(world.scene.getObjectByName('drifting-bottle:bite-particles')).toBeUndefined();

    world.dispose();
    propModels.dispose();
  });

  it.each([
    'drifting-barrel',
    'drifting-chest',
    'drifting-bottle',
  ] as const)('focuses and retrieves %s to its storage target', async (eventId) => {
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const featuredModels = await createTestFeaturedModels([
      'driftingBarrel',
      'mysteryChest',
      'driftingBottle',
    ]);
    const camera = new PerspectiveCamera(65, 4 / 3, 0.08, 220);
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      furniture,
      'low',
      featuredModels,
    );
    const basePosition = camera.position.clone();
    const baseQuaternion = camera.quaternion.clone();
    world.stageEvent(eventId, 8);

    const entered = world.enterDriftingItemView(eventId);
    world.update(1.2, 1.2);
    await entered;

    expect(camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
    const itemName = eventId === 'drifting-bottle'
      ? 'event-prop:drifting-bottle'
      : `${eventId}:model`;
    const item = world.scene.getObjectByName(itemName)!;
    const direction = camera.getWorldDirection(new Vector3());
    const directionToItem = item.getWorldPosition(new Vector3())
      .sub(camera.getWorldPosition(new Vector3()))
      .normalize();
    expect(direction.dot(directionToItem)).toBeGreaterThan(0.995);

    const retrieved = world.retrieveDriftingItem(eventId);
    world.update(3.2, 2);
    await retrieved;
    const target = eventId === 'drifting-chest'
      ? world.scene.getObjectByName('persistent-chest')!
      : world.scene.getObjectByName('drifting-item-bow-rest')!;
    expect(item.getWorldPosition(new Vector3()).distanceTo(
      target.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);

    const exited = world.exitDriftingItemView();
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
      createTestMoonTexture(),
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
    const featuredModels = await createTestFeaturedModels(['driftingBottle']);
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.08, 220),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      featuredModels,
    );
    world.stageEvent('drifting-bottle', 8);
    const entered = world.enterDriftingItemView('drifting-bottle');
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
      const world = new BoatWorld(camera, propModels, createTestMoonTexture());
      const basePosition = camera.position.clone();
      const eventId: DriftingItemEventId = 'drifting-bottle';
      world.stageEvent(eventId, 8);
      let settled = 0;
      const first = world.enterDriftingItemView(eventId).then(() => { settled += 1; });
      const second = world.enterDriftingItemView(eventId).then(() => { settled += 1; });

      if (interruption === 'hidden') world.setDocumentHidden(true);
      else if (interruption === 'clear') world.clearEvent();
      else world.dispose();
      await Promise.all([first, second]);
      expect(settled).toBe(2);
      if (interruption === 'hidden') {
        expect(camera.position).toEqual(expect.objectContaining(FISHING_PLAYER_SEAT));
        const exitFirst = world.exitDriftingItemView();
        const exitSecond = world.exitDriftingItemView();
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

  it('keeps the Flowers field fixed in place and removes its world interaction', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('flowers');
    const flowers = world.scene.getObjectByName('event-prop:flowers')!;
    expect(flowers.children.length).toBeGreaterThanOrEqual(28);
    const before = flowers.children.map(({ position }) => [position.x, position.z]);
    expect(flowers.children.every(({ position }) => position.z <= -4.3)).toBe(true);
    for (let left = 0; left < flowers.children.length; left += 1) {
      for (let right = left + 1; right < flowers.children.length; right += 1) {
        const a = flowers.children[left]!.position;
        const b = flowers.children[right]!.position;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.9);
      }
    }
    world.update(2, 2);
    expect(flowers.children.map(({ position }) => [position.x, position.z])).toEqual(before);
    expect(world.projectEventInteractionBounds('flowers', 800, 600)).toBeNull();

    const deckTarget = world.scene.getObjectByName('flowers-deck-target')!;
    expect(deckTarget.position.toArray()).toEqual([0.72, 0.58, 1.05]);
    const collected = world.reactToEventOutcome('flowers', {
      accepted: true,
      code: 'event-resolved',
      message: 'The flowers are collected.',
      deltas: {},
      cue: 'none',
      eventPresentationKey: 'flowers.collect',
    });
    world.update(6, 4);
    await collected;
    const firstFlower = world.scene.getObjectByName('flowers:pad:0')!;
    expect(firstFlower.getWorldPosition(new Vector3()).distanceTo(
      deckTarget.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);

    world.dispose();
    propModels.dispose();
  });

  it('keeps the Bad Sleep reveal camera and supplies stationary', async () => {
    const cameraRig = new Group();
    const camera = new PerspectiveCamera();
    const basePosition = camera.position.toArray();
    const baseQuaternion = camera.quaternion.toArray();
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
      undefined,
      camera,
    );

    const reveal = animator.reveal('bad-sleep');
    animator.update(1.7, 1.7);

    expect(camera.position.toArray()).toEqual(basePosition);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(supplies.ambientRoll).toBe(0);
    expect(supplies.ambientLift).toBe(0);

    animator.clear();
    await reveal;
    animator.dispose();
  });

  it.each(['bucket', 'flashlight', 'swimRing', 'umbrella'] as const)(
    'returns the Bad Sleep %s to its base pose',
    async (choiceId) => {
      const cameraRig = new Group();
      const supplies = new FakeBoatSupplyDisplay();
      const animator = new WeatherEventAnimator(
        cameraRig,
        supplies as unknown as BoatSupplyDisplay,
      );
      const instanceId = `${choiceId}-1` as ItemInstanceId;

      const itemUse = animator.playItemUse('bad-sleep', choiceId, instanceId);
      const duration = weatherItemUseDuration('bad-sleep', choiceId)!;
      animator.update(duration, duration);
      await itemUse;

      expect(supplies.poses.size).toBe(0);
      expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
      expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      animator.dispose();
    },
  );

  it.each([
    ['windy-night', 'umbrella', 'umbrella-1'],
    ['thunderstorm', 'anchor', 'anchor-1'],
  ] as const)(
    'uses shared item motion and keeps %s reaction ownership unchanged',
    async (eventId, choiceId, instanceId) => {
      const cameraRig = new Group();
      const camera = new PerspectiveCamera();
      const basePosition = camera.position.toArray();
      const baseQuaternion = camera.quaternion.toArray();
      const supplies = new FakeBoatSupplyDisplay();
      const animator = new WeatherEventAnimator(
        cameraRig,
        supplies as unknown as BoatSupplyDisplay,
        undefined,
        camera,
      );

      const itemUse = animator.playItemUse(eventId, choiceId, instanceId);
      animator.update(0.6, 0.6);

      expect(supplies.poses.size).toBe(0);
      expect(supplies.pinCalls).toHaveLength(0);
      expect(camera.position.toArray()).toEqual(basePosition);
      expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
      expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);

      const itemDuration = weatherItemUseDuration(eventId, choiceId)!;
      animator.update(itemDuration, itemDuration - 0.6);
      await itemUse;
      const result = animator.react(
        eventId,
        {
          accepted: true,
          code: 'event-resolved',
          message: 'The night passes.',
          deltas: { hull: -20 },
          cue: 'impact',
        },
        {
          choiceId,
          actors: [{ instanceId, condition: 'broken' }],
        },
      );
      animator.update(0.55, 0.55);

      expect(supplies.poses.size).toBe(0);
      expect(supplies.pinCalls).toHaveLength(0);
      expect(camera.position.toArray()).toEqual(basePosition);
      expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion);
      expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);

      animator.update(2, 2);
      await result;
      animator.dispose();
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

  it('keeps Thunderstorm lightning off the lost item', () => {
    const cameraRig = new Group();
    const camera = new PerspectiveCamera();
    const baseQuaternion = camera.quaternion.toArray();
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
      undefined,
      camera,
    );

    void animator.react(
      'thunderstorm',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'Lightning takes the umbrella.',
        deltas: { hull: -40 },
        cue: 'impact',
      },
      {
        choiceId: 'sleep',
        actors: [{ instanceId: 'umbrella-1', condition: 'lost' }],
      },
    );
    animator.update(0.45, 0.45);

    expect(
      animator.worldRoot.getObjectByName('weather-lightning-flash')?.visible,
    ).toBe(true);
    expect(supplies.pinCalls).toHaveLength(0);
    expect(supplies.poses.size).toBe(0);
    expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
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

  it('keeps the Shower Night camera position fixed while looking up-left and up-right', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const basePosition = cameraRig.position.toArray();
    const baseQuaternion = cameraRig.quaternion.toArray();
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();
    const baseViewDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    world.stageEvent('shower-night');

    expect(world.scene.getObjectByName('weather-event-world')).toBeDefined();
    expect(world.scene.getObjectByName('weather-event-boat')).toBeDefined();
    expect(world.scene.getObjectByName('weather-rain-bucket-splash')).toBeUndefined();
    const reveal = world.revealEvent('shower-night');
    world.update(1.55, 1.55);
    expect(await remainsPending(reveal)).toBe(true);
    expect(cameraRig.position.toArray()).toEqual(basePosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseQuaternion);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);
    const leftViewDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(leftViewDirection.y).toBeGreaterThan(baseViewDirection.y + 0.25);
    expect(leftViewDirection.x).toBeLessThan(baseViewDirection.x - 0.05);

    world.update(3.55, 2);
    expect(await remainsPending(reveal)).toBe(true);
    expect(cameraRig.position.toArray()).toEqual(basePosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseQuaternion);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);
    const rightViewDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(rightViewDirection.y).toBeGreaterThan(baseViewDirection.y + 0.25);
    expect(rightViewDirection.x).toBeGreaterThan(baseViewDirection.x + 0.05);

    world.update(5.55, 2);
    await reveal;
    expect(cameraRig.position.toArray()).toEqual(basePosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseQuaternion);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).toEqual(baseCameraQuaternion);

    world.dispose();
    propModels.dispose();
  });

  it.each([
    ['dangerous-waters', 1.2, 2.4, 'still'],
    ['windy-night', 1.2, 3.6, 'left'],
    ['thunderstorm', 2, 4, 'still'],
    ['restless-waves', 0.95, 3.8, 'left'],
    ['man-in-the-fog', 2.6, 5.2, 'still'],
    ['ghosts', 3.2, 6.4, 'still'],
    ['eerie-melody', 2.2, 4.4, 'still'],
    ['other-people', 1.7, 3.4, 'still'],
  ] as const)(
    'keeps the %s reveal camera position fixed with its authored view',
    async (eventId, sampleTime, duration, direction) => {
      const propModels = createTestPropModels();
      const camera = new PerspectiveCamera();
      const world = new BoatWorld(camera, propModels, createTestMoonTexture());
      const basePosition = camera.position.toArray();
      const baseQuaternion = camera.quaternion.toArray();
      const baseDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

      world.stageEvent(eventId);
      const reveal = world.revealEvent(eventId);
      world.update(sampleTime, sampleTime);

      expect(camera.position.toArray()).toEqual(basePosition);
      if (direction === 'still') {
        expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
      } else {
        expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion);
      }
      const cueAngle = camera.quaternion.angleTo(
        new Quaternion().fromArray(baseQuaternion),
      );
      for (const rigName of [
        'boat-cue-camera-rig',
        'boat-featured-event-camera-rig',
        'dedicated-event-camera-effects',
        'boat-camera-rig',
      ]) {
        const rig = world.scene.getObjectByName(rigName)!;
        expect(rig.position.toArray()).toEqual([0, 0, 0]);
        expect(rig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      }
      const viewDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      if (direction === 'still') {
        expect(viewDirection.toArray()).toEqual(baseDirection.toArray());
      } else if (direction === 'left') {
        expect(viewDirection.x).toBeLessThan(baseDirection.x - 0.02);
      }

      const returnTime = duration * 0.94;
      world.update(returnTime, returnTime - sampleTime);
      const returnAngle = camera.quaternion.angleTo(
        new Quaternion().fromArray(baseQuaternion),
      );
      if (direction === 'still') expect(returnAngle).toBe(0);
      else expect(returnAngle).toBeLessThan(cueAngle);

      world.update(duration + 1, duration + 1 - returnTime);
      await reveal;
      expect(camera.position.toArray()).toEqual(basePosition);
      expect(camera.quaternion.toArray()).toEqual(baseQuaternion);
      world.dispose();
      propModels.dispose();
    },
  );

  it('looks left and right without vertical motion during Restless Waves', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(camera, propModels, createTestMoonTexture());
    const baseDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    world.stageEvent('restless-waves');
    const reveal = world.revealEvent('restless-waves');
    world.update(0.95, 0.95);
    const leftDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(leftDirection.x).toBeLessThan(baseDirection.x);
    expect(leftDirection.y).toBeCloseTo(baseDirection.y);

    world.update(2.85, 1.9);
    const rightDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(rightDirection.x).toBeGreaterThan(baseDirection.x);
    expect(rightDirection.y).toBeCloseTo(baseDirection.y);

    world.update(3.8, 0.95);
    await reveal;
    world.dispose();
    propModels.dispose();
  });

  it('turns down into the stern for Check the Back and keeps the fish inside', async () => {
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
    const world = new BoatWorld(camera, propModels, createTestMoonTexture());
    const expectInsideStern = (): void => {
      const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      expect(direction.z).toBeGreaterThan(0.6);
      expect(direction.y).toBeLessThan(-0.5);
    };

    world.stageEvent('check-the-back');
    expect(world.scene.getObjectByName('check-back:wake')).toBeUndefined();
    expect(world.projectEventInteractionBounds('check-the-back', 800, 600)).toBeNull();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'event:check-the-back')).toBeUndefined();
    const reveal = world.revealEvent('check-the-back');
    world.update(2, 2);
    await reveal;
    expectInsideStern();
    expect(world.scene.getObjectByName('check-back:fish')?.visible).toBe(false);

    const fish = world.reactToEventOutcome('check-the-back', {
      accepted: true,
      code: 'event-resolved',
      message: 'A fish has landed aboard.',
      deltas: { food: 1 },
      cue: 'none',
      eventPresentationKey: 'check-the-back.fish',
    });
    world.update(4, 2);
    await fish;
    const fishModel = world.scene.getObjectByName('check-back:fish')!;
    const sternFloor = world.scene.getObjectByName('check-back-stern-floor')!;
    expect(fishModel.visible).toBe(true);
    expect(fishModel.getWorldPosition(new Vector3()).distanceTo(
      sternFloor.getWorldPosition(new Vector3()),
    )).toBeLessThan(0.001);
    expectInsideStern();

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
    expectInsideStern();

    world.dispose();
    propModels.dispose();
  });

  it('keeps Shower Night item and reaction camera poses stationary', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    const bucketGroup = world.scene.getObjectByName('boat-supply:bucket')!;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const baseCameraPosition = cameraRig.position.toArray();
    const baseCameraQuaternion = cameraRig.quaternion.toArray();

    const showerUse = world.playEventItemUse(
      'shower-night',
      'bucket',
      bucket.instanceId,
    );
    const animatedBucket = world.scene.getObjectByName(
      `boat-supply-event:${bucket.instanceId}`,
    )!;
    const bucketStorage = boatSupplyTransform('bucket', 0);
    expect(animatedBucket.position.toArray())
      .toEqual(bucketStorage.position.toArray());
    world.update(0.66, 0.66);
    expect(await remainsPending(showerUse)).toBe(true);
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.position.toArray()).toEqual(baseCameraPosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseCameraQuaternion);
    const showerDuration = Math.max(
      weatherItemUseDuration('shower-night', 'bucket')!,
      eventItemUseDuration('bucket-scoop'),
    );
    world.update(showerDuration, showerDuration - 0.66);
    await showerUse;
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);

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
    world.update(2.5, 0.5);
    expect(await remainsPending(reaction)).toBe(true);
    expect(cameraRig.position.toArray()).toEqual(baseCameraPosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseCameraQuaternion);
    world.update(4, 2);
    await reaction;

    const fallback = world.playEventItemUse(
      'strange-noise',
      'bucket',
      bucket.instanceId,
    );
    await Promise.resolve();
    world.update(3, GENERIC_EVENT_ITEM_USE_DURATION);
    await fallback;
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);

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
      createTestMoonTexture(),
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

  it('borrows the boat rig for a severe Dangerous Waters impact', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    world.stageEvent('dangerous-waters');
    const rocks = world.scene.getObjectByName('dangerous-waters-passage')!.children
      .filter(({ name }) => name.startsWith('dangerous-waters-rock:'));
    expect(rocks).toHaveLength(42);
    world.scene.updateMatrixWorld(true);
    const rockMatrices = rocks.map(({ matrixWorld }) => matrixWorld.toArray());
    const supplyRoot = world.scene.getObjectByName('boat-supply:bucket')!;
    const baseSupplyRotation = supplyRoot.rotation.clone();
    const reaction = world.reactToEventOutcome('dangerous-waters', {
      accepted: true,
      code: 'event-resolved',
      message: 'The boat strikes the rocks.',
      deltas: { hull: -25 },
      cue: 'impact',
    });

    world.update(0.45, 0.45);
    world.scene.updateMatrixWorld(true);
    rocks.forEach(({ matrixWorld }, index) => {
      expect(matrixWorld.toArray()).toEqual(rockMatrices[index]);
    });
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const fragments = world.scene.getObjectByName('dangerous-waters-fragments')!;
    expect(motionRig.rotation.x).toBeGreaterThan(0.1);
    expect(supplyRoot.rotation.toArray().slice(0, 3)).not.toEqual(
      baseSupplyRotation.toArray().slice(0, 3),
    );
    expect(fragments.children.filter(({ visible }) => visible)).toHaveLength(8);

    world.update(0.9, 0.45);
    await reaction;
    world.scene.updateMatrixWorld(true);
    rocks.forEach(({ matrixWorld }, index) => {
      expect(matrixWorld.toArray()).toEqual(rockMatrices[index]);
    });
    expect(Math.abs(motionRig.rotation.z)).toBeGreaterThan(0.005);

    world.clearEvent();
    expect(supplyRoot.rotation.x).toBeCloseTo(baseSupplyRotation.x);
    expect(supplyRoot.rotation.y).toBeCloseTo(baseSupplyRotation.y);
    expect(supplyRoot.rotation.z).toBeCloseTo(baseSupplyRotation.z);
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
    ['swarm-of-anglerfish', 'flashlight', 'flashlight'],
    ['swarm-of-anglerfish', 'baitTin', 'baitTin'],
    ['tornado', 'swimRing', 'swimRing'],
  ] as const)(
    'settles the %s %s item action after elapsed time and across visibility',
    async (eventId, choiceId, itemType) => {
      const item = savedItem(itemType);
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        createTestMoonTexture(),
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
        : eventId === 'swarm-of-anglerfish'
          ? SWARM_ITEM_DURATION
          : TORNADO_ITEM_DURATION;
      const context = eventId === 'tornado'
        ? 'throw-target'
        : 'flashlight-flash';
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
      createTestMoonTexture(),
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
      ['bucket-cover', 'eerie-melody', 'bucket', 'bucket', supernaturalItemUseDuration('eerie-melody', 'bucket')!],
      ['flare-target', 'ghosts', 'flareGun', 'flareGun', supernaturalItemUseDuration('ghosts', 'flareGun')!],
      ['flare-sky', 'other-people', 'flareGun', 'flareGun', eventItemUseDuration('flare-sky')],
      ['anchor-drop', 'tornado', 'anchor', 'anchor', TORNADO_ITEM_DURATION],
      ['umbrella-overhead', 'shower-night', 'umbrella', 'umbrella', weatherItemUseDuration('shower-night', 'umbrella')!],
      ['umbrella-shield', 'death-stare', 'umbrella', 'umbrella', DEATH_STARE_ITEM_DURATION],
      ['flashlight-flash', 'flowers', 'flashlight', 'flashlight', eventItemUseDuration('flashlight-flash')],
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
      createTestMoonTexture(),
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

  it('fires the shotgun action callback at the keyed shot frame', async () => {
    const shotgun = savedItem('shotgun');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [shotgun],
    );
    world.syncInventory(snapshot([shotgun]));
    const onAction = vi.fn();
    const duration = eventItemUseDuration('shotgun-fire');
    const use = world.playEventItemUse(
      'flowers',
      'shotgun',
      shotgun.instanceId,
      onAction,
    );

    world.update(duration * 0.45, duration * 0.45);
    expect(onAction).not.toHaveBeenCalled();
    world.update(duration * 0.47, duration * 0.02);
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(0);
    world.update(duration + 1, duration);
    await use;
    expect(onAction).toHaveBeenCalledOnce();

    world.dispose();
    propModels.dispose();
  });

  it('settles a shared item to a readable restored pose when hidden', async () => {
    const item = savedItem('spyglass');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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

  it.each([
    ['cannedFood', 'food'],
    ['baitTin', 'bait'],
    ['medicalKit', 'medicalKit'],
    ['energyBar', 'energyBar'],
    ['swimRing', 'swimRing'],
  ] as const)(
    'routes generic %s item use through the shared throw-target adapter',
    async (itemId, choiceId) => {
      const item = savedItem(itemId);
      const inventory = snapshot([item], itemId === 'cannedFood'
        ? { food: 1 }
        : itemId === 'baitTin'
          ? { bait: 1 }
          : {});
      const propModels = createTestPropModels();
      const supplyItem = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
      const world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        createTestMoonTexture(),
        [item],
      );
      world.syncInventory(inventory);
      world.stageEvent('flowers');

      const use = world.playEventItemUse('flowers', choiceId, item.instanceId);
      const animatedItem = world.scene.getObjectByName(
        `boat-supply-event:${item.instanceId}`,
      )!;
      expect(animatedItem.position.toArray())
        .toEqual(boatSupplyTransform(itemId, 0).position.toArray());
      const active = (world as unknown as {
        itemUseController: { held: { request: { context: string } } | null };
      }).itemUseController.held;

      expect(active?.request.context).toBe('throw-target');
      expect(supplyItem).not.toHaveBeenCalled();

      const duration = eventItemUseDurationForItem('throw-target', itemId);
      world.update(duration, duration);
      await use;
      world.dispose();
      supplyItem.mockRestore();
      propModels.dispose();
    },
  );

  it.each([
    ['scubaSet'],
    ['bottledPaper'],
  ] as const)('does not animate day-action-only item %s for events', async (itemId) => {
    const item = savedItem(itemId);
    const propModels = createTestPropModels();
    const supplyItem = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
    const controllerPlay = vi.spyOn(EventItemUseController.prototype, 'play');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [item],
    );

    await world.playEventItemUse('flowers', itemId, item.instanceId);

    expect(controllerPlay).not.toHaveBeenCalled();
    expect(supplyItem).not.toHaveBeenCalled();
    world.dispose();
    controllerPlay.mockRestore();
    supplyItem.mockRestore();
    propModels.dispose();
  });

  it('routes every catalog item choice into shared ownership exactly once', async () => {
    const itemIds = [...new Set(SURVIVAL_EVENTS.flatMap(({ choices }) => (
      choices.flatMap(({ itemId }) => itemId === undefined ? [] : [itemId])
    )))];
    const items = itemIds.map((itemId) => savedItem(itemId));
    const itemById = new Map(items.map((item) => [item.type, item]));
    const propModels = createTestPropModels();
    const controllerPlay = vi.spyOn(EventItemUseController.prototype, 'play');
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const begin = vi.spyOn(EventItemUseAdapter.prototype, 'begin');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      items,
    );
    world.syncInventory(snapshot(items, { food: 99, bait: 99 }));

    for (const event of SURVIVAL_EVENTS) {
      for (const choice of event.choices) {
        if (choice.itemId === undefined) continue;
        const item = itemById.get(choice.itemId)!;
        world.stageEvent(event.id);
        const playCount = controllerPlay.mock.calls.length;
        const borrowCount = borrowActor.mock.calls.length;
        const beginCount = begin.mock.calls.length;
        const use = world.playEventItemUse(
          event.id,
          choice.id,
          item.instanceId,
        );

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
    begin.mockRestore();
    borrowActor.mockRestore();
    controllerPlay.mockRestore();
    propModels.dispose();
  });

  it('routes the Flowers Bucket through the neutral shared context', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const supplyItem = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    world.stageEvent('flowers');

    const use = world.playEventItemUse('flowers', 'bucket', bucket.instanceId);
    const active = (world as unknown as {
      itemUseController: { held: { request: { context: string } } | null };
    }).itemUseController.held;

    expect(active?.request.context).toBe('base');
    expect(supplyItem).not.toHaveBeenCalled();
    const duration = eventItemUseDuration('base');
    world.update(duration, duration);
    await use;
    const actor = borrowActor.mock.results[0]!.value as BorrowedSupplyActor;
    const release = vi.spyOn(actor, 'release');
    expect(actor.root.parent).not.toBeNull();

    const choice = world.playEventChoice('flowers', {
      choiceId: 'bucket',
      instanceId: bucket.instanceId,
      condition: 'usable',
    });
    world.update(4, 4);
    await choice;
    expect(actor.root.parent).not.toBeNull();
    expect(release).not.toHaveBeenCalled();

    const outcome = {
      accepted: true,
      code: 'event-resolved' as const,
      message: 'The flowers are collected.',
      deltas: {},
      cue: 'none' as const,
    };
    const reaction = world.reactToEventOutcome(
      'flowers',
      outcome,
      {
        choiceId: 'bucket',
        actors: [{ instanceId: bucket.instanceId, condition: 'usable' }],
      },
      {
        outcome,
        resourceDeltas: {},
        gainedInstanceIds: [],
        brokenInstanceIds: [],
        lostInstanceIds: [],
        consumedInstanceIds: [],
        selectedInstanceId: bucket.instanceId,
        selectedCondition: 'usable',
        targetInstanceId: null,
      },
    );
    world.update(8, 4);
    await reaction;
    expect(release).toHaveBeenCalledOnce();
    expect(actor.root.parent).toBeNull();

    world.dispose();
    borrowActor.mockRestore();
    supplyItem.mockRestore();
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
      createTestMoonTexture(),
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
        createTestMoonTexture(),
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
    ['held', eventItemUseDuration('flashlight-flash')],
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
        createTestMoonTexture(),
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
        world.update(eventItemUseDuration('flashlight-flash'), eventItemUseDuration('flashlight-flash'));
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
      createTestMoonTexture(),
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
    const useDuration = eventItemUseDuration('flashlight-flash');
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
    const useDuration = eventItemUseDuration('flashlight-flash');
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
        createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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

  it('keeps Restless Waves buoyancy and ocean rendering on one wave scale', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const profile = presentationWeatherProfile('waves');

    try {
      world.stageEvent('restless-waves');
      world.setPresentationWeather('waves');
      world.update(1.4, 1.4);

      expect(buoyancySample.mock.calls.at(-1)?.[4]).toBe(profile.waveScale);
      expect(oceanUpdate.mock.calls.at(-1)?.[1]).toBe(profile.waveScale);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps the Eerie Melody island fixed while boat and ocean use the calm wave scale', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const time = 2.35;
    const delta = 2.35;
    const profile = presentationWeatherProfile('calm');
    const expectedBoat = expectedSurvivalPose(time, delta, profile.waveScale);
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;

    world.stageEvent('eerie-melody');
    const tableau = world.scene.getObjectByName('siren-tableau')!;
    const tableauPosition = tableau.position.clone();
    world.setPresentationWeather('calm');
    world.update(time, delta);

    expect(motionRig.position.y).toBeCloseTo(0.22 + expectedBoat.y);
    expect(tableau.position.toArray()).toEqual(tableauPosition.toArray());
    expect(tableau.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(tableau.userData.followsWaves).toBe(false);
    expect(ocean.material.uniforms.uAmplitudeScale?.value).toBe(profile.waveScale);

    world.dispose();
    propModels.dispose();
  });

  it('stages the loaded fog man and hides it when the event clears', () => {
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
      createTestMoonTexture(),
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
    expect(world.scene.getObjectByName('fog-man-silhouette')).toBeDefined();

    world.clearEvent();
    expect(world.scene.getObjectByName('fog-man-silhouette')?.visible).toBe(false);

    world.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeSilhouetteMaterial).toHaveBeenCalledOnce();
    expect(disposeImportedMaterial).toHaveBeenCalledOnce();
    propModels.dispose();
  });

  it('places the Fog Man midpoint at the waterline', () => {
    const propModels = createTestPropModels();
    const fogMan = new Group();
    fogMan.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
    const eventModels = createTestEventModels();
    vi.mocked(eventModels.create).mockImplementation((id: string) => (
      id === 'fogMan' ? fogMan : new Group()
    ));
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent('man-in-the-fog');
    const man = world.scene.getObjectByName('event-tableau:man-in-the-fog')!;
    expect(man.userData.waterlineFraction).toBeCloseTo(0.5, 1);

    world.dispose();
    propModels.dispose();
  });

  it('loops Ghosts around the bow while they face their travel direction', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      createTestEventModels(),
    );

    world.stageEvent('ghosts');
    expect(supernaturalRevealDuration('ghosts')).toBe(6.4);
    GHOST_FLOAT_PATHS.forEach((path) => {
      expect(path.center[2] + path.radiusZ).toBeLessThan(-5);
      expect(path.radiusX).toBeGreaterThan(path.radiusZ);
      expect(path.period).toBeGreaterThanOrEqual(18);
    });
    const reveal = world.revealEvent('ghosts');
    world.update(0.25, 0.25);
    expect(world.scene.getObjectByName('ghost-1')?.visible).toBe(true);
    expect(world.scene.getObjectByName('ghost-5')?.visible).toBe(false);
    world.update(0.7, 0.45);
    expect(world.scene.getObjectByName('ghost-5')?.visible).toBe(true);
    expect(world.scene.getObjectByName('supernatural-flare-flash')?.visible).toBe(false);
    world.update(6.5, 5.8);
    await reveal;
    const ghost = world.scene.getObjectByName('ghost-1')!;
    const before = ghost.position.clone();
    world.update(6.6, 0.1);
    const travel = ghost.position.clone().sub(before).setY(0).normalize();
    const facing = new Vector3(-1, 0, 0)
      .applyQuaternion(ghost.getWorldQuaternion(new Quaternion()))
      .setY(0)
      .normalize();
    expect(ghost.visible).toBe(true);
    expect(ghost.position.distanceTo(before)).toBeGreaterThan(0.001);
    expect(facing.dot(travel)).toBeGreaterThan(0.99);
    expect(ghost.userData.modelForwardAxis).toBe('negative-x');
    expect(ghost.userData.facingPath).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('seats Eerie Melody on a clean procedural rock facing the player', async () => {
    const propModels = createTestPropModels();
    const siren = new Group();
    const sirenMaterial = new MeshStandardMaterial({ color: 0x9e5d47 });
    siren.add(new Mesh(new BoxGeometry(1, 2, 0.7), sirenMaterial));
    const eventModels = createTestEventModels();
    vi.mocked(eventModels.create).mockImplementation((id: string) => (
      id === 'siren' ? siren : new Group()
    ));
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent('eerie-melody');
    const tableau = world.scene.getObjectByName('siren-tableau')!;
    const rock = world.scene.getObjectByName('event-siren-rock')!;
    const sirenFacing = world.scene.getObjectByName('siren-facing-anchor')!;
    const fog = world.scene.getObjectByName('supernatural-sea-mist')!;
    world.scene.updateMatrixWorld(true);
    const rockBounds = new Box3().setFromObject(rock);
    const sirenBounds = new Box3().setFromObject(siren);
    expect(rockBounds.min.y).toBeLessThan(0);
    expect(rockBounds.max.y).toBeGreaterThanOrEqual(0.75);
    expect(sirenBounds.min.y).toBeLessThan(rockBounds.max.y - 0.9);
    expect(sirenBounds.max.y).toBeGreaterThan(rockBounds.max.y + 0.8);
    expect(rock.getObjectByName('event-siren-rock:mass')).toBeInstanceOf(Mesh);
    expect(rock.getObjectByName('event-siren-rock:wet-band')).toBeUndefined();
    expect(rock.getObjectByName('event-siren-rock:crack')).toBeUndefined();
    expect(eventModels.create).not.toHaveBeenCalledWith('sirenRock');
    expect(tableau.userData.waterlineY).toBe(0);
    expect(tableau.userData.followsWaves).toBe(false);
    expect(tableau.position.x).toBe(-6.3);
    expect(tableau.position.z).toBe(-14.8);
    expect(fog.children.length).toBeGreaterThanOrEqual(5);
    fog.children.forEach((layer) => {
      expect(layer.rotation.x).toBeCloseTo(0);
      expect(layer.position.y).toBeGreaterThanOrEqual(0.38);
      expect(layer.position.y).toBeLessThanOrEqual(0.55);
      const material = (layer as Mesh).material;
      expect(material).toBeInstanceOf(ShaderMaterial);
      expect((material as ShaderMaterial).depthTest).toBe(true);
    });
    const sirenWorldPosition = sirenFacing.getWorldPosition(new Vector3());
    const sirenForward = new Vector3(1, 0, 0)
      .applyQuaternion(sirenFacing.getWorldQuaternion(new Quaternion()))
      .normalize();
    const playerDirection = new Vector3(0, sirenWorldPosition.y, 0)
      .sub(sirenWorldPosition)
      .normalize();
    expect(sirenForward.dot(playerDirection)).toBeGreaterThan(0.995);
    expect(sirenFacing.userData.facesPlayer).toBe(true);
    expect(sirenFacing.userData.pose).toBe('seated');
    const tableauLights = tableau.children.filter(
      (child): child is PointLight => child instanceof PointLight,
    );
    expect(tableauLights).toHaveLength(2);
    expect(tableauLights.every((light) => light.intensity > 0)).toBe(true);
    expect((firstMesh(siren).material as MeshStandardMaterial).color.getHex())
      .toBe(0x9e5d47);
    expect((firstMesh(rock).material as MeshStandardMaterial).color.getHex())
      .toBe(0x3f4b4a);

    expect(tableau.visible).toBe(true);
    const sirenPosition = siren.position.clone();
    const sirenQuaternion = siren.quaternion.clone();
    const facingPosition = sirenFacing.position.clone();
    const facingQuaternion = sirenFacing.quaternion.clone();
    const reveal = world.revealEvent('eerie-melody');
    world.update(3.5, 3.5);
    expect(tableau.visible).toBe(true);
    expect(siren.position.toArray()).toEqual(sirenPosition.toArray());
    expect(siren.quaternion.toArray()).toEqual(sirenQuaternion.toArray());
    expect(sirenFacing.position.toArray()).toEqual(facingPosition.toArray());
    expect(sirenFacing.quaternion.toArray()).toEqual(facingQuaternion.toArray());
    world.update(4.5, 1);
    await reveal;

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
      createTestMoonTexture(),
      [flare],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.syncInventory(snapshot([flare]));

    world.stageEvent('ghosts');
    expect(world.scene.getObjectByName('ghost-1')?.visible).toBe(false);

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

  it('drops a broken Bucket during the Eerie Melody result', async () => {
    const bucket = savedItem('bucket');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [bucket],
    );
    world.syncInventory(snapshot([bucket]));
    const bucketRoot = world.scene.getObjectByName('boat-supply:bucket')!;

    world.stageEvent('eerie-melody');
    const reaction = world.reactToEventOutcome(
      'eerie-melody',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The bucket breaks.',
        deltas: { energy: -79 },
        cue: 'none',
      },
      {
        choiceId: 'bucket',
        actors: [{ instanceId: bucket.instanceId, condition: 'broken' }],
      },
    );
    world.update(0.5, 0.5);

    expect(bucketRoot.position.y).toBeLessThan(-0.2);
    expect(Math.abs(bucketRoot.rotation.z)).toBeGreaterThan(0.4);

    world.clearEvent();
    await reaction;
    world.dispose();
    propModels.dispose();
  });

  it('reveals the moon face after a normal-moon hold and clears every sky transient', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;

    expect(sky.material.fragmentShader).toContain('zigzagGrinShape');
    expect(sky.material.fragmentShader).toContain('hookedEyeMasks');
    expect(sky.material.fragmentShader).toContain('eyeSlits');
    expect(sky.material.fragmentShader).toContain('zigzagGrin');
    expect(sky.material.fragmentShader).toContain('noseCut');
    expect(sky.material.fragmentShader).toContain('stareReveal');
    expect(sky.material.fragmentShader).not.toContain('grinTeeth');

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(0.76, 0.76);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(await remainsPending(reveal)).toBe(true);

    world.update(3.7, 2.94);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBeLessThan(1);
    expect(sky.material.uniforms.uMoonScale?.value).toBeGreaterThan(1.5);

    world.update(4.3, 0.6);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBeGreaterThan(0);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBeLessThan(1);

    world.update(5.8, 1.5);
    await reveal;
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(1);
    expect(sky.material.uniforms.uMoonGrin?.value).toBeGreaterThan(0.7);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBeGreaterThan(0.15);
    expect(sky.material.uniforms.uMoonScale?.value).toBeCloseTo(4.15);
    const firstPulse = sky.material.uniforms.uMoonGrin?.value as number;
    world.update(0.7, 0.7);
    expect(sky.material.uniforms.uMoonGrin?.value).not.toBeCloseTo(firstPulse, 4);

    world.clearEvent();
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(sky.material.uniforms.uMoonGrin?.value).toBe(0);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(1);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(sky.material.uniforms.uMoonScale?.value).toBe(1);

    world.dispose();
    propModels.dispose();
  });

  it('widens the moon grin for Pressure and dims a lowered view for Energy loss', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const world = new BoatWorld(camera, propModels, createTestMoonTexture());
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(5.8, 5.8);
    await reveal;
    const baseGrin = sky.material.uniforms.uMoonGrin?.value as number;

    const pressureReaction = world.reactToEventOutcome('face-on-the-moon', {
      accepted: true,
      code: 'event-resolved',
      message: 'The grin grows.',
      deltas: { pressure: 1 },
      cue: 'none',
    });
    world.update(4.9, 1.1);
    await pressureReaction;
    expect(sky.material.uniforms.uMoonGrin?.value).toBeGreaterThan(baseGrin);
    expect(sky.material.uniforms.uMoonGrin?.value).toBeLessThanOrEqual(0.96);

    const energyReaction = world.reactToEventOutcome('face-on-the-moon', {
      accepted: true,
      code: 'event-resolved',
      message: 'You cannot keep your eyes open.',
      deltas: { energy: -80 },
      cue: 'none',
    });
    world.update(5.45, 0.55);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBeGreaterThan(0);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    world.update(6, 0.55);
    await energyReaction;

    world.setDocumentHidden(true);
    world.clearEvent();
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(cameraRig.position.y).toBe(0);
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).toEqual(baseCameraQuaternion);

    world.dispose();
    propModels.dispose();
  });

  it('snaps broken Binoculars back during the Face on the Moon result', async () => {
    const binoculars = savedItem('spyglass');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
      [binoculars],
    );
    world.syncInventory(snapshot([binoculars]));
    const binocularsRoot = world.scene.getObjectByName('boat-supply:spyglass')!;

    world.stageEvent('face-on-the-moon');
    const reaction = world.reactToEventOutcome(
      'face-on-the-moon',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The binoculars break.',
        deltas: { energy: -79 },
        cue: 'none',
      },
      {
        choiceId: 'spyglass',
        actors: [{ instanceId: binoculars.instanceId, condition: 'broken' }],
      },
    );
    world.update(0.24, 0.24);

    expect(binocularsRoot.position.z).toBeGreaterThan(0.3);
    expect(Math.abs(binocularsRoot.rotation.x)).toBeGreaterThan(0.3);

    world.update(1.1, 0.86);
    await reaction;
    expect(binocularsRoot.position.toArray()).toEqual([0, 0, 0]);

    world.dispose();
    propModels.dispose();
  });

  it('uses shared supply motion for the Moon Umbrella and Telescope choices', async () => {
    const umbrella = savedItem('umbrella');
    const telescope = savedItem('spyglass');
    const propModels = createTestPropModels();
    const borrowActor = vi.spyOn(BoatSupplyDisplay.prototype, 'borrowEventActor');
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [umbrella, telescope],
    );
    world.syncInventory(snapshot([umbrella, telescope]));

    const umbrellaMotion = world.playEventItemUse(
      'face-on-the-moon',
      'umbrella',
      umbrella.instanceId,
    );
    const umbrellaDuration = eventItemUseDuration('umbrella-shield');
    world.update(umbrellaDuration, umbrellaDuration);
    await umbrellaMotion;

    const telescopeMotion = world.playEventItemUse(
      'face-on-the-moon',
      'spyglass',
      telescope.instanceId,
    );
    const telescopeDuration = eventItemUseDuration('binocular-look');
    world.update(
      umbrellaDuration + telescopeDuration,
      telescopeDuration,
    );
    await telescopeMotion;

    expect(borrowActor).toHaveBeenNthCalledWith(1, umbrella.instanceId);
    expect(borrowActor).toHaveBeenNthCalledWith(2, telescope.instanceId);
    expect(camera.fov).toBeLessThan(65);
    camera.updateWorldMatrix(true, false);
    const moonTarget = world.scene.getObjectByName('moon-event-item-aim-target')!;
    const moonDirection = moonTarget.getWorldPosition(new Vector3())
      .sub(camera.getWorldPosition(new Vector3()))
      .normalize();
    expect(camera.getWorldDirection(new Vector3()).dot(moonDirection))
      .toBeGreaterThan(0.999);
    world.dispose();
    propModels.dispose();
    borrowActor.mockRestore();
  });

  it('holds active moon state during ambient pause updates without advancing it', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(1.9, 1.9);
    const heldReveal = sky.material.uniforms.uMoonFaceReveal?.value as number;
    const heldStars = sky.material.uniforms.uMoonStarScale?.value as number;

    world.updateAmbient(21.9, 20);

    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(heldReveal);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(heldStars);
    expect(await remainsPending(reveal)).toBe(true);

    world.update(25.8, 3.9);
    await reveal;
    world.dispose();
    propModels.dispose();
  });

  it('restores the camera before replacement animators stage after Moon Energy loss', async () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(5.8, 5.8);
    await reveal;
    const reaction = world.reactToEventOutcome('face-on-the-moon', {
      accepted: true,
      code: 'event-resolved',
      message: 'You cannot keep your eyes open.',
      deltas: { energy: -80 },
      cue: 'none',
    });
    world.update(4.9, 1.1);
    await reaction;
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);

    const originalStage = SupernaturalEventAnimator.prototype.stage;
    let cameraQuaternionWhenStaged: number[] = [];
    const stage = vi.spyOn(SupernaturalEventAnimator.prototype, 'stage')
      .mockImplementation(function stageReplacement(
        this: SupernaturalEventAnimator,
        eventId: string,
      ) {
        cameraQuaternionWhenStaged = camera.quaternion.toArray();
        return originalStage.call(this, eventId);
      });

    world.stageEvent('ghosts');

    expect(cameraQuaternionWhenStaged).toEqual(baseCameraQuaternion);
    expect(cameraRig.position.y).toBe(0);
    stage.mockRestore();
    world.dispose();
    propModels.dispose();
  });

  it('keeps Restless Waves supplies fixed while the camera shows hull impacts', async () => {
    const ring = savedItem('swimRing');
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [ring],
    );
    const baseCameraPosition = camera.position.toArray();
    const baseCameraQuaternion = camera.quaternion.toArray();
    world.syncInventory(snapshot([ring]));
    const ringRoot = world.scene.getObjectByName('boat-supply:swimRing')!;
    const baseX = ringRoot.position.x;
    const baseScaleX = ringRoot.scale.x;
    const baseYaw = ringRoot.rotation.y;

    const lost = world.reactToEventOutcome(
      'restless-waves',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The Ring slips away.',
        deltas: {},
        cue: 'none',
      },
      {
        choiceId: 'swimRing',
        actors: [{ instanceId: ring.instanceId, condition: 'lost' }],
      },
    );
    world.update(0.42, 0.42);
    expect(ringRoot.position.x).toBe(baseX);
    world.clearEvent();
    await lost;

    world.stageEvent('restless-waves');
    const broken = world.reactToEventOutcome(
      'restless-waves',
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The Ring buckles against the hull.',
        deltas: { hull: -20 },
        cue: 'impact',
      },
      {
        choiceId: 'swimRing',
        actors: [{ instanceId: ring.instanceId, condition: 'broken' }],
      },
    );
    world.update(0.62, 0.2);
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    expect(camera.position.toArray()).toEqual(baseCameraPosition);
    expect(camera.quaternion.toArray()).not.toEqual(baseCameraQuaternion);
    const impactViewDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const baseViewDirection = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion().fromArray(baseCameraQuaternion),
    );
    expect(impactViewDirection.y).toBeCloseTo(baseViewDirection.y);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(ringRoot.scale.x).toBe(baseScaleX);
    expect(ringRoot.rotation.y).toBe(baseYaw);

    world.clearEvent();
    await broken;
    world.dispose();
    propModels.dispose();
  });

  it('shows a newly gained supply without allocating a model during inventory sync', () => {
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
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

  it('shows a closed chest as one physical day action', () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );

    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));

    const chest = world.scene.getObjectByName('persistent-chest')!;
    expect(chest.visible).toBe(true);
    expect(chest.position.toArray()).toEqual([0, 0.22, 2.15]);
    expect(chest.scale.toArray()).toEqual([0.75, 0.75, 0.75]);
    expect(chest.quaternion.angleTo(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
    )).toBeLessThan(1e-6);

    world.setRearCameraView(true, true);
    world.update(0.1, 0.1);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'persistent-chest',
        label: 'OPEN',
        toolId: 'chest',
        action: 'openChest',
        visible: true,
      }),
    ]));

    world.setHighlightedItem('persistent-chest');
    expect(world.scene.getObjectByName('persistent-chest')
      ?.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.dispose();
    propModels.dispose();
  });

  it('advances the chest fade during world updates', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
    );
    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));
    const chest = world.scene.getObjectByName('persistent-chest')!;

    world.syncInventory(snapshot([], {
      chest: { state: 'none', acquiredDay: null },
    }));
    expect(chest.visible).toBe(true);

    world.update(0.3, CHEST_DISAPPEAR_DURATION / 2);
    expect(chest.visible).toBe(true);
    world.update(0.6, CHEST_DISAPPEAR_DURATION / 2);
    expect(chest.visible).toBe(false);

    world.dispose();
    propModels.dispose();
  });

  it('uses the standard outline for Midnight Tour before projecting the Handyman hand', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
    );

    world.stageEvent('midnight-tour');
    const islandReveal = world.revealEvent('midnight-tour');
    world.setDocumentHidden(true);
    await islandReveal;
    world.setDocumentHidden(false);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'midnight-tour:island',
        eventChoiceId: 'visit',
      }),
    ]));
    world.setHighlightedItem('midnight-tour:island');
    expect(world.scene.getObjectByName('midnight-tour-island')
      ?.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.clearEvent();
    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));
    world.stageEvent('handyman');
    const handReveal = world.revealEvent('handyman');
    world.setDocumentHidden(true);
    await handReveal;
    world.setDocumentHidden(false);
    const handymanAnchors = world.projectInteractionAnchors(800, 600);
    expect(handymanAnchors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'handyman:hand',
        eventChoiceId: 'touch',
        tooltip: false,
      }),
      expect.objectContaining({ id: 'persistent-chest', eventChoiceId: 'chest' }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('keeps Carlitos idle running during ambient updates', async () => {
    const carlitos = savedItem('carlitos');
    const propModels = await loadProductionPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
      [carlitos],
    );
    try {
      world.syncInventory(snapshot([], {
        carlitos: {
          alive: true,
          energy: 3,
          hunger: 5,
          sickness: 0,
          unhappiness: 0,
          pettedToday: false,
          deathCause: null,
        },
      }));
      const companion = world.scene.getObjectByName('carlitos-companion')!;
      const animatedTail = companion.getObjectByName('TailTip_8')!;
      const before = animatedTail.quaternion.clone();

      world.updateAmbient(0.5, 0.5);

      expect(companion.visible).toBe(true);
      expect(animatedTail.quaternion.angleTo(before)).toBeGreaterThan(1e-5);
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('shows one living companion model and projects its scene anchor', () => {
    const carlitos = savedItem('carlitos');
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'createPresentation');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
    world.stageEvent('drifting-barrel');
    const reveal = world.revealEvent('drifting-barrel');
    world.update(1, 0.9);
    await reveal;
    const companion = world.scene.getObjectByName('carlitos-companion')!;
    const basePosition = companion.position.clone();

    const delegated = world.delegateDriftingItem('drifting-barrel');
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
        createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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

  it('shows continuous Leak streams on both hull sides over centered water', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent('leak');
    const reveal = world.revealEvent('leak');
    world.update(1.4, 1.4);
    const leakBoat = world.scene.getObjectByName('leak-boat')!;
    const streams = leakBoat.children.filter(({ name }) => name.startsWith('leak-stream-'));
    const holes = leakBoat.children.filter(({ name }) => name.startsWith('leak-hole-'));
    expect(streams).toHaveLength(6);
    expect(holes).toHaveLength(6);
    expect(streams.every(({ visible }) => visible)).toBe(true);
    expect(streams.some(({ position }) => position.x < 0)).toBe(true);
    expect(streams.some(({ position }) => position.x > 0)).toBe(true);
    streams.forEach(({ position }, index) => {
      expect(Math.abs(position.x)).toBeGreaterThan(Math.abs(holes[index]!.position.x));
    });
    const interiorWater = leakBoat.getObjectByName('leak-interior-water') as Mesh;
    expect(interiorWater.position.x).toBe(0);
    expect(interiorWater.position.y).toBeGreaterThan(-0.28);
    interiorWater.geometry.computeBoundingBox();
    const waterBounds = interiorWater.geometry.boundingBox!;
    expect(waterBounds.max.x - waterBounds.min.x).toBeGreaterThan(3.1);
    expect(waterBounds.max.z - waterBounds.min.z).toBeGreaterThan(5.8);

    world.setDocumentHidden(true);
    await reveal;
    world.dispose();
    propModels.dispose();
  });

  it('shows a distant starboard Tornado without moving the camera', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const camera = new PerspectiveCamera();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    const baseQuaternion = camera.quaternion.clone();

    world.stageEvent('tornado');
    const tornado = world.scene.getObjectByName('tornado-world')!;
    const model = tornado.getObjectByName('tornado-model')!;
    const vortex = (world as unknown as {
      vortexWave: { strength: number; depression: number };
    }).vortexWave;
    expect(tornado.position.x).toBe(12.8);
    expect(tornado.position.z).toBe(-19);
    expect(tornado.userData.distanceFromBoat).toBeGreaterThan(22);
    expect(model).toBeDefined();
    expect(eventModels.create).toHaveBeenCalledWith('tornadoCore');
    expect(tornado.getObjectByName('whirlpool-dark-funnel')).toBeUndefined();
    expect(tornado.getObjectByName('whirlpool-water-stream-1')).toBeUndefined();
    expect(vortex.strength).toBe(0);
    expect(vortex.depression).toBe(0);
    const initialRotation = model.rotation.y;

    const reveal = world.revealEvent('tornado');
    world.update(1.5, 1.5);
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());
    expect(model.visible).toBe(true);
    expect(model.rotation.y).not.toBe(initialRotation);
    expect(tornado.getObjectByName('tornado-wind-band-1')?.visible).toBe(true);
    expect(tornado.getObjectByName('tornado-sea-spray-1')?.visible).toBe(true);
    expect(vortex.strength).toBe(0);
    expect(vortex.depression).toBe(0);
    world.update(3, 1.5);
    await reveal;
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());

    const outcome = {
      accepted: true,
      code: 'event-resolved' as const,
      message: 'The hull takes damage.',
      deltas: { hull: -8 },
      cue: 'impact' as const,
    };
    const reaction = world.reactToEventOutcome(
      'tornado',
      outcome,
      { choiceId: 'sleep', actors: [] },
      {
        outcome,
        resourceDeltas: { hull: -8 },
        gainedInstanceIds: [],
        brokenInstanceIds: [],
        lostInstanceIds: [],
        consumedInstanceIds: [],
        selectedInstanceId: null,
        selectedCondition: null,
        targetInstanceId: null,
      },
    );
    world.update(3.7, 0.7);
    expect(tornado.position.x).toBe(12.8);
    expect(tornado.position.z).toBe(-19);
    expect(vortex.strength).toBe(0);
    expect(vortex.depression).toBe(0);
    world.update(4.4, 0.7);
    await reaction;

    world.dispose();
    propModels.dispose();
  });

  it.each([
    ['anchor', 'anchor'],
    ['swimRing', 'swimRing'],
  ] as const)(
    'keeps the Tornado camera fixed throughout %s item use',
    async (choiceId, itemId) => {
      const item = savedItem(itemId);
      const propModels = createTestPropModels();
      const camera = new PerspectiveCamera(67, 1.6, 0.1, 100);
      camera.position.set(0.3, 1.2, -0.4);
      camera.rotation.set(0.08, -0.12, 0.03);
      const world = new BoatWorld(
        camera,
        propModels,
        createTestMoonTexture(),
        [item],
        undefined,
        undefined,
        'low',
        createTestEventModels(),
      );
      world.syncInventory(snapshot([item]));
      world.stageEvent('tornado');
      const basePosition = camera.position.clone();
      const baseQuaternion = camera.quaternion.clone();
      const baseFieldOfView = camera.fov;
      const assertCameraFixed = () => {
        expect(camera.position.toArray()).toEqual(basePosition.toArray());
        expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());
        expect(camera.fov).toBe(baseFieldOfView);
      };

      const use = world.playEventItemUse('tornado', choiceId, item.instanceId);
      const actor = world.scene.getObjectByName(`boat-supply-event:${item.instanceId}`)!;
      const initialActorPosition = actor.position.clone();
      assertCameraFixed();
      world.update(1, 1);
      assertCameraFixed();
      world.update(TORNADO_ITEM_DURATION, TORNADO_ITEM_DURATION - 1);
      assertCameraFixed();
      expect(actor.position.toArray()).not.toEqual(initialActorPosition.toArray());
      if (choiceId === 'anchor') {
        expect(world.scene.getObjectByName('event-item-chain')?.visible).toBe(true);
      }
      world.update(8, 8 - TORNADO_ITEM_DURATION);
      await use;
      assertCameraFixed();

      world.dispose();
      propModels.dispose();
    },
  );

  it('keeps School of Fish visible while circling outside the hull', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent({
      eventId: 'school-of-fish',
      targetInstanceId: null,
      variantSeed: 7,
    });
    const reveal = world.revealEvent('school-of-fish');
    world.update(2.6, 2.6);
    await reveal;
    const school = world.scene.getObjectByName('school-of-fish-world')!;
    const bodies = school.children.filter(({ name, visible }) => (
      name.startsWith('school-fish-') && visible
    ));
    expect(bodies.length).toBeGreaterThanOrEqual(18);
    expect(bodies.some(({ position }) => position.z < -3.5)).toBe(true);
    expect(bodies.some(({ position }) => position.z > 3.5)).toBe(true);
    expect(bodies.some(({ position }) => position.x < -2.1)).toBe(true);
    expect(bodies.some(({ position }) => position.x > 2.1)).toBe(true);
    expect(bodies.every(({ position }) => {
      const hullHalfWidth = lifeboatHullHalfWidthAt(position.z);
      return hullHalfWidth === null
        || Math.abs(position.x) > hullHalfWidth + 0.45;
    })).toBe(true);
    expect(bodies.every(({ position }) => position.y > -1.05)).toBe(true);
    expect(bodies.some(({ scale }) => scale.x >= 0.9)).toBe(true);
    expect(school.children.filter(({ name, visible }) => (
      name.startsWith('school-surface-fin-') && visible
    ))).toHaveLength(8);

    world.dispose();
    propModels.dispose();
  });

  it('orbits half-submerged Anglerfish around both boat sides', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );

    world.stageEvent({
      eventId: 'swarm-of-anglerfish',
      targetInstanceId: null,
      variantSeed: 11,
    });
    const reveal = world.revealEvent('swarm-of-anglerfish');
    world.update(2.9, 2.9);
    await reveal;
    const swarm = world.scene.getObjectByName('anglerfish-swarm-world')!;
    const fish = swarm.children.filter(({ name, visible }) => (
      name.startsWith('swarm-angler-') && visible
    ));
    expect(fish).toHaveLength(6);
    expect(fish.some(({ position }) => position.x < 0)).toBe(true);
    expect(fish.some(({ position }) => position.x > 0)).toBe(true);
    expect(fish.some(({ position }) => position.z < -3.2)).toBe(true);
    expect(fish.some(({ position }) => position.z > 3.2)).toBe(true);
    expect(fish.every(({ position }) => (
      Math.abs(position.x) > 1.85 || Math.abs(position.z) > 3.2
    ))).toBe(true);
    const firstPositions = fish.map(({ position }) => position.clone());

    world.update(3.15, 0.25);
    expect(fish.some(({ position }, index) => (
      position.distanceTo(firstPositions[index]!) > 0.05
    ))).toBe(true);
    fish.forEach(({ position }, index) => {
      const travel = position.clone().sub(firstPositions[index]!);
      travel.y = 0;
      travel.normalize();
      const facing = new Vector3(0, 0, 1).applyQuaternion(fish[index]!.quaternion);
      facing.y = 0;
      facing.normalize();
      expect(facing.dot(travel)).toBeGreaterThan(0.98);
    });
    for (const root of fish) {
      const bodyMidY = root.userData.bodyMidY as number;
      const surfaceY = root.userData.surfaceY as number;
      const worldMidY = root.position.y + bodyMidY * root.scale.y;
      expect(worldMidY).toBeCloseTo(surfaceY, 5);
    }

    world.dispose();
    propModels.dispose();
  });

  it('registers only the active dedicated event on additive pose roots', () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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

  it('keeps the tentacle outside the hull and animates its idle clip', () => {
    const propModels = createTestPropModels();
    const eventModels = {
      create: vi.fn((id: string): Group | EventModelInstance => {
        if (['fogMan', 'ghost', 'siren', 'sirenRock'].includes(id)) return new Group();
        const root = new Group();
        if (id === 'snatcher') {
          const joint = new Group();
          joint.name = 'tentacle-idle-joint';
          root.add(joint);
          root.animations = [new AnimationClip('Tentacle_Idle', 1, [
            new VectorKeyframeTrack(
              'tentacle-idle-joint.position',
              [0, 1],
              [0, 0, 0, 1, 0, 0],
            ),
          ])];
        }
        return { root, dispose: vi.fn() };
      }),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    } as unknown as EventModelLibrary;
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    );
    world.stageEvent({ eventId: 'snatcher', targetInstanceId: null, variantSeed: 1 });
    const tentacle = world.scene.getObjectByName('tentacle-attack-tentacle')!;
    const joint = world.scene.getObjectByName('tentacle-idle-joint')!;
    const hullEdge = lifeboatHullHalfWidthAt(tentacle.position.z)!;

    expect(tentacle.position.x).toBeGreaterThan(hullEdge + 0.3);
    world.update(0.5, 0.5);
    expect(joint.position.x).toBeCloseTo(0.5);
    world.update(0.75, 0.25);
    expect(joint.position.x).toBeCloseTo(0.75);

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
      createTestMoonTexture(),
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
        if (practicalLightCall === 2) {
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
    const disposeParticles = vi.spyOn(FishingBiteParticles.prototype, 'dispose');

    expect(() => new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    )).toThrow(failure);
    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(disposeParticles).toHaveBeenCalledOnce();
    expect(hangingGeometryDispose).not.toBeNull();
    expect(hangingGeometryDispose!).toHaveBeenCalledOnce();
    expect(hangingMaterialDispose!).toHaveBeenCalledOnce();

    createPracticalLight.mockRestore();
    create.mockRestore();
    disposeCompanion.mockRestore();
    disposeParticles.mockRestore();
    propModels.dispose();
  });

  it('rolls back supplies, the companion, and earlier owners when chest construction fails', () => {
    const propModels = createTestPropModels();
    const failure = new Error('chest construction failed');
    const createEventModel = vi.spyOn(propModels, 'createEventModel')
      .mockImplementation(() => {
        throw failure;
      });
    const disposeSupplies = vi.spyOn(BoatSupplyDisplay.prototype, 'dispose');
    const disposeCompanion = vi.spyOn(CarlitosPresentation.prototype, 'dispose');
    const disposeParticles = vi.spyOn(FishingBiteParticles.prototype, 'dispose');

    expect(() => new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    )).toThrow(failure);
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(disposeParticles).toHaveBeenCalledOnce();

    createEventModel.mockRestore();
    disposeSupplies.mockRestore();
    disposeCompanion.mockRestore();
    disposeParticles.mockRestore();
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
    const disposeParticles = vi.spyOn(FishingBiteParticles.prototype, 'dispose');

    expect(() => new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    )).toThrow(failure);

    expect(disposeCompanion).toHaveBeenCalledOnce();
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(disposeChest).toHaveBeenCalledOnce();
    expect(disposeParticles).toHaveBeenCalledOnce();
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
    disposeParticles.mockRestore();
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      divePresentation: DivePresentation;
      sampleWorldWaveInto: (
        output: ReturnType<typeof sampleWaveField>,
        time: number,
        x: number,
        z: number,
        amplitudeScale: number,
      ) => void;
    };
    const updateDive = vi.spyOn(internals.divePresentation, 'update');
    const sampleDiveWave = vi.spyOn(internals, 'sampleWorldWaveInto');
    const impact = vi.fn();

    const pending = world.playDive(scuba.instanceId, impact);
    expect(world.scene.getObjectByName('boat-supply:scubaSet')?.visible).toBe(false);
    expect(world.scene.getObjectByName('glasses25.001')).not.toBeUndefined();

    world.update(81.1, 1.1);
    expect(updateDive).toHaveBeenCalledWith(1.1, 1.1, expect.any(Number));
    const seatedX = camera.position.x;
    expect(seatedX).toBeGreaterThan(1.6);
    expect(camera.position.z).toBeLessThan(-1.1);
    const initialDirection = new Vector3(0, 0, -1).applyQuaternion(initialQuaternion);
    const seatedDirection = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(initialDirection.angleTo(seatedDirection)).toBeCloseTo(Math.PI / 2);
    const entryPosition = internals.divePresentation.copyWaterEntryWorldPosition(
      new Vector3(),
    );
    expect(sampleDiveWave).toHaveBeenCalledWith(
      expect.any(Object),
      81.1,
      entryPosition.x,
      entryPosition.z,
      presentationWeatherProfile('calm').waveScale,
    );
    const entryWaveHeight = sampleWaveField(
      DEFAULT_WAVES,
      81.1,
      entryPosition.x,
      entryPosition.z,
      presentationWeatherProfile('calm').waveScale,
    ).height;
    expect(updateDive.mock.calls[0]![2]).toBeCloseTo(entryWaveHeight);
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

  it('restores the old gear before a second world dive hides a new instance', async () => {
    const scuba = savedItem('scubaSet');
    const secondScuba = savedItem('scubaSet', 2);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [scuba, secondScuba],
    );
    world.syncInventory(snapshot([scuba, secondScuba]));
    const internals = world as unknown as {
      supplyDisplay: BoatSupplyDisplay;
    };
    const setHidden = vi.spyOn(
      internals.supplyDisplay,
      'setPresentationItemHidden',
    );
    const secondId = secondScuba.instanceId;

    const first = world.playDive(scuba.instanceId, () => undefined);
    const second = world.playDive(secondId, () => undefined);
    await first;

    expect(setHidden.mock.calls.slice(0, 3)).toEqual([
      [scuba.instanceId, true],
      [scuba.instanceId, false],
      [secondId, true],
    ]);
    world.clearDivePresentation();
    await second;
    expect(setHidden).toHaveBeenLastCalledWith(secondId, false);

    world.dispose();
    propModels.dispose();
  });

  it('settles the dive presentation when the document becomes hidden', async () => {
    const scuba = savedItem('scubaSet');
    const camera = new PerspectiveCamera();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [scuba],
    );
    world.syncInventory(snapshot([scuba]));
    const initialPosition = camera.position.clone();
    const pending = world.playDive(scuba.instanceId, () => undefined);
    world.update(1.1, 1.1);

    world.setDocumentHidden(true);
    await pending;
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(world.scene.getObjectByName('boat-supply:scubaSet')?.visible).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('settles and disposes the dive presentation once with the world', async () => {
    const scuba = savedItem('scubaSet');
    const propModels = createTestPropModels();
    const disposeDive = vi.spyOn(DivePresentation.prototype, 'dispose');
    let world: BoatWorld | undefined;
    try {
      world = new BoatWorld(
        new PerspectiveCamera(),
        propModels,
        createTestMoonTexture(),
        [scuba],
      );
      world.syncInventory(snapshot([scuba]));
      const pending = world.playDive(scuba.instanceId, () => undefined);

      world.dispose();
      world.dispose();
      await pending;
      expect(disposeDive).toHaveBeenCalledOnce();
    } finally {
      try {
        world?.dispose();
      } finally {
        try {
          disposeDive.mockRestore();
        } finally {
          propModels.dispose();
        }
      }
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

  it('keeps the bench lantern emissive without emitting light', () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(75, 16 / 9, 0.08, 1000);
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const lantern = world.scene.getObjectByName('survival-lantern')!;
    const model = lantern.getObjectByName('survival-lantern:model')!;
    const material = firstMesh(model).material as MeshStandardMaterial;

    expect(model).toBeDefined();
    expect(firstMesh(model).castShadow).toBe(false);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);
    expect(material.emissiveMap).toBe(material.map);
    expect(lantern.getObjectByName('survival-lantern:light')).toBeUndefined();
    expect(camera.position.toArray()).toEqual([0, 0.88, 1.56]);
    world.setPhase('night');
    world.update(1, 0.1);
    const lanternOrigin = lantern.getWorldPosition(new Vector3()).project(camera);
    const oldCamera = new PerspectiveCamera(65, 16 / 9, 0.08, 1000);
    oldCamera.position.set(0, 0.88, 1.72);
    oldCamera.lookAt(0, 0.88, -1.55);
    oldCamera.updateMatrixWorld(true);
    const oldLanternOrigin = new Vector3(1.05, 0.235, 0.78).project(oldCamera);
    expect(lanternOrigin.x).toBeCloseTo(oldLanternOrigin.x, 2);
    expect(lanternOrigin.y).toBeCloseTo(oldLanternOrigin.y, 2);
    expect(lantern.getObjectByName('survival-lantern:light')).toBeUndefined();
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'end-day-lantern',
        toolId: 'lantern',
        action: 'endDay',
        itemType: null,
      }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('casts stored item shadows onto the lifeboat', () => {
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(75, 16 / 9, 0.08, 1000),
      propModels,
      createTestMoonTexture(),
      [map],
    );
    const storedMap = world.scene.getObjectByName('boat-supply:map:copy-1')!;
    const floor = world.scene.getObjectByName('survival-floor')!;

    expect(firstMesh(storedMap).castShadow).toBe(true);
    expect(firstMesh(storedMap).receiveShadow).toBe(true);
    expect(firstMesh(floor).receiveShadow).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('adds the hanging lantern near the upper camera center without another action', () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(75, 16 / 9, 0.08, 1000);
    const world = new BoatWorld(camera, propModels, createTestMoonTexture());
    world.update(1, 0.1);
    const root = world.scene.getObjectByName('hanging-lantern')!;
    const light = root.getObjectByName('hanging-lantern:light') as PointLight;
    const projected = light.getWorldPosition(new Vector3()).project(camera);
    const lanternAnchors = world.projectInteractionAnchors(800, 600)
      .filter((anchor) => anchor.toolId === 'lantern');

    expect(root).toBeDefined();
    expect(projected.x).toBeGreaterThanOrEqual(-0.12);
    expect(projected.x).toBeLessThanOrEqual(0.12);
    expect(projected.y).toBeGreaterThanOrEqual(0.55);
    expect(projected.y).toBeLessThanOrEqual(0.9);
    expect(light.intensity).toBe(HANGING_LANTERN_DAY_INTENSITY);
    expect(lanternAnchors.map(({ id }) => id)).toEqual(['end-day-lantern']);

    world.dispose();
    propModels.dispose();
  });

  it('raises hanging lantern intensity at night', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(75, 16 / 9, 0.08, 1000),
      propModels,
      createTestMoonTexture(),
    );
    const light = world.scene.getObjectByName('hanging-lantern:light') as PointLight;
    world.setPhase('night');
    world.update(1, 0.1);
    expect(light.intensity).toBe(HANGING_LANTERN_NIGHT_INTENSITY);

    world.dispose();
    propModels.dispose();
  });

  it('disposes the hanging lantern during normal world cleanup', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const light = world.scene.getObjectByName('hanging-lantern:light') as PointLight;
    const shadowDispose = vi.spyOn(light.shadow, 'dispose');
    world.dispose();
    world.dispose();
    expect(shadowDispose).toHaveBeenCalledOnce();
    propModels.dispose();
  });

  it('places the repair toolbox on the left end of the lantern bench', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const lantern = world.scene.getObjectByName('survival-lantern')!;
    const repairTools = world.scene.getObjectByName('repair-toolbox')!;

    expect(repairTools.position.toArray()).toEqual([-1.05, 0.225, 0.78]);
    expect(repairTools.position.x).toBe(-lantern.position.x);
    expect(repairTools.position.z).toBe(lantern.position.z);
    expect(repairTools.rotation.y).toBe(-Math.PI / 2);

    world.dispose();
    propModels.dispose();
  });

  it('outlines event-eligible supplies without muting other supplies', () => {
    const bucket = savedItem('bucket');
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [bucket, map],
    );
    world.syncInventory(snapshot([bucket, map]));
    const bucketRoot = world.scene.getObjectByName('boat-supply:bucket')!;
    const mapRoot = world.scene.getObjectByName('boat-supply:map')!;
    const mapMaterial = firstMesh(mapRoot).material;

    world.setEventEligibleItems(new Set([bucket.instanceId]));

    expect(bucketRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();
    expect(mapRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    expect(firstMesh(mapRoot).material).toBe(mapMaterial);

    world.setEventEligibleItems(new Set());
    expect(bucketRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    expect(mapRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('outlines the repair toolbox and lantern as physical interaction targets', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const repairTools = world.scene.getObjectByName('repair-toolbox')!;
    const lantern = world.scene.getObjectByName('survival-lantern')!;

    world.setHighlightedItem('repair-tools');
    expect(repairTools.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();
    expect(lantern.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();

    world.setHighlightedItem('end-day-lantern');
    expect(repairTools.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    expect(lantern.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setHighlightedItem(null);
    expect(lantern.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('continues owned geometry, material, and texture cleanup and rethrows the first error', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
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
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const internals = world as unknown as {
      ocean: { dispose(): void };
      fishingBiteParticles: { dispose(): void };
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
    const originalFishingBiteParticlesDispose =
      internals.fishingBiteParticles.dispose.bind(internals.fishingBiteParticles);
    const fishingBiteParticlesDispose = vi.spyOn(internals.fishingBiteParticles, 'dispose')
      .mockImplementation(() => {
        calls.push('bite-particles');
        originalFishingBiteParticlesDispose();
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
      'ocean',
      'bite-particles',
      'sky',
      'scene',
      'camera',
      'geometry',
      'material',
      'texture',
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
      fishingBiteParticlesDispose,
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

  it('keeps broken props inspectable, hides used and lost props, and restores repaired state', () => {
    const savedItems = [savedItem('bucket'), savedItem('energyBar'), savedItem('map')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.break('bucket-1');
    inventory.consumeInstance('energyBar-1');
    inventory.lose('map-1');
    world.syncInventory(snapshot(savedItems, { inventory: inventory.snapshot() }));
    expect(world.scene.getObjectByName('boat-supply:bucket')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600).find(({ id }) => id === 'supply:bucket'))
      .toMatchObject({
        action: null,
        quantity: 1,
        usableQuantity: 0,
        brokenQuantity: 1,
      });
    expect(world.scene.getObjectByName('boat-supply:energyBar')?.visible).toBe(false);
    expect(world.scene.getObjectByName('boat-supply:map')?.visible).toBe(false);
    inventory.repair('bucket-1');
    world.syncInventory(snapshot(savedItems, { inventory: inventory.snapshot() }));
    expect(world.scene.getObjectByName('boat-supply:bucket')?.visible).toBe(true);
    world.dispose();
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
      createTestMoonTexture(),
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

  it('uses the full projected item model as its pointer target', () => {
    const savedItems = [savedItem('bucket')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
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
      createTestMoonTexture(),
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
      'end-day-lantern',
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

  it('anchors the fishing line to the rod geometry tip instead of its bounds center', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const lineOrigin = world.scene.getObjectByName('fishing-line-origin')!;

    expect(lineOrigin.position.x).toBeCloseTo(0.353055, 5);
    expect(lineOrigin.position.y).toBeCloseTo(-0.236377, 5);
    expect(lineOrigin.position.z).toBeCloseTo(0.258526, 5);

    world.dispose();
    propModels.dispose();
  });

  it('uses point particles only during the fishing bite window', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const internals = world as unknown as {
      fishingBiteParticles: FishingBiteParticles;
    };

    expect(world.scene.getObjectByName('fishing-bubbles')).toBeUndefined();
    expect(world.scene.getObjectByName('fishing-ripples')).toBeUndefined();
    expect(world.scene.getObjectByName('scavenge-lifeboat-bow-spray')).toBeUndefined();
    expect(internals.fishingBiteParticles.activeCount()).toBe(0);

    world.showFishingBite(world.centeredFishingCast());
    expect(internals.fishingBiteParticles.activeCount()).toBeGreaterThan(0);

    world.showFishingWaiting(world.centeredFishingCast());
    expect(internals.fishingBiteParticles.activeCount()).toBe(0);

    world.dispose();
    propModels.dispose();
  });

  it('hides the bobber while reeling in a reward', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const point = world.centeredFishingCast();
    const bobber = world.scene.getObjectByName('fishing-bobber')!;

    world.showFishingBite(point);
    expect(bobber.visible).toBe(true);

    const reel = world.playFishingReel('cod');
    await vi.waitFor(() => {
      expect(bobber.visible).toBe(false);
    });

    world.update(1, 1);
    await reel;
    expect(bobber.visible).toBe(false);
    const catchDisplay = world.scene.getObjectByName('fishing-catch-display')!;
    const catchRest = world.scene.getObjectByName('fishing-catch-bow-rest')!;
    expect(catchDisplay.visible).toBe(true);
    expect(catchDisplay.parent).toBe(catchRest);
    expect(catchDisplay.position.toArray()).toEqual([0, 0, 0]);
    expect(catchRest.position.toArray()).toEqual([0, 0.43, -2.52]);
    expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(world.projectFishingCatch(800, 600)).toMatchObject({ visible: true });

    world.dispose();
    propModels.dispose();
  });

  it('settles the active fishing handle and preserves bow view when presentation is cleared', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const normalPosition = camera.position.clone();
    const pending = world.playFishingCast(world.centeredFishingCast());
    const bowPosition = camera.position.clone();
    expect(bowPosition.toArray()).not.toEqual(normalPosition.toArray());

    world.clearFishingPresentation();
    await pending;

    expect(camera.position.toArray()).toEqual(bowPosition.toArray());
    for (const name of ['fishing-line', 'fishing-bobber', 'fishing-splash', 'fishing-catch-display']) {
      expect(world.scene.getObjectByName(name)?.visible).toBe(false);
    }
    let repeatEntrySettled = false;
    void world.enterFishingView().then(() => { repeatEntrySettled = true; });
    await Promise.resolve();
    expect(repeatEntrySettled).toBe(true);
    expect(camera.position.toArray()).toEqual(bowPosition.toArray());

    world.dispose();
    propModels.dispose();
  });

  it('settles dedicated fishing handles on dispose from every active stage', async () => {
    const stages: Array<(world: BoatWorld) => Promise<void> | void> = [
      (world) => world.enterFishingView(),
      (world) => world.playFishingCast(world.centeredFishingCast()),
      (world) => { world.showFishingWaiting(world.centeredFishingCast()); },
      (world) => { world.showFishingBite(world.centeredFishingCast()); },
      (world) => world.playFishingReel('cod'),
      (world) => world.playFishingMiss(),
      (world) => world.exitFishingView(),
    ];

    for (const enterStage of stages) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        propModels,
        createTestMoonTexture(),
      );
      const pending = enterStage(world);
      world.dispose();
      world.dispose();
      await pending;
      propModels.dispose();
    }
  });

  it('disposes presentation and catch-library resources exactly once from every fishing stage', async () => {
    const stages: ReadonlyArray<{
      readonly name: string;
      readonly arrange: (world: BoatWorld) => Promise<void> | void;
    }> = [
      { name: 'idle', arrange: () => {} },
      { name: 'entering', arrange: (world) => { void world.enterFishingView(); } },
      {
        name: 'ready',
        arrange: (world) => {
          void world.enterFishingView();
          world.update(1, 1);
        },
      },
      { name: 'casting', arrange: (world) => { void world.playFishingCast(world.centeredFishingCast()); } },
      { name: 'waiting', arrange: (world) => { world.showFishingWaiting(world.centeredFishingCast()); } },
      { name: 'bite', arrange: (world) => { world.showFishingBite(world.centeredFishingCast()); } },
      { name: 'reeling', arrange: (world) => world.playFishingReel('cod') },
      { name: 'missing', arrange: (world) => { void world.playFishingMiss(); } },
      { name: 'returning', arrange: (world) => { void world.exitFishingView(); } },
    ];

    for (const stage of stages) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        propModels,
        createTestMoonTexture(),
      );
      const internals = world as unknown as {
        fishingCatches: FishingCatchLibrary;
        fishingBiteParticles: FishingBiteParticles;
        ownedGeometries: Set<BufferGeometry>;
        ownedMaterials: Set<Material>;
      };
      const preparedCatch = await internals.fishingCatches.prepare('cod');
      expect(preparedCatch).not.toBeNull();
      const catchGeometries = new Set<BufferGeometry>();
      const catchMaterials = new Set<Material>();
      collectMeshResources(preparedCatch!, catchGeometries, catchMaterials);
      const line = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry, Material>;
      const pooledMeshes = [
        firstMesh(world.scene.getObjectByName('fishing-bobber')!),
        firstMesh(world.scene.getObjectByName('fishing-splash')!),
      ];
      const biteParticleGeometry = internals.fishingBiteParticles.points.geometry;
      const biteParticleMaterial = internals.fishingBiteParticles.points.material;
      const presentationGeometries = new Set<BufferGeometry>([
        line.geometry,
        ...pooledMeshes.map(({ geometry }) => geometry),
      ]);
      const presentationMaterials = new Set<Material>([
        line.material,
        ...pooledMeshes.flatMap(({ material }) => Array.isArray(material) ? material : [material]),
      ]);
      const catchGeometry = catchGeometries.values().next().value!;
      const catchMaterial = catchMaterials.values().next().value!;

      presentationGeometries.forEach((geometry) => {
        expect(internals.ownedGeometries.has(geometry), stage.name).toBe(true);
      });
      presentationMaterials.forEach((material) => {
        expect(internals.ownedMaterials.has(material), stage.name).toBe(true);
      });
      expect(internals.ownedGeometries.has(biteParticleGeometry), stage.name).toBe(false);
      expect(internals.ownedMaterials.has(biteParticleMaterial), stage.name).toBe(false);
      expect(
        [...catchGeometries].some((geometry) => internals.ownedGeometries.has(geometry)),
        stage.name,
      ).toBe(false);
      expect(
        [...catchMaterials].some((material) => internals.ownedMaterials.has(material)),
        stage.name,
      ).toBe(false);

      const presentationDisposeSpies = [
        ...presentationGeometries,
        ...presentationMaterials,
      ].map((resource) => vi.spyOn(resource, 'dispose'));
      const catchGeometryDispose = vi.spyOn(catchGeometry, 'dispose');
      const catchMaterialDispose = vi.spyOn(catchMaterial, 'dispose');
      const biteParticleGeometryDispose = vi.spyOn(biteParticleGeometry, 'dispose');
      const biteParticleMaterialDispose = vi.spyOn(biteParticleMaterial, 'dispose');

      const pending = stage.arrange(world);
      world.dispose();
      world.dispose();
      await pending;

      presentationDisposeSpies.forEach((dispose) => {
        expect(dispose, stage.name).toHaveBeenCalledOnce();
      });
      expect(catchGeometryDispose, stage.name).toHaveBeenCalledOnce();
      expect(catchMaterialDispose, stage.name).toHaveBeenCalledOnce();
      expect(biteParticleGeometryDispose, stage.name).toHaveBeenCalledOnce();
      expect(biteParticleMaterialDispose, stage.name).toHaveBeenCalledOnce();
      propModels.dispose();
    }
  });

});
