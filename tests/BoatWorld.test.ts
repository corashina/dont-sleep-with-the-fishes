// Importance: 4/5. Protects survival world integration and cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
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
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
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
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { DivePresentation } from '../src/survival/DivePresentation';
import {
  FOCUSED_EVENT_IDS,
  type FocusedEventPresentation,
  type FocusedEventPresentationFactories,
} from '../src/survival/FocusedEventPresentation';
import type { SupplyAdditivePose } from '../src/survival/BoatSupplyDisplay';
import { EventPresentationLayer } from '../src/survival/EventPresentationLayer';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import type {
  EventModelInstance,
} from '../src/survival/EventModelLibrary';
import type { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import {
  boatStorageTransform,
  boatSupplyTransform,
} from '../src/world/BoatStorage';
import { projectBoatBounds } from '../src/survival/BoatInteraction';
import { collectMeshResources } from '../src/world/SceneResources';
import { HOVER_OUTLINE_NAME } from '../src/rendering/HoverOutline';
import { SurvivalInventoryState } from '../src/survival/inventory';
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

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) found = object;
  });
  if (!found) throw new Error('Expected saved prop mesh');
  return found;
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
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState(savedItems).snapshot(),
    savedItems,
    pendingEventId: null,
    pendingEventTargetId: null,
    pendingDriftingLootVariant: null,
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

    world.setWaterQuality('high');
    expect(setQuality).toHaveBeenCalledWith('high');

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
    }));

    expect(world.scene.getObjectByName('survival-supply-platform')).toBeUndefined();
    for (const type of Object.keys(ITEM_DEFINITIONS) as ItemId[]) {
      for (let index = 0; index < ITEM_DEFINITIONS[type].spawnCount; index += 1) {
        const copy = world.scene.getObjectByName(
          `boat-supply:${type}:copy-${index + 1}`,
        )!;
        const expected = boatSupplyTransform(type, index);

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
    world.stageEvent('death-stare');
    expect(world.scene.getObjectByName('event-prop:death-stare')?.visible).toBe(true);
    const reveal = world.revealEvent('death-stare');
    world.update(1, 1);
    await reveal;
    world.clearEvent();
    expect(world.scene.getObjectByName('event-prop:death-stare')?.visible).toBe(false);

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

    world.stageEvent('death-stare');
    expect(world.scene.getObjectByName('event-prop:death-stare')?.visible)
      .toBe(true);
    for (const presenter of doubles.values()) {
      expect(presenter.stage).toHaveBeenCalledOnce();
    }

    world.dispose();
    for (const presenter of doubles.values()) {
      expect(presenter.dispose).toHaveBeenCalledOnce();
    }
    propModels.dispose();
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
      'other-people-container-ship',
    )!;
    const heldPosition = ship.position.clone();
    world.update(2, 1 / 60);
    expect(
      world.scene.getObjectByName('focused-event:other-people')?.visible,
    ).toBe(true);
    expect(ship.position.toArray()).toEqual(heldPosition.toArray());

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

  it('reapplies the held Handyman Touch camera after each base reset', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    world.stageEvent('handyman');
    const choice = world.playEventChoice('handyman', {
      choiceId: 'touch',
      instanceId: null,
      condition: null,
    });
    world.update(1, 1);
    await choice;

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
    const heldPosition = cameraRig.position.toArray();
    const heldQuaternion = cameraRig.quaternion.toArray();
    expect(heldPosition).not.toEqual([0, 0, 0]);
    expect(
      world.scene.getObjectByName('focused-event:handyman')?.userData.state,
    ).toBe('held-touch');

    world.update(3, 1 / 60);
    expect(cameraRig.position.toArray()).toEqual(heldPosition);
    expect(cameraRig.quaternion.toArray()).toEqual(heldQuaternion);

    world.clearEvent();
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
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

  it('rejects one focused presenter registered for two events and disposes it once', () => {
    const propModels = createTestPropModels();
    const shared = focusedPresenterTestDouble('shared');
    const factories: FocusedEventPresentationFactories = {
      'chest-attack': () => shared.presenter,
      'midnight-tour': () => shared.presenter,
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
    expect(shared.stage).toHaveBeenCalledOnce();
    expect(world.scene.getObjectByName('focused-event:shared')?.visible)
      .toBe(true);

    world.stageEvent('midnight-tour');
    expect(shared.stage).toHaveBeenCalledOnce();
    expect(shared.clear).toHaveBeenCalledOnce();
    expect(world.scene.getObjectByName('focused-event:shared')?.visible)
      .toBe(false);
    expect(world.scene.getObjectByName('event-prop:midnight-tour')?.visible)
      .toBe(true);

    world.dispose();
    world.dispose();
    expect(shared.dispose).toHaveBeenCalledOnce();
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

  it('routes deterministic drifting loot through borrowed furniture at the stern', async () => {
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
    const sternRest = world.scene.getObjectByName('drifting-loot-stern-rest')!;

    expect(sternRest.position.toArray()).toEqual([0.72, 0.58, 1.05]);
    expect(() => world.stageEvent('drifting-loot')).toThrow(
      'Drifting loot requires a variant.',
    );
    world.stageEvent('drifting-loot', 'crate');
    expect(world.scene.getObjectByName('drifting-loot:barrel')?.visible).toBe(false);
    expect(world.scene.getObjectByName('drifting-loot:crate')?.visible).toBe(true);
    expect(world.scene.getObjectByName('event-prop:drifting-loot')).toBeUndefined();

    const reveal = world.revealEvent('drifting-loot');
    world.update(1, 0.9);
    await reveal;
    expect(world.projectDriftingLoot(800, 600)).toBeNull();
    const interaction = world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'drifting-loot');
    expect(interaction).toEqual(expect.objectContaining({
      id: 'drifting-loot',
      label: 'CRATE',
      description: 'Floating salvage within reach.',
      eventChoiceId: 'retrieve',
      visible: true,
    }));
    expect(interaction?.hitArea?.width).toBeGreaterThanOrEqual(64);
    expect(interaction?.hitArea?.height).toBeGreaterThanOrEqual(64);

    const crate = world.scene.getObjectByName('drifting-loot:crate')!;
    world.setHighlightedItem('drifting-loot');
    expect(crate.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    const retrieve = world.retrieveDriftingLoot();
    expect(world.projectInteractionAnchors(800, 600)
      .find(({ id }) => id === 'drifting-loot')).toBeUndefined();
    expect(crate.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    world.update(2, 1.1);
    await retrieve;
    expect(world.projectDriftingLoot(800, 600)).not.toBeNull();

    const recede = world.recedeDriftingLoot();
    world.update(3, 0.8);
    await recede;
    expect(world.scene.getObjectByName('drifting-loot:crate')?.visible).toBe(false);

    world.dispose();
    furniture.dispose();
    propModels.dispose();
  });

  it('does not dispose drifting-loot resources borrowed from the furniture library', () => {
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
    const barrel = world.scene.getObjectByName('drifting-loot:barrel')!;
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

  it('applies the Bad Sleep reveal to the camera and supplies', async () => {
    const cameraRig = new Group();
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
    );

    const reveal = animator.reveal('bad-sleep');
    animator.update(1.7, 1.7);

    expect(cameraRig.position.y).not.toBe(0);
    expect(supplies.ambientRoll).not.toBe(0);

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
      animator.update(2, 2);
      await itemUse;

      expect(supplies.poses.size).toBe(0);
      expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
      expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      animator.dispose();
    },
  );

  it.each([
    ['shower-night', 'bucket', 'bucket-1'],
    ['windy-night', 'umbrella', 'umbrella-1'],
    ['thunderstorm', 'anchor', 'anchor-1'],
  ] as const)(
    'moves only the camera for %s item use and result',
    async (eventId, choiceId, instanceId) => {
      const cameraRig = new Group();
      const supplies = new FakeBoatSupplyDisplay();
      const animator = new WeatherEventAnimator(
        cameraRig,
        supplies as unknown as BoatSupplyDisplay,
      );

      const itemUse = animator.playItemUse(eventId, choiceId, instanceId);
      animator.update(0.6, 0.6);

      expect(supplies.poses.size).toBe(0);
      expect(supplies.pinCalls).toHaveLength(0);
      expect(
        Math.abs(cameraRig.rotation.y) + Math.abs(cameraRig.position.z),
      ).toBeGreaterThan(0.01);

      animator.update(2, 2);
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
      expect(
        Math.abs(cameraRig.position.x) + Math.abs(cameraRig.position.y)
        + Math.abs(cameraRig.rotation.y) + Math.abs(cameraRig.rotation.z),
      ).toBeGreaterThan(0.01);

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
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
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
    expect(Math.abs(cameraRig.rotation.z)).toBeGreaterThan(0.05);
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
    const supplies = new FakeBoatSupplyDisplay();
    const animator = new WeatherEventAnimator(
      cameraRig,
      supplies as unknown as BoatSupplyDisplay,
    );

    void animator.reveal('windy-night');
    animator.update(0.9, 0.9);
    expect(supplies.ambientRoll).toBe(0);
    expect(Math.abs(cameraRig.rotation.y)).toBeGreaterThan(0.01);

    animator.clear();

    expect(cameraRig.position.toArray()).toEqual(basePosition);
    cameraRig.rotation.toArray().slice(0, 3).forEach((value, index) => {
      expect(value).toBeCloseTo(baseRotation[index]!);
    });
    expect(supplies.poses.size).toBe(0);
    expect(supplies.ambientRoll).toBe(0);
    expect(supplies.ambientLift).toBe(0);
    animator.dispose();
  });

  it('owns and routes the full Shower Night reveal before restoring the base camera', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const basePosition = cameraRig.position.toArray();
    const baseQuaternion = cameraRig.quaternion.toArray();

    world.stageEvent('shower-night');

    expect(world.scene.getObjectByName('weather-event-world')).toBeDefined();
    expect(world.scene.getObjectByName('weather-event-boat')).toBeDefined();
    expect(world.scene.getObjectByName('weather-rain-bucket-splash')).toBeUndefined();
    const reveal = world.revealEvent('shower-night');
    world.update(3.39, 3.39);
    expect(await remainsPending(reveal)).toBe(true);
    expect(cameraRig.quaternion.toArray()).not.toEqual(baseQuaternion);

    world.update(3.4, 0.01);
    await reveal;
    expect(cameraRig.position.toArray()).toEqual(basePosition);
    expect(cameraRig.quaternion.toArray()).toEqual(baseQuaternion);

    world.dispose();
    propModels.dispose();
  });

  it('uses camera-only Shower choreography and retains generic fallback', async () => {
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

    const showerUse = world.playEventItemUse(
      'shower-night',
      'bucket',
      bucket.instanceId,
    );
    world.update(0.66, 0.66);
    expect(await remainsPending(showerUse)).toBe(true);
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);
    expect(
      Math.abs(cameraRig.rotation.y) + Math.abs(cameraRig.position.z),
    ).toBeGreaterThan(0.01);
    world.update(2, 2);
    await showerUse;
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);

    const fallback = world.playEventItemUse(
      'strange-noise',
      'bucket',
      bucket.instanceId,
    );
    await Promise.resolve();
    world.update(3, 0.65);
    await fallback;
    expect(bucketGroup.position.toArray()).toEqual([0, 0, 0]);

    world.dispose();
    propModels.dispose();
  });

  it('presents Dangerous Waters through its authored scene and Map motion', async () => {
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [map],
    );
    world.syncInventory(snapshot([map]));
    const presentation = world.scene.getObjectByName('dangerous-waters-presentation')!;
    const mapRoot = world.scene.getObjectByName('boat-supply:map')!;
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cueCameraRig = world.scene.getObjectByName('boat-cue-camera-rig')!;

    world.stageEvent('dangerous-waters');
    expect(presentation.visible).toBe(true);
    const baseMotionX = motionRig.position.x;
    const reveal = world.revealEvent('dangerous-waters');
    world.update(1.2, 1.2);
    expect(Math.abs(motionRig.position.x - baseMotionX)).toBeGreaterThan(0.2);
    expect(Math.abs(cueCameraRig.rotation.y)).toBeGreaterThan(0.04);
    world.update(2.4, 1.2);
    await reveal;

    const baseScale = mapRoot.scale.clone();
    const itemUse = world.playEventItemUse(
      'dangerous-waters',
      'map',
      map.instanceId,
    );
    world.update(2.95, 0.55);
    expect(mapRoot.scale.x).toBeGreaterThan(baseScale.x);
    world.update(3.5, 0.55);
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
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const fragments = world.scene.getObjectByName('dangerous-waters-fragments')!;
    expect(motionRig.rotation.x).toBeGreaterThan(0.1);
    expect(supplyRoot.rotation.toArray().slice(0, 3)).not.toEqual(
      baseSupplyRotation.toArray().slice(0, 3),
    );
    expect(fragments.children.filter(({ visible }) => visible)).toHaveLength(8);

    world.update(0.9, 0.45);
    await reaction;
    expect(Math.abs(motionRig.rotation.z)).toBeGreaterThan(0.005);

    world.clearEvent();
    expect(supplyRoot.rotation.toArray().slice(0, 3)).toEqual(
      baseSupplyRotation.toArray().slice(0, 3),
    );
    world.dispose();
    propModels.dispose();
  });

  it('keeps the generic impact cue visible during an event-specific reaction', async () => {
    const anchor = savedItem('anchor');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [anchor],
    );
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
    expect(cueCameraRig!.position.z).toBeLessThan(-0.05);

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
    ['whirlpool', 'swimRing', 'swimRing'],
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
      world.update(1.3, 0.7);
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
    const base = mapRoot.position.clone();

    const use = world.playEventItemUse(
      'windy-night',
      'map',
      maps[1].instanceId,
    );
    world.update(1, 1.45);
    await use;
    inventory.lose(maps[1].instanceId);
    world.syncInventory(snapshot(maps, { inventory: inventory.snapshot() }));
    expect(mapRoot.visible).toBe(true);

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
    );
    world.update(2, 0.5);
    expect(mapRoot.visible).toBe(true);
    expect(mapRoot.position.toArray()).toEqual(base.toArray());

    world.update(3, 1.23);
    await reaction;
    expect(mapRoot.visible).toBe(true);
    expect(mapRoot.position.toArray()).toEqual(base.toArray());

    world.syncInventory(snapshot(maps, { inventory: inventory.snapshot() }));
    expect(mapRoot.visible).toBe(true);
    expect(mapRoot.position.toArray()).toEqual(base.toArray());
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
    const tableau = world.scene.getObjectByName('siren-tableau')!;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh<
      BufferGeometry,
      ShaderMaterial
    >;

    world.stageEvent('eerie-melody');
    world.setPresentationWeather('calm');
    world.update(time, delta);

    expect(motionRig.position.y).toBeCloseTo(0.22 + expectedBoat.y);
    expect(tableau.position.toArray()).toEqual([-4.3, -0.26, -9.2]);
    expect(tableau.quaternion.toArray()).toEqual([0, 0, 0, 1]);
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

    expect(figure.material).not.toBe(importedMaterial);
    expect(disposeImportedMaterial).toHaveBeenCalledOnce();
    const silhouetteMaterial = figure.material as Material;
    const disposeSilhouetteMaterial = vi.spyOn(silhouetteMaterial, 'dispose');

    world.stageEvent('man-in-the-fog');
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
    expect(world.scene.getObjectByName('ghost-1')?.visible).toBe(true);

    const itemUse = world.playEventItemUse('ghosts', 'flareGun', flare.instanceId);
    expect(weatherSupport).toHaveBeenCalledWith('ghosts', 'flareGun');
    expect(supernaturalSupport).toHaveBeenCalledWith('ghosts', 'flareGun');
    expect(weatherSupport.mock.invocationCallOrder[0]).toBeLessThan(
      supernaturalSupport.mock.invocationCallOrder[0]!,
    );
    world.update(1, 1.2);
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

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(0.76, 0.76);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(await remainsPending(reveal)).toBe(true);

    world.update(1.71, 0.95);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBeGreaterThan(0);
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBeLessThan(1);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBeLessThan(1);
    expect(sky.material.uniforms.uMoonScale?.value).toBeGreaterThan(1.5);

    world.update(3.8, 2.09);
    await reveal;
    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(1);
    expect(sky.material.uniforms.uMoonGrin?.value).toBeGreaterThan(0);
    expect(sky.material.uniforms.uMoonScale?.value).toBeGreaterThanOrEqual(3.5);
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

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(3.8, 3.8);
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

    const energyReaction = world.reactToEventOutcome('face-on-the-moon', {
      accepted: true,
      code: 'event-resolved',
      message: 'You cannot keep your eyes open.',
      deltas: { energy: -80 },
      cue: 'none',
    });
    world.update(5.45, 0.55);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBeGreaterThan(0);
    expect(cameraRig.position.y).toBeLessThan(0);
    world.update(6, 0.55);
    await energyReaction;

    world.setDocumentHidden(true);
    world.clearEvent();
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(cameraRig.position.y).toBe(0);

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

  it('uses existing supply motion for the Moon Umbrella and Telescope choices', async () => {
    const umbrella = savedItem('umbrella');
    const telescope = savedItem('spyglass');
    const propModels = createTestPropModels();
    const supplyMotion = vi.spyOn(BoatSupplyDisplay.prototype, 'playEventItemUse');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
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
    world.update(1.5, 1.5);
    await umbrellaMotion;

    const telescopeMotion = world.playEventItemUse(
      'face-on-the-moon',
      'spyglass',
      telescope.instanceId,
    );
    world.update(3, 1.5);
    await telescopeMotion;

    expect(supplyMotion).toHaveBeenNthCalledWith(1, umbrella.instanceId);
    expect(supplyMotion).toHaveBeenNthCalledWith(2, telescope.instanceId);
    world.dispose();
    propModels.dispose();
    supplyMotion.mockRestore();
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

    world.update(23.8, 1.9);
    await reveal;
    world.dispose();
    propModels.dispose();
  });

  it('restores the camera before replacement animators stage after Moon Energy loss', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;

    world.stageEvent('face-on-the-moon');
    const reveal = world.revealEvent('face-on-the-moon');
    world.update(3.8, 3.8);
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
    expect(cameraRig.position.y).toBeLessThan(0);

    const originalStage = SupernaturalEventAnimator.prototype.stage;
    let cameraYWhenStaged = Number.NaN;
    const stage = vi.spyOn(SupernaturalEventAnimator.prototype, 'stage')
      .mockImplementation(function stageReplacement(
        this: SupernaturalEventAnimator,
        eventId: string,
      ) {
        cameraYWhenStaged = cameraRig.position.y;
        return originalStage.call(this, eventId);
      });

    world.stageEvent('ghosts');

    expect(cameraYWhenStaged).toBe(0);
    expect(cameraRig.position.y).toBe(0);
    stage.mockRestore();
    world.dispose();
    propModels.dispose();
  });

  it('keeps Restless Waves supplies fixed while the camera shows hull impacts', async () => {
    const ring = savedItem('swimRing');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [ring],
    );
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
    expect(cameraRig.position.x).toBeGreaterThan(0.1);
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
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
    );

    world.syncInventory(snapshot([], {
      chest: { state: 'closed', acquiredDay: 3 },
    }));

    expect(world.scene.getObjectByName('persistent-chest')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'persistent-chest',
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

  it('projects and outlines focused event subjects as physical choices', async () => {
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
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'handyman:hand', eventChoiceId: 'touch' }),
      expect.objectContaining({ id: 'persistent-chest', eventChoiceId: 'chest' }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('keeps Captain Whiskers idle running during ambient updates', async () => {
    const whiskers = savedItem('captainWhiskers');
    const propModels = await loadProductionPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
      [whiskers],
    );
    try {
      world.syncInventory(snapshot([whiskers]));
      const copy = world.scene.getObjectByName('boat-supply:captainWhiskers:copy-1')!;
      const animatedRoot = copy.getObjectByName('CaptainWhiskers')!;
      const before = animatedRoot.quaternion.clone();

      world.updateAmbient(0.5, 0.5);

      expect(copy.visible).toBe(true);
      expect(animatedRoot.quaternion.angleTo(before)).toBeGreaterThan(1e-5);
    } finally {
      world.dispose();
      propModels.dispose();
    }
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

    world.update(1, 1);
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

  it('registers all dedicated events on additive pose roots', () => {
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

    const coordinatorWorld = world.scene.getObjectByName('dedicated-event-world')!;
    const coordinatorBoat = world.scene.getObjectByName('dedicated-event-boat')!;
    const cameraEffects = world.scene.getObjectByName('dedicated-event-camera-effects')!;
    const boatEffects = world.scene.getObjectByName('dedicated-event-boat-effects')!;

    expect(coordinatorWorld.children.map(({ name }) => name)).toEqual([
      'leak-world',
      'school-of-fish-world',
      'tentacle-attack-world',
      'death-stare-world',
      'anglerfish-swarm-world',
      'whirlpool-world',
    ]);
    expect(coordinatorBoat.children.map(({ name }) => name)).toEqual([
      'leak-boat',
      'school-of-fish-boat',
      'tentacle-attack-boat',
      'death-stare-boat',
      'anglerfish-swarm-boat',
      'whirlpool-boat',
    ]);
    const whirlpoolWorld = coordinatorWorld.getObjectByName('whirlpool-world')!;
    const whirlpoolBoat = coordinatorBoat.getObjectByName('whirlpool-boat')!;
    expect(whirlpoolWorld.children.map(({ name }) => name)).toEqual([
      'whirlpool-water-stream-1',
      'whirlpool-water-stream-2',
      'whirlpool-water-stream-3',
      'whirlpool-water-stream-4',
      'whirlpool-water-stream-5',
      'whirlpool-water-stream-6',
    ]);
    expect(whirlpoolBoat.children).toHaveLength(0);
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

    expect(() => new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      eventModels,
    )).toThrow(constructionFailure);
    expect(schoolModelDispose).toHaveBeenCalledOnce();
    expect(disposeSupplies).toHaveBeenCalledOnce();
    expect(eventModels.dispose).not.toHaveBeenCalled();

    disposeSupplies.mockRestore();
    propModels.dispose();
  });

  it('routes dedicated events before generic and weather paths', async () => {
    const propModels = createTestPropModels();
    const eventModels = createTestEventModels();
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
    const coordinator = (
      world as unknown as { dedicatedEvents: EventPresentationCoordinator }
    ).dedicatedEvents;
    const dedicatedStage = vi.spyOn(coordinator, 'stage');
    const dedicatedClear = vi.spyOn(coordinator, 'clear');
    const dedicatedItem = vi.spyOn(coordinator, 'playItemUse')
      .mockResolvedValue(false);
    const dedicatedReact = vi.spyOn(coordinator, 'react')
      .mockResolvedValue();
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
    expect(genericClear).toHaveBeenCalled();
    expect(genericReact).not.toHaveBeenCalled();
    expect(weatherStage).not.toHaveBeenCalled();
    expect(weatherClear).toHaveBeenCalled();
    expect(weatherItem).not.toHaveBeenCalled();
    expect(weatherReact).not.toHaveBeenCalled();
    expect(supplyItem).not.toHaveBeenCalled();

    world.stageEvent('windy-night');
    expect(genericStage).toHaveBeenCalledWith('windy-night');
    expect(weatherStage).toHaveBeenCalledWith('windy-night');
    expect(dedicatedClear).toHaveBeenCalled();

    world.dispose();
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
    const internals = world as unknown as {
      dedicatedEvents: EventPresentationCoordinator;
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
    const clearCoordinator = vi.spyOn(internals.dedicatedEvents, 'clear');
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
    propModels.dispose();
  });

  it('borrows one stable supply actor without transferring resource ownership', () => {
    const map = savedItem('map');
    const propModels = createTestPropModels();
    const parent = new Group();
    const display = new BoatSupplyDisplay(propModels, parent, [map]);
    display.sync(snapshot([map]));
    const actor = display.borrowEventActor(map.instanceId);
    const sameActor = display.borrowEventActor(map.instanceId);

    expect(actor).not.toBeNull();
    expect(sameActor).toBe(actor);
    expect(actor?.instanceId).toBe(map.instanceId);
    expect(actor?.root.name).toBe(`boat-supply-event:${map.instanceId}`);
    expect(actor?.root.parent).toBe(parent);
    expect(parent.getObjectByName('boat-supply:map')?.visible).toBe(false);

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
    display.update(0);
    expect(actor!.root.position.toArray()).toEqual([0.4, 0.2, -0.3]);

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

    world.update(81.1, 1.1);
    expect(updateDive).toHaveBeenCalledWith(1.1, 1.1, expect.any(Number));
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
    world.update(84, 0.4);
    expect(impact).toHaveBeenCalledOnce();

    world.clearDivePresentation();
    world.clearDivePresentation();
    await pending;
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    expect(world.scene.getObjectByName('boat-supply:scubaSet')?.visible).toBe(true);

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

    expect(firstActor.root.position.toArray()).toEqual([1.2, 0.3, -0.4]);
    expect(secondActor.root.position.toArray()).toEqual([-1.4, 0.5, -0.7]);

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
    expect(secondActor.root.position.toArray()).toEqual([-1.8, 0.6, -0.9]);
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
    expect(ringActor.root.position.toArray()).toEqual([0.3, 0, 0]);

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
    expect(activeActor.root.position.toArray()).toEqual([-0.25, 0.1, 0]);

    activeActor.release();
    display.dispose();
    propModels.dispose();
  });

  it('uses the imported lantern model with a shadow-casting light', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const lantern = world.scene.getObjectByName('survival-lantern')!;
    const model = lantern.getObjectByName('survival-lantern:model')!;
    const light = lantern.getObjectByName('survival-lantern:light') as PointLight;
    const material = firstMesh(model).material as MeshStandardMaterial;

    expect(model).toBeDefined();
    expect(firstMesh(model).castShadow).toBe(false);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);
    expect(material.emissiveMap).toBe(material.map);
    expect(light).toBeInstanceOf(PointLight);
    expect(light.color.getHex()).toBe(0xffb261);
    expect(light.intensity).toBe(3.8);
    expect(light.distance).toBe(4);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.toArray()).toEqual([512, 512]);
    world.setPhase('night');
    world.update(1, 0.1);
    expect(light.intensity).toBe(5.4);
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

  it('keeps the normal white outline on every event-eligible supply', () => {
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

    world.setEventEligibleItems(new Set([bucket.instanceId, map.instanceId]));

    expect(bucketRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();
    expect(mapRoot.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    world.setEventEligibleItems(null);
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
