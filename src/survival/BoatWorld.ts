import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Texture,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import {
  DAY_ACTION_ONLY_ITEM_IDS,
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import type { WaterQuality } from '../rendering/waterQuality';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import { HoverOutline } from '../rendering/HoverOutline';
import { setSceneBinocularMaskStrength } from '../rendering/BinocularMaskPass';
import {
  BoatBuoyancy,
  smoothBoatPoseInto,
  type BoatPose,
} from '../ocean/BoatBuoyancy';
import {
  DEFAULT_WAVES,
  createInactiveVortexWaveState,
  sampleWaveField,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import {
  presentationWeatherProfile,
  type PresentationWeatherId,
  type PresentationWeatherProfile,
} from '../weather/presentationWeather';
import { createLifeboat, type LifeboatBuild } from '../world/Lifeboat';
import { LifeboatAssets } from '../world/LifeboatAssets';
import { createRepairToolbox } from '../world/RepairToolbox';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import {
  BOAT_SUPPLY_GROUP_IDS,
  type BoatSupplyGroupId,
} from '../world/BoatStorage';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';
import { alignDirectionalLightWithSun } from '../world/celestialLight';
import { Skybox } from '../world/Skybox';
import { WeatherEffects } from '../world/WeatherEffects';
import type { SkyPalette, SkyState } from '../world/skyPalette';
import {
  ACTION_FOR_ITEM,
  createBoatObjectBoundsCache,
  projectBoatObjectBounds,
  projectCachedBoatObjectBounds,
  type BoatObjectBoundsCache,
  type BoatInteractionAnchor,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import {
  BoatSupplyDisplay,
  GENERIC_EVENT_ITEM_USE_DURATION,
} from './BoatSupplyDisplay';
import { CarlitosPresentation } from './CarlitosPresentation';
import { ChestDisplay } from './ChestDisplay';
import { DivePresentation } from './DivePresentation';
import type { DangerousWatersBoatReaction } from './DangerousWatersPresentation';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import { EventPresentationLayer } from './EventPresentationLayer';
import { EventItemEffects } from './EventItemEffects';
import { EventItemUseAdapter } from './EventItemUseAdapter';
import {
  EventItemUseController,
  type EventItemUseRequest,
} from './EventItemUseController';
import {
  resolveEventItemUseContext,
} from './eventItemUseChoreography';
import type {
  EventModelInstance,
  EventModelLibrary,
} from './EventModelLibrary';
import {
  type EventChoicePresentation,
  type FocusedEventPresentationFactories,
} from './FocusedEventPresentation';
import { FeaturedEventPresentations } from './FeaturedEventPresentations';
import {
  isDriftingCargoEventId,
  type DriftingCargoEventId,
} from './events';
import { EventPresentationCoordinator } from './EventPresentationCoordinator';
import {
  eventPresentationRoute,
  isEventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from './eventPresentationTypes';
import { AnglerfishSwarmPresentation } from './events/AnglerfishSwarmPresentation';
import { DeathStarePresentation } from './events/DeathStarePresentation';
import {
  CARLITOS_EVENT_IDS,
  CarlitosEventPresentation,
} from './events/CarlitosEventPresentation';
import { LeakPresentation } from './events/LeakPresentation';
import { SchoolOfFishPresentation } from './events/SchoolOfFishPresentation';
import { SnatcherPresentation } from './events/SnatcherPresentation';
import { WhirlpoolPresentation } from './events/WhirlpoolPresentation';
import { FishingCatchLibrary } from './FishingCatchLibrary';
import { FishingBiteParticles } from './FishingBiteParticles';
import type { FishingCatchId } from './fishingCatalog';
import { WeatherEventAnimator } from './WeatherEventAnimator';
import {
  sampleEventPhysicalResponsePose,
  type EventPhysicalResponsePose,
} from './eventPhysicalResponseChoreography';
import { SupernaturalEventAnimator } from './SupernaturalEventAnimator';
import {
  createSurvivalLantern,
  SURVIVAL_LANTERN_DAY_INTENSITY,
  SURVIVAL_LANTERN_NIGHT_INTENSITY,
  type SurvivalLantern,
} from './SurvivalLantern';
import type {
  ActionOutcome,
  PresentationCue,
  SurvivalSnapshot,
  WeatherId,
} from './survivalTypes';
import {
  EMPTY_SURVIVAL_EVENT_MODELS,
  type SurvivalEventModels,
} from './SurvivalEventModelLibrary';

export const SURVIVAL_CELESTIAL_DIRECTION = Object.freeze([
  0,
  0.24,
  -1,
] as const);

export const WEATHER_IDS = ['calm', 'overcast', 'squall'] as const satisfies readonly WeatherId[];

const CUE_DURATION: Readonly<Record<PresentationCue, number>> = {
  none: 0,
  fish: 1.2,
  dive: 1.4,
  repair: 0.9,
  treat: 0.8,
  storm: 1.2,
  impact: 0.8,
  darkness: 1,
  sighting: 1.2,
  nightfall: 1.1,
  dawn: 1.1,
  rescue: 1.5,
  death: 1.5,
  sinking: 1.5,
};
const EMPTY_EVENT_PHYSICAL_RESPONSE: EventPhysicalResponsePresentation = Object.freeze({
  choiceId: 'sleep',
  actors: Object.freeze([]),
});

const DIVE_SKY_TINT = new Color(0x0d5063);
const DIVE_STARBOARD_POSITION = new Vector3(1.66, 0.76, -1.2);
const DIVE_LEFT_TURN = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2,
);
const SURVIVAL_BOAT_ANCHOR = new Vector3(0, 0.22, 0);
export const FISHING_PLAYER_SEAT = Object.freeze({
  x: 0,
  y: 1.38,
  z: -1.42,
});
const INITIAL_BOAT_POSE: BoatPose = {
  y: 0,
  pitch: 0,
  roll: 0,
  driftX: 0,
  driftZ: 0,
};

interface ActiveSequence {
  cue: PresentationCue;
  elapsed: number;
  duration: number;
  resolve: () => void;
}

export interface FishingCastPoint {
  readonly x: number;
  readonly z: number;
}

type FishingPresentationPhase =
  | 'idle'
  | 'entering'
  | 'ready'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'landed'
  | 'missing'
  | 'returning';

type FishingAnimationKind = 'enter' | 'cast' | 'reel' | 'miss' | 'return';

interface ActiveFishingAnimation {
  readonly kind: FishingAnimationKind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface ActiveMoonAnimation {
  readonly kind: 'reveal' | 'reaction';
  elapsed: number;
  readonly duration: number;
  readonly fromReveal: number;
  readonly fromGrin: number;
  readonly fromStarScale: number;
  readonly fromDim: number;
  readonly fromMoonScale: number;
  readonly fromCameraLower: number;
  readonly targetReveal: number;
  readonly targetGrin: number;
  readonly targetStarScale: number;
  readonly targetDim: number;
  readonly targetMoonScale: number;
  readonly targetCameraLower: number;
  readonly response: EventPhysicalResponsePresentation | null;
  readonly resolve: () => void;
}

interface ActiveCarlitosDelegation {
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

interface FishingVisuals {
  readonly root: Group;
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly linePositions: Float32Array;
  readonly linePositionAttribute: BufferAttribute;
  readonly bobber: Group;
  readonly splash: Group;
  readonly catchDisplay: Group;
}

function createDedicatedEventCoordinator(
  environment: DedicatedEventEnvironment,
): EventPresentationCoordinator {
  const eventModels = {
    create: ((id: string): EventModelInstance => {
      const model = environment.eventModels.create(id as never) as Group | EventModelInstance;
      if (!(model instanceof Group)) return model;
      return { root: model, dispose: () => undefined };
    }),
    animations: (id: never) => environment.eventModels.animations(id),
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
  const dedicatedEnvironment = { ...environment, eventModels };
  const presentations: DedicatedEventPresentation[] = [];
  try {
    presentations.push(new LeakPresentation(dedicatedEnvironment));
    presentations.push(new SchoolOfFishPresentation(dedicatedEnvironment));
    presentations.push(new SnatcherPresentation(dedicatedEnvironment));
    presentations.push(new DeathStarePresentation(dedicatedEnvironment));
    presentations.push(new AnglerfishSwarmPresentation(dedicatedEnvironment));
    presentations.push(new WhirlpoolPresentation(dedicatedEnvironment));
    for (const eventId of CARLITOS_EVENT_IDS) {
      presentations.push(new CarlitosEventPresentation(
        eventId,
        dedicatedEnvironment,
      ));
    }
    return new EventPresentationCoordinator(presentations);
  } catch (error) {
    try {
      runCleanupSteps(presentations.map((presentation) => (
        () => presentation.dispose()
      )));
    } catch {
      // Preserve the construction error while releasing every completed sibling.
    }
    throw error;
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const easeInOut = (value: number): number => value * value * (3 - 2 * value);
const smootherStep = (value: number): number =>
  value * value * value * (value * (value * 6 - 15) + 10);

const FISHING_CAMERA_DURATION = 1.1;
const FISHING_CAST_DURATION = 0.8;
const FISHING_REEL_DURATION = 1;
const FISHING_MISS_DURATION = 0.8;
const FISHING_SPLASH_HOLD_DURATION = 0.12;
const FISHING_CAST_MIN_X = -2.7;
const FISHING_CAST_MAX_X = 2.7;
const FISHING_CAST_MIN_Z = -10.5;
const FISHING_CAST_MAX_Z = -4.8;
const CENTERED_FISHING_CAST: FishingCastPoint = Object.freeze({ x: 0, z: -6.4 });
const FISHING_ROD_LEAN = MathUtils.degToRad(-22);
const FISHING_TARGET_SIZE = 52;
const FISHING_BITE_PARTICLE_INTERVAL_SECONDS = 0.12;
const FISHING_BITE_PARTICLE_INTENSITY = 0.85;
const MOON_FACE_REVEAL_DURATION = 5.8;
const MOON_FACE_REACTION_DURATION = 1.1;
const MOON_FACE_HOLD_FRACTION = 0.2;
const MOON_FACE_SHOCK_START = 0.7;
const MOON_FACE_SHOCK_END = 0.84;
const MOON_FACE_BASE_GRIN = 0.74;
const MOON_FACE_STAR_SCALE = 0.16;
const MOON_FACE_MOON_SCALE = 4.15;
const MOON_FACE_BASE_DIM = 0.18;
const MOON_FACE_PRESSURE_GRIN = 0.96;
const MOON_FACE_ENERGY_DIM = 0.48;
const MOON_FACE_CAMERA_LOWER = 0.2;
const FISHING_CATCH_BOW_REST = Object.freeze({
  x: 0,
  y: 0.43,
  z: -2.52,
});
const DRIFTING_LOOT_STERN_REST = Object.freeze({
  x: 0.72,
  y: 0.58,
  z: 1.05,
});
const CHECK_BACK_STERN_FLOOR = Object.freeze({
  x: 0,
  y: -0.16,
  z: 2.3,
});
const CARLITOS_DELEGATE_DURATION = 1.45;
const CARLITOS_DELEGATE_OFFSET = Object.freeze({
  x: 0.08,
  y: -0.04,
  z: 2.08,
});

function addOwnedFishingMesh(
  root: Group,
  geometry: BufferGeometry,
  material: Material,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): Mesh {
  geometries.add(geometry);
  materials.add(material);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function localTipOf(root: Object3D): Vector3 {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const localMatrix = new Matrix4();
  const point = new Vector3();
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (positions === undefined) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(localMatrix);
      minimumZ = Math.min(minimumZ, point.z);
      maximumZ = Math.max(maximumZ, point.z);
    }
  });

  if (!Number.isFinite(minimumZ) || !Number.isFinite(maximumZ)) {
    throw new Error('Fishing rod model has no position data.');
  }

  const tipDepth = Math.max((maximumZ - minimumZ) * 0.00001, 1e-7);
  const tip = new Vector3();
  let tipVertexCount = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (positions === undefined) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(localMatrix);
      if (point.z < maximumZ - tipDepth) continue;
      tip.x += point.x;
      tip.y += point.y;
      tipVertexCount += 1;
    }
  });

  if (tipVertexCount === 0) throw new Error('Fishing rod model has no tip vertices.');
  tip.x /= tipVertexCount;
  tip.y /= tipVertexCount;
  tip.z = maximumZ;
  return tip;
}

function createFishingVisuals(
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): FishingVisuals {
  const root = new Group();
  root.name = 'fishing-presentation';

  const linePositions = new Float32Array(15);
  const lineGeometry = new BufferGeometry();
  const linePositionAttribute = new BufferAttribute(linePositions, 3);
  lineGeometry.setAttribute('position', linePositionAttribute);
  const lineMaterial = new LineBasicMaterial({ color: 0x3d3429 });
  geometries.add(lineGeometry);
  materials.add(lineMaterial);
  const line = new Line(lineGeometry, lineMaterial);
  line.name = 'fishing-line';
  line.frustumCulled = false;
  line.visible = false;
  root.add(line);

  const bobber = new Group();
  bobber.name = 'fishing-bobber';
  const bobberGeometry = new SphereGeometry(0.105, 7, 5);
  const bobberMaterial = new MeshStandardMaterial({
    color: 0xd9573f,
    roughness: 0.76,
    flatShading: true,
  });
  const bobberMesh = addOwnedFishingMesh(
    bobber,
    bobberGeometry,
    bobberMaterial,
    geometries,
    materials,
  );
  bobberMesh.position.y = 0.075;
  bobber.visible = false;
  root.add(bobber);

  const splash = new Group();
  splash.name = 'fishing-splash';
  const splashGeometry = new SphereGeometry(0.035, 5, 3);
  const splashMaterial = new MeshStandardMaterial({
    color: 0xd9e6e1,
    roughness: 0.42,
    transparent: true,
    opacity: 0.72,
    flatShading: true,
  });
  for (let index = 0; index < 6; index += 1) {
    const droplet = addOwnedFishingMesh(
      splash,
      splashGeometry,
      splashMaterial,
      geometries,
      materials,
    );
    const angle = index * Math.PI * 2 / 6;
    droplet.position.set(Math.cos(angle) * 0.18, 0.07 + (index % 2) * 0.08, Math.sin(angle) * 0.18);
  }
  splash.visible = false;
  root.add(splash);

  const catchDisplay = new Group();
  catchDisplay.name = 'fishing-catch-display';
  catchDisplay.visible = false;
  root.add(catchDisplay);

  return {
    root,
    line,
    linePositions,
    linePositionAttribute,
    bobber,
    splash,
    catchDisplay,
  };
}

export function createEmptyEventModelLibraryForTest(): EventModelLibrary {
  return {
    create: () => new Group(),
    animations: () => [],
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
}

function isEventModelLibrary(
  models: SurvivalEventModels | EventModelLibrary | FocusedEventPresentationFactories | undefined,
): models is EventModelLibrary {
  return models !== undefined && 'create' in models;
}

function isFocusedEventFactoryMap(
  models: SurvivalEventModels | EventModelLibrary | FocusedEventPresentationFactories | undefined,
): models is FocusedEventPresentationFactories {
  return models !== undefined
    && !('clone' in models)
    && !('create' in models);
}

export class BoatWorld {
  readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly ocean: OceanRenderer;
  private readonly sky: Skybox;
  private readonly weatherEffects: WeatherEffects;
  private readonly motionRig = new Group();
  private readonly cueCameraRig = new Group();
  private readonly featuredEventCameraRig = new Group();
  private readonly cameraEffectsRoot = new Group();
  private readonly cameraRig = new Group();
  private readonly boatEffectsRoot = new Group();
  private readonly boat: Group;
  private readonly lantern: SurvivalLantern;
  private readonly ambient = new AmbientLight(0xc4d1cf, 1.1);
  private readonly key = new DirectionalLight(0xffe1b5, 2.2);
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
  private readonly oceanAtmosphere = {
    fogColor: new Color(),
    horizonColor: new Color(),
    skyColor: new Color(),
    sunColor: new Color(0xfff1cf),
    sunVisibility: 1,
  };
  private readonly waterExclusion: LifeboatBuild['waterExclusion'];
  private readonly originalCameraParent: Object3D | null;
  private readonly originalCameraPosition: Vector3;
  private readonly originalCameraQuaternion: Quaternion;
  private readonly baseCameraPosition = new Vector3();
  private readonly baseCameraQuaternion: Quaternion;
  private readonly baseCameraLookTarget = new Vector3(0, 0.88, -1.55);
  private readonly fishingCameraPosition = new Vector3(
    FISHING_PLAYER_SEAT.x,
    FISHING_PLAYER_SEAT.y,
    FISHING_PLAYER_SEAT.z,
  );
  private readonly fishingCameraAngleOrigin = new Vector3(0, 1.38, -1.42);
  private readonly fishingCameraLookTarget = new Vector3(0, -0.42, -7.4);
  private readonly fishingCameraQuaternion = new Quaternion();
  private readonly diveStarboardQuaternion = new Quaternion();
  private readonly divePresentation: DivePresentation;
  private readonly diveWaveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly diveWaterEntryWorldPosition = new Vector3();
  private activeDiveItemId: ItemInstanceId | null = null;
  private diveElapsed = 0;
  private readonly fishingCameraStartPosition = new Vector3();
  private readonly fishingCameraStartQuaternion = new Quaternion();
  private readonly fishingMatrixScratch = new Matrix4();
  private readonly supplyDisplay: BoatSupplyDisplay;
  private readonly carlitos: CarlitosPresentation;
  private readonly carlitosDelegateBasePosition = new Vector3();
  private readonly carlitosDelegateBaseRotation = new Vector3();
  private activeCarlitosDelegation: ActiveCarlitosDelegation | null = null;
  private readonly chestDisplay: ChestDisplay;
  private readonly itemEffects: EventItemEffects;
  private readonly itemUseAdapter: EventItemUseAdapter;
  private readonly itemUseController: EventItemUseController;
  private readonly dedicatedEvents: EventPresentationCoordinator | null;
  private chestState: SurvivalSnapshot['chest']['state'] = 'none';
  private readonly toolHoverOutline = new HoverOutline();
  private readonly weatherEventAnimator: WeatherEventAnimator;
  private readonly supernaturalEventAnimator: SupernaturalEventAnimator;
  private readonly eventPresentation: EventPresentationLayer;
  private readonly dangerousWatersBoatReaction: DangerousWatersBoatReaction = {
    driftX: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    cameraYaw: 0,
    cameraZ: 0,
    lightScale: 1,
    supplyRoll: 0,
    supplyLift: 0,
  };
  private readonly driftingCargoSternRest = new Object3D();
  private readonly checkBackSternFloor = new Object3D();
  private readonly featuredEvents: FeaturedEventPresentations;
  private activeFeaturedEventId: FeaturedEventId | null = null;
  private readonly repairTools: Object3D;
  private readonly supplyAnchorBounds = new Map<
    BoatSupplyGroupId,
    BoatObjectBoundsCache | null
  >();
  private readonly fishingAnchorBounds: BoatObjectBoundsCache | null;
  private readonly repairAnchorBounds: BoatObjectBoundsCache | null;
  private readonly lanternAnchorBounds: BoatObjectBoundsCache | null;
  private readonly chestAnchorBounds: BoatObjectBoundsCache | null;
  private readonly carlitosAnchorBounds: BoatObjectBoundsCache | null;
  private readonly rodPivot = new Group();
  private readonly rod: Object3D;
  private readonly fishingLineOrigin = new Object3D();
  private readonly fishingCatchRest = new Group();
  private readonly fishingCatches: FishingCatchLibrary;
  private readonly fishingBiteParticles = new FishingBiteParticles();
  private readonly fishing: FishingVisuals;
  private readonly baseRodPivotRotationX: number;
  private readonly vortexWave = createInactiveVortexWaveState();
  private readonly sampleWorldWave = (
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ): WaveSample => sampleWaveField(
    DEFAULT_WAVES,
    time,
    x,
    z,
    amplitudeScale,
    this.vortexWave,
  );
  private readonly sampleWorldWaveInto = (
    output: WaveSample,
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ): void => sampleWaveFieldInto(
    output,
    DEFAULT_WAVES,
    time,
    x,
    z,
    amplitudeScale,
    this.vortexWave,
  );
  private readonly readWorldWaveAmplitudeScale = (): number => (
    this.weatherProfile.waveScale
  );
  private readonly buoyancy = new BoatBuoyancy(
    this.sampleWorldWave,
    undefined,
    this.sampleWorldWaveInto,
  );
  private readonly boatPose: BoatPose = { ...INITIAL_BOAT_POSE };
  private readonly boatTargetPose: BoatPose = { ...INITIAL_BOAT_POSE };
  private readonly worldCameraPosition = new Vector3();
  private readonly fishingRaycaster = new Raycaster();
  private readonly fishingInteractionPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly fishingNdc = new Vector2();
  private readonly fishingRayHit = new Vector3();
  private readonly fishingLineOriginWorld = new Vector3();
  private readonly fishingLineEndWorld = new Vector3();
  private readonly fishingReelStartWorld = new Vector3();
  private readonly fishingCatchTargetWorld = new Vector3();
  private readonly fishingCatchApproachWorld = new Vector3();
  private readonly fishingProjectionWorld = new Vector3();
  private readonly fishingProjectionCamera = new Vector3();
  private readonly fishingWaveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly fishingCastPosition = new Vector3();
  private readonly fishingProjection: ProjectedBoatBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
    visible: false,
  };
  private activeFishingAnimation: ActiveFishingAnimation | null = null;
  private activeMoonAnimation: ActiveMoonAnimation | null = null;
  private readonly moonFace: {
    reveal: number;
    grin: number;
    starScale: number;
    dim: number;
    scale: number;
  } = {
    reveal: 0,
    grin: 0,
    starScale: 1,
    dim: 0,
    scale: 1,
  };
  private readonly moonFaceDisplay = {
    reveal: 0,
    grin: 0,
    starScale: 1,
    dim: 0,
    scale: 1,
  };
  private moonPulseElapsed = 0;
  private moonCameraLower = 0;
  private moonEventStaged = false;
  private readonly moonItemAimTarget = new Object3D();
  private readonly moonPhysicalResponsePose: EventPhysicalResponsePose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
  private fishingPhase: FishingPresentationPhase = 'idle';
  private activeFishingCatch: Object3D | null = null;
  private hasFishingCast = false;
  private fishingCastOriginY = 0;
  private fishingWaveHeight = 0;
  private fishingSplashHoldRemaining = 0;
  private fishingBiteParticleCooldown = 0;
  private fishingBiteParticlesActive = false;
  private currentTime = 0;
  private readonly skyState: SkyState = {
    weather: 'calm',
    phase: 'day',
    severity: 0,
  };
  private weatherProfile: Readonly<PresentationWeatherProfile> =
    presentationWeatherProfile('calm');
  private phase: 'day' | 'night' = 'day';
  private presentationPhaseOverride: 'day' | 'night' | null = null;
  private activeSequence: ActiveSequence | null = null;
  private settledCue: PresentationCue | null = null;
  private weatherEventOperation = 0;
  private lightningStrikePending = false;
  private lightningStrikeListener: (() => void) | null = null;
  private readonly queueLightningStrike = (): void => {
    this.lightningStrikePending = true;
  };
  private disposed = false;
  private readonly eventModels: EventModelLibrary;

  constructor(
    camera: PerspectiveCamera,
    propModels: PropModelLibrary,
    moonTexture: Texture,
    savedItems: readonly ItemInstance[] = [],
    lifeboatAssets?: LifeboatAssets,
    shipFurniture?: ShipFurnitureLibrary,
    waterQuality: WaterQuality = 'low',
    models?: SurvivalEventModels | EventModelLibrary | FocusedEventPresentationFactories,
    eventModels?: EventModelLibrary,
    focusedEventFactories: FocusedEventPresentationFactories = {},
    renderer?: WebGLRenderer,
  ) {
    const resolvedFocusedFactories = isFocusedEventFactoryMap(models)
      ? models
      : focusedEventFactories;
    const featuredEventModels = isEventModelLibrary(models)
      || isFocusedEventFactoryMap(models)
      ? undefined
      : models;
    const dedicatedEventModels = eventModels
      ?? (isEventModelLibrary(models) ? models : undefined);
    this.eventModels = dedicatedEventModels ?? createEmptyEventModelLibraryForTest();
    this.scene = new Scene();
    this.camera = camera;
    this.moonItemAimTarget.name = 'moon-event-item-aim-target';
    this.moonItemAimTarget.position
      .set(...SURVIVAL_CELESTIAL_DIRECTION)
      .normalize()
      .multiplyScalar(60);
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();
    const resolvedEventModels = featuredEventModels ?? (
      shipFurniture === undefined
        ? EMPTY_SURVIVAL_EVENT_MODELS
        : {
            clone: (id) => {
              if (id === 'driftingBarrel') return shipFurniture.clone('barrel');
              return EMPTY_SURVIVAL_EVENT_MODELS.clone(id);
            },
          } satisfies SurvivalEventModels
    );

    let sky: Skybox | null = null;
    let weatherEffects: WeatherEffects | null = null;
    let lantern: SurvivalLantern | null = null;
    let carlitos: CarlitosPresentation | null = null;
    let supplyDisplay: BoatSupplyDisplay | null = null;
    let chestDisplay: ChestDisplay | null = null;
    let itemUseAdapter: EventItemUseAdapter | null = null;
    let itemUseController: EventItemUseController | null = null;
    let dedicatedEvents: EventPresentationCoordinator | null = null;
    let weatherEventAnimator: WeatherEventAnimator | null = null;
    let supernaturalEventAnimator: SupernaturalEventAnimator | null = null;
    let divePresentation: DivePresentation | null = null;
    let fishingCatches: FishingCatchLibrary | null = null;
    let eventPresentation: EventPresentationLayer | null = null;
    let featuredEvents: FeaturedEventPresentations | null = null;
    let ocean: OceanRenderer | null = null;
    try {
      sky = new Skybox(
        this.scene,
        this.skyState,
        moonTexture,
        {
          sun: SURVIVAL_CELESTIAL_DIRECTION,
          moon: SURVIVAL_CELESTIAL_DIRECTION,
        },
      );
      this.sky = sky;
      weatherEffects = new WeatherEffects(this.scene);
      this.weatherEffects = weatherEffects;
      weatherEffects.setLightningStrikeListener(this.queueLightningStrike);

      const resolvedLifeboatAssets = lifeboatAssets ?? LifeboatAssets.fromTextures(
        new Texture(),
        new Texture(),
        new Texture(),
      );
      if (lifeboatAssets === undefined) {
        this.ownedTextures.add(resolvedLifeboatAssets.color);
        this.ownedTextures.add(resolvedLifeboatAssets.roughness);
        this.ownedTextures.add(resolvedLifeboatAssets.normal);
      }
      const build = createLifeboat(resolvedLifeboatAssets);
      this.boat = build.root;
      this.waterExclusion = build.waterExclusion;
      collectMeshResources(this.boat, this.ownedGeometries, this.ownedMaterials);
      this.fishingCatchRest.name = 'fishing-catch-bow-rest';
      this.fishingCatchRest.position.set(
        FISHING_CATCH_BOW_REST.x,
        FISHING_CATCH_BOW_REST.y,
        FISHING_CATCH_BOW_REST.z,
      );
      this.boat.add(this.fishingCatchRest);
      this.driftingCargoSternRest.name = 'drifting-cargo-stern-rest';
      this.driftingCargoSternRest.position.set(
        DRIFTING_LOOT_STERN_REST.x,
        DRIFTING_LOOT_STERN_REST.y,
        DRIFTING_LOOT_STERN_REST.z,
      );
      this.boat.add(this.driftingCargoSternRest);
      this.checkBackSternFloor.name = 'check-back-stern-floor';
      this.checkBackSternFloor.position.set(
        CHECK_BACK_STERN_FLOOR.x,
        CHECK_BACK_STERN_FLOOR.y,
        CHECK_BACK_STERN_FLOOR.z,
      );
      this.boat.add(this.checkBackSternFloor);
      lantern = createSurvivalLantern(propModels.createPracticalLight('lantern'));
      this.lantern = lantern;
      this.boat.add(lantern.root);

      carlitos = new CarlitosPresentation(propModels);
      this.carlitos = carlitos;
      this.captureCarlitosDelegateBase();
      this.boat.add(carlitos.root);

      supplyDisplay = new BoatSupplyDisplay(
        propModels,
        build.storageRoot,
        savedItems,
      );
      this.supplyDisplay = supplyDisplay;
      chestDisplay = new ChestDisplay(
        featuredEventModels === undefined
          ? propModels.createEventModel('chestClosed')?.root ?? null
          : resolvedEventModels.clone('mysteryChest'),
      );
      this.chestDisplay = chestDisplay;
      this.itemEffects = new EventItemEffects();
      itemUseAdapter = new EventItemUseAdapter(this.camera, this.itemEffects);
      this.itemUseAdapter = itemUseAdapter;
      itemUseController = new EventItemUseController(
        this.supplyDisplay,
        this.itemUseAdapter,
      );
      this.itemUseController = itemUseController;
      this.cameraEffectsRoot.name = 'dedicated-event-camera-effects';
      this.boatEffectsRoot.name = 'dedicated-event-boat-effects';
      dedicatedEvents = dedicatedEventModels === undefined
        ? null
        : createDedicatedEventCoordinator({
            eventModels: dedicatedEventModels,
            supplies: this.supplyDisplay,
            carlitos: this.carlitos,
            vortexWave: this.vortexWave,
            sampleWorldWaveInto: this.sampleWorldWaveInto,
            readWorldWaveAmplitudeScale: this.readWorldWaveAmplitudeScale,
            cameraEffectsRoot: this.cameraEffectsRoot,
            boatEffectsRoot: this.boatEffectsRoot,
            camera: this.camera,
          });
      this.dedicatedEvents = dedicatedEvents;
      if (this.dedicatedEvents !== null) {
        this.boat.add(this.dedicatedEvents.boatRoot);
      }
      this.boat.add(this.chestDisplay.root);
      weatherEventAnimator = new WeatherEventAnimator(
        this.cameraRig,
        this.supplyDisplay,
        this.eventModels,
        this.camera,
      );
      this.weatherEventAnimator = weatherEventAnimator;
      supernaturalEventAnimator = new SupernaturalEventAnimator(
        this.cameraRig,
        this.supplyDisplay,
        this.eventModels,
        this.camera,
      );
      this.supernaturalEventAnimator = supernaturalEventAnimator;
      this.boat.add(this.weatherEventAnimator.boatRoot);

      const repairTools = createRepairToolbox();
      repairTools.position.set(-1.05, 0.225, 0.78);
      repairTools.rotation.y = -Math.PI / 2;
      repairTools.scale.setScalar(0.72);
      this.boat.add(repairTools);
      collectMeshResources(repairTools, this.ownedGeometries, this.ownedMaterials);
      this.repairTools = repairTools;

      this.rodPivot.name = 'fishing-rod-pivot';
      this.rodPivot.position.set(0, 0.56, -2.28);
      this.rodPivot.rotation.x = FISHING_ROD_LEAN;
      this.rod = propModels.createEquipment('fishingRod');
      collectMeshResources(this.rod, this.ownedGeometries, this.ownedMaterials);
      this.rod.position.set(0, 0, -0.9);
      this.rod.rotation.x = -Math.PI / 2;
      this.fishingLineOrigin.name = 'fishing-line-origin';
      this.fishingLineOrigin.position.copy(localTipOf(this.rod));
      this.rod.add(this.fishingLineOrigin);
      this.rodPivot.add(this.rod);
      this.boat.add(this.rodPivot);
      collectMeshResources(this.rodPivot, this.ownedGeometries, this.ownedMaterials);

      this.motionRig.name = 'boat-motion-rig';
      this.cueCameraRig.name = 'boat-cue-camera-rig';
      this.featuredEventCameraRig.name = 'boat-featured-event-camera-rig';
      this.cameraRig.name = 'boat-camera-rig';
      this.motionRig.add(this.boatEffectsRoot, this.cueCameraRig);
      this.boatEffectsRoot.add(this.boat);
      this.cueCameraRig.add(this.featuredEventCameraRig);
      this.featuredEventCameraRig.add(this.cameraEffectsRoot);
      this.cameraEffectsRoot.add(this.cameraRig);
      this.cameraRig.add(camera);
      camera.position.set(0, 0.88, 1.72);
      camera.lookAt(this.baseCameraLookTarget);
      this.baseCameraPosition.copy(camera.position);
      this.baseCameraQuaternion = camera.quaternion.clone();
      this.diveStarboardQuaternion.copy(this.baseCameraQuaternion)
        .multiply(DIVE_LEFT_TURN);
      divePresentation = new DivePresentation({
        camera,
        starboardPosition: DIVE_STARBOARD_POSITION,
        starboardQuaternion: this.diveStarboardQuaternion,
        goggleModel: propModels.create({
          instanceId: 'dive-goggles-model' as ItemInstanceId,
          type: 'scubaSet',
        }),
      });
      this.divePresentation = divePresentation;
      this.fishingMatrixScratch.lookAt(
        this.fishingCameraAngleOrigin,
        this.fishingCameraLookTarget,
        camera.up,
      );
      this.fishingCameraQuaternion.setFromRotationMatrix(this.fishingMatrixScratch);
      this.baseRodPivotRotationX = this.rodPivot.rotation.x;

      fishingCatches = new FishingCatchLibrary();
      this.fishingCatches = fishingCatches;
      this.fishing = createFishingVisuals(this.ownedGeometries, this.ownedMaterials);
      eventPresentation = new EventPresentationLayer({
        propModels,
        waves: DEFAULT_WAVES,
        cameraRig: this.cameraRig,
        camera: this.camera,
        boatMotionRoot: this.motionRig,
        supplyDisplay: this.supplyDisplay,
        chestDisplay: this.chestDisplay,
      }, resolvedFocusedFactories);
      this.eventPresentation = eventPresentation;
      featuredEvents = new FeaturedEventPresentations(
        resolvedEventModels,
        this.camera,
        this.driftingCargoSternRest,
        this.checkBackSternFloor,
      );
      this.featuredEvents = featuredEvents;
      ocean = new OceanRenderer(
        waterQuality,
        SURVIVAL_CELESTIAL_DIRECTION,
      );
      this.ocean = ocean;
      this.key.target.position.set(0, 0, -3);
      alignDirectionalLightWithSun(
        this.key,
        12,
        SURVIVAL_CELESTIAL_DIRECTION,
      );
      this.key.castShadow = true;

      this.scene.add(
        this.motionRig,
        this.moonItemAimTarget,
        this.ocean.mesh,
        this.ambient,
        this.key,
        this.key.target,
        this.featuredEvents.root,
        this.eventPresentation.root,
        this.weatherEventAnimator.worldRoot,
        this.supernaturalEventAnimator.worldRoot,
        this.itemEffects.root,
        ...(this.dedicatedEvents === null
          ? []
          : [this.dedicatedEvents.worldRoot]),
        this.fishing.root,
        this.fishingBiteParticles.points,
      );
      for (const record of this.supplyDisplay.records()) {
        this.supplyAnchorBounds.set(
          record.groupId,
          createBoatObjectBoundsCache(record.root),
        );
      }
      this.fishingAnchorBounds = createBoatObjectBoundsCache(this.rodPivot);
      this.repairAnchorBounds = createBoatObjectBoundsCache(this.repairTools);
      this.lanternAnchorBounds = createBoatObjectBoundsCache(this.lantern.root);
      this.chestAnchorBounds = createBoatObjectBoundsCache(this.chestDisplay.root);
      this.carlitosAnchorBounds = createBoatObjectBoundsCache(
        this.carlitos.interactionRoot,
      );
      if (renderer !== undefined) {
        void this.eventPresentation.prepareRender(
          renderer,
          this.scene,
          this.camera,
        ).catch(() => undefined);
      }
      this.applyBasePresentation();
    } catch (error) {
      try {
        runCleanupSteps([
          () => ocean?.dispose(),
          () => featuredEvents?.dispose(),
          () => eventPresentation?.dispose(),
          () => fishingCatches?.dispose(),
          () => divePresentation?.dispose(),
          () => supernaturalEventAnimator?.dispose(),
          () => weatherEventAnimator?.dispose(),
          () => dedicatedEvents?.dispose(),
          () => itemUseController?.dispose(),
          () => itemUseAdapter?.dispose(),
          () => chestDisplay?.dispose(),
          () => supplyDisplay?.dispose(),
          () => carlitos?.dispose(),
          () => this.toolHoverOutline.dispose(),
          () => lantern?.dispose(),
          () => weatherEffects?.dispose(),
          () => this.fishingBiteParticles.dispose(),
          () => sky?.dispose(),
          () => this.scene.clear(),
          () => camera.removeFromParent(),
          () => camera.position.copy(this.originalCameraPosition),
          () => camera.quaternion.copy(this.originalCameraQuaternion),
          () => this.originalCameraParent?.add(camera),
          () => disposeResourceSets(
            this.ownedGeometries,
            this.ownedMaterials,
            this.ownedTextures,
          ),
        ]);
      } catch {
        // Preserve the construction error after every owned resource runs.
      }
      throw error;
    }
  }

  setPhase(phase: 'day' | 'night'): void {
    if (this.disposed) return;
    const previous = this.phase;
    this.phase = phase;
    this.skyState.phase = this.presentationPhaseOverride ?? phase;
    if (previous === 'night' && phase === 'day') {
      this.supplyDisplay.releaseDayStowedItems();
    }
  }

  setPresentationPhaseOverride(phase: 'day' | 'night' | null): void {
    if (this.disposed) return;
    this.presentationPhaseOverride = phase;
    this.skyState.phase = phase ?? this.phase;
  }

  setWeather(weather: WeatherId): void {
    this.setPresentationWeather(weather);
  }

  setPresentationWeather(id: PresentationWeatherId): void {
    if (this.disposed) return;
    this.weatherProfile = presentationWeatherProfile(id);
    this.skyState.weather = this.weatherProfile.skyWeather;
    this.weatherEffects.setWeather(id);
  }

  setLightningStrikeListener(listener: () => void): void {
    this.lightningStrikeListener = listener;
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.ocean.setQuality(value);
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.supplyDisplay.sync(snapshot);
    this.carlitos.sync(snapshot.carlitos);
    this.chestState = snapshot.chest.state;
    this.chestDisplay.sync(snapshot.chest);
  }

  playCarlitosAction(
    action: 'petCarlitos' | 'feedCarlitos',
  ): Promise<void> {
    return this.carlitos.play(action === 'petCarlitos' ? 'pet' : 'feed');
  }

  playDive(instanceId: ItemInstanceId, onWaterImpact: () => void): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.clearDivePresentation();
    this.activeDiveItemId = instanceId;
    this.diveElapsed = 0;
    this.supplyDisplay.setPresentationItemHidden(instanceId, true);
    return this.divePresentation.start(onWaterImpact);
  }

  clearDivePresentation(): void {
    this.divePresentation.clear();
    if (this.activeDiveItemId !== null) {
      this.supplyDisplay.setPresentationItemHidden(this.activeDiveItemId, false);
      this.activeDiveItemId = null;
    }
    this.diveElapsed = 0;
  }

  setHighlightedItem(instanceId: string | null): void {
    if (this.disposed) return;
    this.supplyDisplay.setHighlighted(instanceId);
    const focusedRoot = instanceId === null
      ? null
      : this.eventPresentation.interactionRoot(instanceId);
    this.toolHoverOutline.setTarget(
      instanceId === 'repair-tools'
        ? this.repairTools
        : instanceId === 'carlitos'
          ? this.carlitos.interactionRoot
        : instanceId === 'end-day-lantern'
          ? this.lantern.root
          : instanceId === 'persistent-chest'
            ? this.chestDisplay.root
          : focusedRoot !== null
            ? focusedRoot.userData.disableHoverOutline === true
              ? null
              : focusedRoot
          : instanceId?.startsWith('event:') === true
            ? this.activeFeaturedEventId === null
              ? null
              : this.featuredEvents.interactionRoot(this.activeFeaturedEventId)
            : null,
    );
  }

  setEventEligibleItems(instanceIds: ReadonlySet<ItemInstanceId> | null): void {
    if (this.disposed) return;
    this.supplyDisplay.setEventEligibleItems(instanceIds);
  }

  setEventSelectedItem(instanceId: ItemInstanceId | null): void {
    if (this.disposed) return;
    this.supplyDisplay.setEventSelectedItem(instanceId);
  }

  async playEventItemUse(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    onAction?: (cueIndex: number) => void,
  ): Promise<void> {
    if (this.disposed) return;
    const operation = ++this.weatherEventOperation;
    this.itemUseController.clear(this.phase);
    if (
      eventId === 'flowers'
      && choiceId === 'carlitos'
      && instanceId === 'carlitos-1'
    ) {
      await this.carlitos.play('pet', GENERIC_EVENT_ITEM_USE_DURATION);
      return;
    }
    const itemId = this.supplyDisplay.itemType(instanceId);
    if (itemId !== null && DAY_ACTION_ONLY_ITEM_IDS.includes(itemId)) return;
    const context = itemId === null
      ? null
      : resolveEventItemUseContext(eventId, choiceId, itemId);
    if (itemId !== null && context !== null) {
      const aimTarget = this.eventItemAimTarget(eventId);
      const request: EventItemUseRequest = {
        eventId,
        choiceId,
        instanceId,
        itemId,
        context,
        aimTarget,
        onAction,
      };
      const [played] = await Promise.all([
        this.itemUseController.play(request),
        this.playEventSceneItemUse(eventId, choiceId, instanceId),
      ]);
      if (this.disposed || operation !== this.weatherEventOperation) return;
      if (!played) {
        await this.supplyDisplay.playEventItemUse(instanceId);
      }
      return;
    }
    if (
      this.hasEventSceneItemUse(eventId, choiceId)
      && await this.playEventSceneItemUse(eventId, choiceId, instanceId)
    ) return;
    if (this.disposed || operation !== this.weatherEventOperation) return;
    await this.supplyDisplay.playEventItemUse(instanceId);
  }

  returnEventItemUse(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.itemUseController.recover();
  }

  private playEventSceneItemUse(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (eventId === 'dangerous-waters') {
      return this.eventPresentation.playDangerousWatersItemUse(choiceId, instanceId);
    }
    if (this.dedicatedEvents?.handles(eventId)) {
      return this.dedicatedEvents.playItemUse(choiceId, instanceId);
    }
    if (this.weatherEventAnimator.supportsItemUse(eventId, choiceId)) {
      return this.weatherEventAnimator.playItemUse(eventId, choiceId, instanceId);
    }
    if (this.supernaturalEventAnimator.supportsItemUse(eventId, choiceId)) {
      return this.supernaturalEventAnimator.playItemUse(eventId, choiceId, instanceId);
    }
    return Promise.resolve(false);
  }

  private hasEventSceneItemUse(eventId: string, choiceId: string): boolean {
    return eventId === 'dangerous-waters'
      || this.dedicatedEvents?.handles(eventId) === true
      || this.weatherEventAnimator.supportsItemUse(eventId, choiceId)
      || this.supernaturalEventAnimator.supportsItemUse(eventId, choiceId);
  }

  playEventChoice(
    eventId: string,
    choice: string | EventChoicePresentation,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.weatherEventOperation += 1;
    if (typeof choice === 'string' || choice.instanceId === null) {
      this.itemUseController.clear(this.phase);
    }
    if (this.dedicatedEvents?.handles(eventId)) {
      return this.dedicatedEvents.playChoice(
        typeof choice === 'string' ? choice : choice.choiceId,
      );
    }
    return this.eventPresentation.playChoice(eventId, choice);
  }

  stageEvent(context: EventSceneContext): void;
  stageEvent(
    eventId: string,
    variantSeed?: number,
  ): void;
  stageEvent(
    eventOrContext: string | EventSceneContext,
    variantSeed?: number,
  ): void {
    if (this.disposed) return;
    this.finishCarlitosDelegation();
    this.weatherEventOperation += 1;
    this.itemUseController.clear(this.phase);
    const eventId = typeof eventOrContext === 'string'
      ? eventOrContext
      : eventOrContext.eventId;
    const resolvedVariantSeed = typeof eventOrContext === 'string'
      ? variantSeed
      : eventOrContext.variantSeed;
    if (eventId === 'night-calm-fallback') {
      this.clearEvent();
      return;
    }
    const route = eventPresentationRoute(eventId);
    if (route === null) throw new Error(`Missing event presentation route: ${eventId}`);
    if (route === 'dedicated' && this.dedicatedEvents?.handles(eventId)) {
      const context = typeof eventOrContext === 'string'
        ? {
            eventId,
            targetInstanceId: null,
            variantSeed: variantSeed ?? 0,
          } as EventSceneContext
        : eventOrContext;
      this.eventPresentation.clear();
      this.weatherEventAnimator.clear();
      this.featuredEvents.clear();
      this.activeFeaturedEventId = null;
      this.supernaturalEventAnimator.clear();
      this.clearMoonEvent();
      this.dedicatedEvents.stage(context);
      return;
    }
    this.dedicatedEvents?.clear();
    this.resetDedicatedEffects();
    Object.assign(this.vortexWave, createInactiveVortexWaveState());
    if (route === 'focused') {
      this.featuredEvents.clear();
      this.activeFeaturedEventId = null;
      this.stageMoonEvent(eventId);
      if (variantSeed === undefined) this.eventPresentation.stage(eventId);
      else this.eventPresentation.stage(eventId, variantSeed);
      this.weatherEventAnimator.stage(eventId);
      this.supernaturalEventAnimator.clear();
      return;
    }
    if (route === 'featured') {
      this.eventPresentation.clear();
      this.featuredEvents.stage(eventId, variantSeed);
      this.activeFeaturedEventId = eventId as FeaturedEventId;
      this.weatherEventAnimator.stage(eventId);
      this.supernaturalEventAnimator.clear();
      this.clearMoonEvent();
      return;
    }
    this.featuredEvents.clear();
    this.activeFeaturedEventId = null;
    this.stageMoonEvent(eventId);
    if (variantSeed === undefined) this.eventPresentation.stage(eventId);
    else this.eventPresentation.stage(eventId, variantSeed);
    if (route === 'weather') {
      if (resolvedVariantSeed === undefined) this.weatherEventAnimator.stage(eventId);
      else this.weatherEventAnimator.stage(eventId, resolvedVariantSeed);
    }
    else this.weatherEventAnimator.clear();
    if (route === 'supernatural') this.supernaturalEventAnimator.stage(eventId);
    else this.supernaturalEventAnimator.clear();
  }

  async revealEvent(eventId: string): Promise<void> {
    if (this.disposed) return;
    if (eventId === 'night-calm-fallback') {
      this.restoreEventCameraFront();
      return;
    }
    const route = eventPresentationRoute(eventId);
    if (route === null) throw new Error(`Missing event presentation route: ${eventId}`);
    const operation = ++this.weatherEventOperation;
    if (route === 'dedicated' && this.dedicatedEvents?.handles(eventId)) {
      await this.dedicatedEvents.reveal();
    } else if (route === 'focused') {
      await Promise.all([
        this.eventPresentation.reveal(eventId),
        this.weatherEventAnimator.reveal(eventId),
      ]);
    } else if (route === 'featured') {
      await Promise.all([
        this.featuredEvents.reveal(eventId),
        this.weatherEventAnimator.reveal(eventId),
      ]);
    } else if (route === 'weather') {
      await Promise.all([
        this.eventPresentation.reveal(eventId),
        this.weatherEventAnimator.reveal(eventId),
      ]);
    } else if (route === 'supernatural') {
      await Promise.all([
        this.eventPresentation.reveal(eventId),
        this.supernaturalEventAnimator.reveal(eventId),
      ]);
    } else if (route === 'moon') {
      await Promise.all([
        this.eventPresentation.reveal(eventId),
        this.revealMoonEvent(eventId),
      ]);
    } else {
      await this.eventPresentation.reveal(eventId);
    }
    if (
      !this.disposed
      && operation === this.weatherEventOperation
      && eventId !== 'check-the-back'
    ) {
      this.restoreEventCameraFront();
    }
  }

  private restoreEventCameraFront(): void {
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
  }

  retrieveDriftingCargo(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.toolHoverOutline.setTarget(null);
    const eventId = this.activeDriftingCargoEventId();
    if (eventId === null) return Promise.resolve();
    return this.featuredEvents.react(
      eventId,
      eventId === 'drifting-barrel' ? 'drifting-barrel.food' : 'drifting-chest.food',
    );
  }

  delegateDriftingCargo(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const eventId = this.activeDriftingCargoEventId();
    if (eventId === null) return Promise.resolve();
    this.toolHoverOutline.setTarget(null);
    this.finishCarlitosDelegation();
    this.captureCarlitosDelegateBase();
    const companionMotion = new Promise<void>((resolve) => {
      this.activeCarlitosDelegation = {
        elapsed: 0,
        duration: CARLITOS_DELEGATE_DURATION,
        resolve,
    };
    });
    const lootMotion = this.featuredEvents.react(
      eventId,
      eventId === 'drifting-barrel' ? 'drifting-barrel.food' : 'drifting-chest.food',
    );
    return Promise.all([companionMotion, lootMotion]).then(() => undefined);
  }

  recedeDriftingCargo(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.toolHoverOutline.setTarget(null);
    const eventId = this.activeDriftingCargoEventId();
    if (eventId === null) return Promise.resolve();
    return this.featuredEvents.react(
      eventId,
      eventId === 'drifting-barrel' ? 'drifting-barrel.drift' : 'drifting-chest.drift',
    );
  }

  projectDriftingCargo(width: number, height: number): ProjectedBoatBounds | null {
    if (this.disposed) return null;
    this.scene.updateMatrixWorld(true);
    return this.featuredEvents.projectHeldDriftingCargo(this.camera, width, height);
  }

  projectEventInteractionBounds(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    if (this.disposed || width <= 0 || height <= 0) return null;
    this.scene.updateMatrixWorld(true);
    const root = this.featuredEvents.interactionRoot(eventId);
    return root === null ? null : projectBoatObjectBounds(root, this.camera, width, height);
  }

  projectEventResultBounds(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    if (this.disposed || width <= 0 || height <= 0) return null;
    this.scene.updateMatrixWorld(true);
    const root = this.featuredEvents.resultRoot(eventId);
    return root === null ? null : projectBoatObjectBounds(root, this.camera, width, height);
  }

  async reactToEventOutcome(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | EventChoicePresentation =
      EMPTY_EVENT_PHYSICAL_RESPONSE,
    presentation?: EventOutcomePresentation,
  ): Promise<void> {
    if (this.disposed) return;
    const focusedChoice = 'actors' in response ? null : response;
    if (isEventPresentationRoute(eventId, 'focused')) {
      const result = outcome.eventResult;
      if (
        focusedChoice === null
        || result === undefined
        || result.eventId !== eventId
        || result.choiceId !== focusedChoice.choiceId
      ) {
        const received = result === undefined
          ? 'missing'
          : `${result.eventId}/${result.choiceId}`;
        throw new Error(
          `Focused event ${eventId} requires result ${eventId}/${focusedChoice?.choiceId ?? 'missing-choice'}; received ${received}.`,
        );
      }
    }
    const physicalResponse: EventPhysicalResponsePresentation = 'actors' in response
      ? response
      : {
          choiceId: response.choiceId,
          actors: response.instanceId === null || response.condition === null
            ? []
            : [{ instanceId: response.instanceId, condition: response.condition }],
        };
    this.weatherEventOperation += 1;
    if (this.dedicatedEvents?.handles(eventId) && presentation === undefined) {
      throw new Error('Dedicated event reaction requires exact result data.');
    }
    if (isEventPresentationRoute(eventId, 'focused') && presentation === undefined) {
      this.supplyDisplay.clearEventMotion();
    }
    const featuredReaction = outcome.eventPresentationKey !== undefined
      && isEventPresentationRoute(eventId, 'featured')
      ? this.featuredEvents.react(eventId, outcome.eventPresentationKey)
      : Promise.resolve();
    const eventFamilyReaction = this.dedicatedEvents?.handles(eventId)
      ? this.dedicatedEvents.react(presentation!)
      : Promise.all([
          this.weatherEventAnimator.react(
            eventId,
            outcome,
            physicalResponse,
            presentation?.selectedInstanceId ?? null,
          ),
          isEventPresentationRoute(eventId, 'focused')
            ? this.eventPresentation.react(eventId, outcome)
            : isEventPresentationRoute(eventId, 'featured')
            ? featuredReaction
            : this.eventPresentation.react(eventId, outcome),
          this.supernaturalEventAnimator.react(
            eventId,
            outcome,
            physicalResponse,
            presentation?.selectedInstanceId ?? null,
          ),
          this.reactMoonEvent(eventId, outcome, physicalResponse),
        ]);
    await Promise.all([
      presentation === undefined
        ? Promise.resolve()
        : this.itemUseController.react(presentation),
      eventFamilyReaction,
    ]);
  }

  clearEvent(): void {
    if (this.disposed) return;
    this.weatherEventOperation += 1;
    this.finishCarlitosDelegation();
    this.itemUseController.clear(this.phase);
    this.dedicatedEvents?.clear();
    this.resetDedicatedEffects();
    this.eventPresentation.clear();
    this.featuredEvents.clear();
    this.activeFeaturedEventId = null;
    this.weatherEventAnimator.clear();
    this.supernaturalEventAnimator.clear();
    this.clearMoonEvent();
    this.supplyDisplay.clearEventMotion();
    if (this.phase === 'day') this.supplyDisplay.releaseDayStowedItems();
    Object.assign(this.vortexWave, createInactiveVortexWaveState());
  }

  setDocumentHidden(hidden: boolean): void {
    if (this.disposed || !hidden) return;
    this.weatherEventOperation += 1;
    this.finishCarlitosDelegation();
    this.itemUseController.settleForVisibilityChange(this.phase);
    this.skipSequence();
    this.clearDivePresentation();
    this.eventPresentation.settleForVisibilityChange();
    this.featuredEvents.settleForVisibilityChange();
    this.weatherEventAnimator.settleForVisibilityChange();
    this.supernaturalEventAnimator.settleForVisibilityChange();
    this.settleMoonForVisibilityChange();
    this.dedicatedEvents?.settleForVisibilityChange();
    this.supplyDisplay.settleEventItemUse();
    this.supplyDisplay.clearEventMotion();
    this.resetDedicatedEffects();
    Object.assign(this.vortexWave, createInactiveVortexWaveState());
  }

  private eventItemAimTarget(eventId: string): Object3D | null {
    if (eventId === 'dangerous-waters') {
      return this.eventPresentation.itemAimTarget(eventId);
    }
    if (eventId === 'face-on-the-moon') {
      return this.moonItemAimTarget;
    }
    return this.dedicatedEvents?.itemAimTarget()
      ?? this.featuredEvents.itemAimTarget(eventId)
      ?? this.weatherEventAnimator.itemAimTarget(eventId)
      ?? this.supernaturalEventAnimator.itemAimTarget(eventId)
      ?? this.eventPresentation.itemAimTarget(eventId);
  }

  projectInteractionAnchors(width: number, height: number): BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return [];
    this.scene.updateMatrixWorld(true);

    const itemAnchors = this.supplyDisplay.records()
      .filter((record) => record.visibleCopies > 0)
      .map((record) => {
      const projection = projectCachedBoatObjectBounds(
        record.root,
        this.supplyAnchorBounds.get(record.groupId) ?? null,
        this.camera,
        width,
        height,
      );
      const { width: hitWidth, height: hitHeight, depth, ...point } = projection;
      const itemType = record.groupId === 'repairMaterial' ? null : record.groupId;
      return {
        id: `supply:${record.groupId}`,
        itemType,
        supplyGroupId: record.groupId,
        toolId: null,
        action: itemType !== null && record.usableQuantity > 0
          ? ACTION_FOR_ITEM[itemType] ?? null
          : null,
        ...point,
        visible: record.visibleCopies > 0 && record.root.visible && point.visible,
        depleted: false,
        remainingUses: itemType === null || record.usableQuantity === 0
          ? null
          : ITEM_DEFINITIONS[itemType].charges,
        quantity: record.quantity,
        usableQuantity: record.usableQuantity,
        brokenQuantity: record.brokenQuantity,
        backingInstanceId: record.backingInstanceId,
        hitArea: {
          width: Math.max(44, hitWidth),
          height: Math.max(44, hitHeight),
          depth,
        },
      } satisfies BoatInteractionAnchor;
      });
    const companionProjection = this.carlitos.root.visible
      ? projectCachedBoatObjectBounds(
          this.carlitos.interactionRoot,
          this.carlitosAnchorBounds,
          this.camera,
          width,
          height,
        )
      : null;
    const companionAnchor = companionProjection === null
      ? null
      : {
          id: 'carlitos',
          companionId: 'carlitos',
          label: 'CARLITOS',
          description: 'Check his hunger, happiness, and health.',
          itemType: null,
          toolId: null,
          action: null,
          x: companionProjection.x,
          y: companionProjection.y,
          visible: companionProjection.visible,
          depleted: false,
          remainingUses: null,
          quantity: 1,
          usableQuantity: 1,
          brokenQuantity: 0,
          backingInstanceId: null,
          hitArea: {
            width: Math.max(54, companionProjection.width),
            height: Math.max(54, companionProjection.height),
            depth: companionProjection.depth,
          },
        } satisfies BoatInteractionAnchor;
    const fishingProjection = projectCachedBoatObjectBounds(
      this.rodPivot,
      this.fishingAnchorBounds,
      this.camera,
      width,
      height,
    );
    const {
      width: fishingHitWidth,
      height: fishingHitHeight,
      depth: fishingDepth,
      ...fishingPoint
    } = fishingProjection;
    const fishingAnchor = {
      id: 'fishing-tools',
      itemType: null,
      toolId: 'fishingRod',
      action: 'fish',
      ...fishingPoint,
      visible: this.rod.visible && fishingPoint.visible,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: {
        width: fishingHitWidth,
        height: fishingHitHeight,
        depth: fishingDepth,
      },
    } satisfies BoatInteractionAnchor;
    const repairProjection = projectCachedBoatObjectBounds(
      this.repairTools,
      this.repairAnchorBounds,
      this.camera,
      width,
      height,
    );
    const { width: hitWidth, height: hitHeight, depth, ...point } = repairProjection;
    const repairAnchor = {
      id: 'repair-tools',
      itemType: null,
      toolId: 'repairTools',
      action: 'repair',
      ...point,
      visible: this.repairTools.visible && point.visible,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: { width: hitWidth, height: hitHeight, depth },
    } satisfies BoatInteractionAnchor;
    const lanternProjection = projectCachedBoatObjectBounds(
      this.lantern.root,
      this.lanternAnchorBounds,
      this.camera,
      width,
      height,
    );
    const {
      width: lanternHitWidth,
      height: lanternHitHeight,
      depth: lanternDepth,
      ...lanternPoint
    } = lanternProjection;
    const lanternAnchor = {
      id: 'end-day-lantern',
      itemType: null,
      toolId: 'lantern',
      action: 'endDay',
      ...lanternPoint,
      visible: this.lantern.root.visible && lanternPoint.visible,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: {
        width: lanternHitWidth,
        height: lanternHitHeight,
        depth: lanternDepth,
      },
    } satisfies BoatInteractionAnchor;
    const featuredRoot = this.activeFeaturedEventId === null
      ? null
      : this.featuredEvents.interactionRoot(this.activeFeaturedEventId);
    const featuredProjection = featuredRoot === null
      ? null
      : projectBoatObjectBounds(featuredRoot, this.camera, width, height);
    const featuredAnchor = featuredProjection === null || this.activeFeaturedEventId === null
      ? null
      : {
          id: `event:${this.activeFeaturedEventId}`,
          label: this.featuredAnchorLabel(this.activeFeaturedEventId),
          description: this.featuredAnchorDescription(this.activeFeaturedEventId),
          ...(this.featuredAnchorChoice(this.activeFeaturedEventId) === null
            ? {}
            : { eventChoiceId: this.featuredAnchorChoice(this.activeFeaturedEventId)! }),
          itemType: null,
          toolId: null,
          action: null,
          x: featuredProjection.x,
          y: featuredProjection.y,
          visible: featuredProjection.visible,
          depleted: false,
          remainingUses: null,
          quantity: 1,
          usableQuantity: 1,
          brokenQuantity: 0,
          backingInstanceId: null,
          hitArea: {
            width: Math.max(64, featuredProjection.width),
            height: Math.max(64, featuredProjection.height),
            depth: featuredProjection.depth,
          },
        } satisfies BoatInteractionAnchor;
    const chestProjection = projectCachedBoatObjectBounds(
      this.chestDisplay.root,
      this.chestAnchorBounds,
      this.camera,
      width,
      height,
    );
    const {
      width: chestWidth,
      height: chestHeight,
      depth: chestDepth,
      ...chestPoint
    } = chestProjection;
    const chestAnchor = {
      id: 'persistent-chest',
      label: 'CHEST',
      description: 'A closed chest. Opening it costs three energy.',
      itemType: null,
      toolId: 'chest',
      action: this.chestState === 'closed' ? 'openChest' : null,
      ...chestPoint,
      visible: this.chestState === 'closed'
        && this.chestDisplay.root.visible
        && chestPoint.visible,
      depleted: false,
      remainingUses: null,
      quantity: 1,
      usableQuantity: 1,
      brokenQuantity: 0,
      backingInstanceId: null,
      hitArea: {
        width: Math.max(54, chestWidth),
        height: Math.max(54, chestHeight),
        depth: chestDepth,
      },
    } satisfies BoatInteractionAnchor;
    const focusedEventAnchors = this.eventPresentation.projectInteractionAnchors(
      this.camera,
      width,
      height,
    );
    const focusedIds = new Set(focusedEventAnchors.map(({ id }) => id));
    return [
      ...itemAnchors,
      ...(companionAnchor === null ? [] : [companionAnchor]),
      fishingAnchor,
      repairAnchor,
      lanternAnchor,
      ...(focusedIds.has(chestAnchor.id) ? [] : [chestAnchor]),
      ...(featuredAnchor === null ? [] : [featuredAnchor]),
      ...focusedEventAnchors,
    ];
  }

  enterFishingView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.fishingPhase === 'ready') {
      this.applyBasePresentation();
      this.applyFishingPhasePresentation();
      return Promise.resolve();
    }
    this.fishingCameraStartPosition.copy(this.camera.position);
    this.fishingCameraStartQuaternion.copy(this.camera.quaternion);
    this.fishingPhase = 'entering';
    return this.startFishingAnimation(
      'enter',
      FISHING_CAMERA_DURATION,
    );
  }

  castFishingAtScreenPoint(
    clientX: number,
    clientY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): FishingCastPoint | null {
    if (
      this.disposed
      || !Number.isFinite(clientX)
      || !Number.isFinite(clientY)
      || !Number.isFinite(viewportWidth)
      || !Number.isFinite(viewportHeight)
      || viewportWidth <= 0
      || viewportHeight <= 0
      || clientX < 0
      || clientX > viewportWidth
      || clientY < 0
      || clientY > viewportHeight
    ) return null;

    this.scene.updateMatrixWorld(true);
    this.fishingNdc.set(
      clientX / viewportWidth * 2 - 1,
      -(clientY / viewportHeight) * 2 + 1,
    );
    this.fishingRaycaster.setFromCamera(this.fishingNdc, this.camera);
    if (!this.fishingRaycaster.ray.intersectPlane(
      this.fishingInteractionPlane,
      this.fishingRayHit,
    )) return null;
    if (!this.isFishingPointInBounds(this.fishingRayHit.x, this.fishingRayHit.z)) return null;
    return Object.freeze({ x: this.fishingRayHit.x, z: this.fishingRayHit.z });
  }

  centeredFishingCast(): FishingCastPoint {
    return CENTERED_FISHING_CAST;
  }

  playFishingCast(point: FishingCastPoint): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.setFishingCastPoint(point);
    this.fishingSplashHoldRemaining = 0;
    this.fishingLineOrigin.getWorldPosition(this.fishingLineOriginWorld);
    this.fishingCastOriginY = this.fishingLineOriginWorld.y;
    this.fishingPhase = 'casting';
    return this.startFishingAnimation(
      'cast',
      FISHING_CAST_DURATION,
    );
  }

  showFishingWaiting(point: FishingCastPoint): void {
    if (this.disposed) return;
    this.cancelActiveFishingAnimation();
    this.setFishingCastPoint(point);
    this.fishingPhase = 'waiting';
    this.updateFishingWave(this.currentTime);
    this.applyFishingPhasePresentation();
  }

  showFishingBite(point: FishingCastPoint): void {
    if (this.disposed) return;
    this.cancelActiveFishingAnimation();
    this.setFishingCastPoint(point);
    this.fishingPhase = 'bite';
    this.updateFishingWave(this.currentTime);
    this.applyFishingPhasePresentation();
    this.updateFishingBiteParticles(0);
  }

  projectFishingBite(width: number, height: number): ProjectedBoatBounds {
    const result = this.fishingProjection;
    if (
      this.disposed
      || this.fishingPhase !== 'bite'
      || !this.hasFishingCast
      || width <= 0
      || height <= 0
    ) {
      result.x = 0;
      result.y = 0;
      result.width = 0;
      result.height = 0;
      result.depth = 0;
      result.visible = false;
      return result;
    }

    this.camera.updateWorldMatrix(true, false);
    this.fishingProjectionWorld.set(
      this.fishingCastPosition.x,
      this.fishingWaveHeight,
      this.fishingCastPosition.z,
    );
    this.fishingProjectionCamera.copy(this.fishingProjectionWorld)
      .applyMatrix4(this.camera.matrixWorldInverse);
    this.fishingProjectionWorld.project(this.camera);
    result.x = (this.fishingProjectionWorld.x * 0.5 + 0.5) * width;
    result.y = (-this.fishingProjectionWorld.y * 0.5 + 0.5) * height;
    result.width = Math.min(FISHING_TARGET_SIZE, width);
    result.height = Math.min(FISHING_TARGET_SIZE, height);
    result.depth = -this.fishingProjectionCamera.z;
    result.visible = this.fishingProjectionCamera.z < 0
      && Math.abs(this.fishingProjectionWorld.x) <= 1
      && Math.abs(this.fishingProjectionWorld.y) <= 1;
    return result;
  }

  async playFishingReel(catchId: FishingCatchId): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.hasFishingCast) this.setFishingCastPoint(CENTERED_FISHING_CAST);
    const fishingCatch = await this.fishingCatches.prepare(catchId);
    if (!fishingCatch || this.disposed) return;
    this.activeFishingCatch = fishingCatch;
    this.activeFishingCatch.position.set(0, 0, 0);
    this.activeFishingCatch.rotation.set(0, 0.08, -0.04);
    this.activeFishingCatch.updateMatrixWorld(true);
    const catchBounds = new Box3().setFromObject(this.activeFishingCatch, true);
    this.activeFishingCatch.position.y = -catchBounds.min.y;
    this.fishing.catchDisplay.add(this.activeFishingCatch);
    this.fishingReelStartWorld.set(
      this.fishingCastPosition.x,
      this.fishingWaveHeight,
      this.fishingCastPosition.z,
    );
    this.fishing.catchDisplay.position.copy(this.fishingReelStartWorld);
    this.fishingPhase = 'reeling';
    await this.startFishingAnimation(
      'reel',
      FISHING_REEL_DURATION,
    );
  }

  projectFishingCatch(width: number, height: number): ProjectedBoatBounds | null {
    if (
      this.disposed
      || this.fishingPhase !== 'landed'
      || this.activeFishingCatch === null
      || width <= 0
      || height <= 0
    ) return null;
    this.scene.updateMatrixWorld(true);
    return projectBoatObjectBounds(
      this.fishing.catchDisplay,
      this.camera,
      width,
      height,
    );
  }

  playFishingMiss(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.hasFishingCast) this.setFishingCastPoint(CENTERED_FISHING_CAST);
    this.fishingPhase = 'missing';
    return this.startFishingAnimation(
      'miss',
      FISHING_MISS_DURATION,
    );
  }

  exitFishingView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.fishingCameraStartPosition.copy(this.camera.position);
    this.fishingCameraStartQuaternion.copy(this.camera.quaternion);
    this.resetFishingVisuals();
    this.fishingPhase = 'returning';
    return this.startFishingAnimation(
      'return',
      FISHING_CAMERA_DURATION,
    );
  }

  clearFishingPresentation(): void {
    if (this.disposed) return;
    this.cancelActiveFishingAnimation();
    const keepBowView = this.fishingPhase !== 'idle' && this.fishingPhase !== 'returning';
    this.resetFishingVisuals();
    this.fishingPhase = keepBowView ? 'ready' : 'idle';
    this.applyBasePresentation();
    this.applyFishingPhasePresentation();
  }

  play(cue: PresentationCue): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelActiveSequence();
    this.settledCue = null;
    this.applyBasePresentation();
    const duration = CUE_DURATION[cue];
    if (duration === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.activeSequence = { cue, duration, elapsed: 0, resolve };
      this.applyCue(cue, 0, 0);
    });
  }

  presentationCueForTest(): PresentationCue | null { return this.settledCue; }

  skipSequence(): void {
    const sequence = this.activeSequence;
    if (sequence !== null) {
      this.activeSequence = null;
      this.settledCue = this.isTerminalCue(sequence.cue) ? sequence.cue : null;
      this.applyBasePresentation();
      this.applyCue(sequence.cue, 1, sequence.duration);
      sequence.resolve();
    }
    this.dedicatedEvents?.skip();
  }

  update(time: number, delta: number): void {
    this.updateScene(time, delta, true);
  }

  updateAmbient(time: number, delta: number): void {
    this.updateScene(time, delta, false);
  }

  private updateScene(time: number, delta: number, advancePresentation: boolean): void {
    if (this.disposed || delta <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    this.currentTime = time;
    const amplitudeScale = this.weatherProfile.waveScale;
    this.ocean.setVortex(this.vortexWave);
    this.buoyancy.sampleTargetInto(
      this.boatTargetPose,
      time,
      SURVIVAL_BOAT_ANCHOR.x,
      SURVIVAL_BOAT_ANCHOR.z,
      amplitudeScale,
    );
    smoothBoatPoseInto(this.boatPose, this.boatPose, this.boatTargetPose, delta, 7);
    this.applyBasePresentation();
    if (this.activeDiveItemId !== null) {
      if (advancePresentation) this.diveElapsed += Math.max(0, delta);
      this.divePresentation.copyWaterEntryWorldPosition(
        this.diveWaterEntryWorldPosition,
      );
      this.sampleWorldWaveInto(
        this.diveWaveSample,
        time,
        this.diveWaterEntryWorldPosition.x,
        this.diveWaterEntryWorldPosition.z,
        amplitudeScale,
      );
      this.divePresentation.update(
        this.diveElapsed,
        delta,
        this.diveWaveSample.height,
      );
    }
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.sky.update(
      delta,
      this.skyState,
      this.worldCameraPosition,
    );
    this.applyBaseLighting(this.sky.palette);
    if (this.settledCue) this.applyCue(this.settledCue, 1, time);
    this.supplyDisplay.updatePropAnimations(delta);
    this.carlitos.update(delta);

    if (advancePresentation) {
      const sequence = this.activeSequence;
      if (sequence) {
        sequence.elapsed = Math.min(sequence.duration, sequence.elapsed + delta);
        const progress = sequence.elapsed / sequence.duration;
        this.applyCue(sequence.cue, progress, sequence.elapsed);
        if (progress >= 1) {
          this.activeSequence = null;
          this.settledCue = this.isTerminalCue(sequence.cue) ? sequence.cue : null;
          sequence.resolve();
        }
      }

      this.advanceFishingPresentation(delta);
      this.supplyDisplay.resetEventPoseForFrame();
      this.eventPresentation.update(time, delta);
      this.featuredEvents.update(time, delta);
      this.updateCarlitosDelegation(delta);
      this.weatherEventAnimator.update(time, delta);
      this.applyDangerousWatersPresentation();
      this.supernaturalEventAnimator.update(time, delta, amplitudeScale);
      this.updateMoonEvent(delta);
      this.dedicatedEvents?.update(time, delta);
      this.supplyDisplay.update(delta);
      this.itemUseController.update(delta);
      this.updateFishingBiteParticles(delta);
    } else if (this.moonEventStaged) {
      this.applyMoonPresentation();
    }
    setSceneBinocularMaskStrength(
      this.scene,
      this.itemEffects.binocularMaskStrength,
    );
    this.updateFishingWave(time, amplitudeScale);
    this.updateFishingEffects();

    const fog = this.scene.fog as FogExp2;
    const atmosphere = this.sky.palette;
    this.oceanAtmosphere.fogColor.copy(fog.color);
    this.oceanAtmosphere.horizonColor.copy(atmosphere.horizonColor);
    this.oceanAtmosphere.skyColor.copy(atmosphere.zenithColor);
    this.oceanAtmosphere.sunColor.copy(atmosphere.sunColor);
    this.oceanAtmosphere.sunVisibility = atmosphere.sunVisibility;
    this.ocean.update(time, amplitudeScale, fog.density, this.oceanAtmosphere);
    this.scene.updateMatrixWorld(true);
    this.updateFishingLine();
    this.ocean.setExclusions([
      createWaterExclusion(
        this.boat,
        this.waterExclusion.halfWidth,
        this.waterExclusion.halfLength,
        this.waterExclusion.taperStart,
        this.waterExclusion.minimumLocalY,
      ),
    ]);
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.weatherEffects.update(time, delta, this.worldCameraPosition);
    if (this.lightningStrikePending) {
      this.lightningStrikePending = false;
      this.lightningStrikeListener?.();
    }
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  dispose(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.setHighlightedItem(null),
      () => {
        this.disposed = true;
        this.weatherEventOperation += 1;
        this.lightningStrikePending = false;
        this.lightningStrikeListener = null;
      },
      () => this.cancelActiveSequence(),
      () => this.clearMoonEvent(),
      () => this.finishCarlitosDelegation(),
      () => this.itemUseController.dispose(),
      () => this.dedicatedEvents?.dispose(),
      () => this.itemUseAdapter.dispose(),
      () => this.resetDedicatedEffects(),
      () => Object.assign(this.vortexWave, createInactiveVortexWaveState()),
      () => this.weatherEventAnimator.dispose(),
      () => this.supernaturalEventAnimator.dispose(),
      () => this.clearDivePresentation(),
      () => this.divePresentation.dispose(),
      () => this.carlitos.dispose(),
      () => this.supplyDisplay.dispose(),
      () => this.chestDisplay.dispose(),
      () => this.toolHoverOutline.dispose(),
      () => this.eventPresentation.dispose(),
      () => this.featuredEvents.dispose(),
      () => this.lantern.dispose(),
      () => this.cancelActiveFishingAnimation(),
      () => this.fishingCatches.dispose(),
      () => this.ocean.dispose(),
      () => this.weatherEffects.dispose(),
      () => this.fishingBiteParticles.dispose(),
      () => this.sky.dispose(),
      () => this.scene.remove(
        this.motionRig,
        this.moonItemAimTarget,
        this.ocean.mesh,
        this.ambient,
        this.key,
        this.key.target,
        this.itemEffects.root,
        this.fishing.root,
        this.fishingBiteParticles.points,
      ),
      () => this.cameraEffectsRoot.clear(),
      () => this.cameraEffectsRoot.removeFromParent(),
      () => this.boatEffectsRoot.clear(),
      () => this.boatEffectsRoot.removeFromParent(),
      () => this.camera.removeFromParent(),
      () => this.camera.position.copy(this.originalCameraPosition),
      () => this.camera.quaternion.copy(this.originalCameraQuaternion),
      () => this.originalCameraParent?.add(this.camera),
      () => disposeResourceSets(
        this.ownedGeometries,
        this.ownedMaterials,
        this.ownedTextures,
      ),
    ]);
  }

  private applyBasePresentation(): void {
    this.sky.resetTransient();
    this.applyBaseLighting(this.sky.palette);
    this.motionRig.position.set(
      SURVIVAL_BOAT_ANCHOR.x + this.boatPose.driftX,
      SURVIVAL_BOAT_ANCHOR.y + this.boatPose.y,
      SURVIVAL_BOAT_ANCHOR.z + this.boatPose.driftZ,
    );
    this.motionRig.rotation.set(this.boatPose.pitch, 0, -this.boatPose.roll);
    this.cueCameraRig.position.set(0, 0, 0);
    this.cueCameraRig.rotation.set(0, 0, 0);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
    this.rodPivot.rotation.x = this.baseRodPivotRotationX;
    this.eventPresentation.setRescueCue(null);
  }

  private applyDangerousWatersPresentation(): void {
    const reaction = this.dangerousWatersBoatReaction;
    if (this.eventPresentation.copyDangerousWatersBoatReaction(reaction)) {
      this.motionRig.position.x += reaction.driftX;
      this.motionRig.rotation.x += reaction.pitch;
      this.motionRig.rotation.y += reaction.yaw;
      this.motionRig.rotation.z += reaction.roll;
      this.camera.rotateY(reaction.cameraYaw);
      this.camera.rotateX(reaction.cameraZ * 0.9);
      this.ambient.intensity *= reaction.lightScale;
      this.key.intensity *= reaction.lightScale;
      this.supplyDisplay.applyEventAmbientPose(
        reaction.supplyRoll,
        reaction.supplyLift,
      );
    }
  }

  private resetDedicatedEffects(): void {
    this.cameraEffectsRoot.position.set(0, 0, 0);
    this.cameraEffectsRoot.rotation.set(0, 0, 0);
    this.cameraEffectsRoot.scale.set(1, 1, 1);
    this.boatEffectsRoot.position.set(0, 0, 0);
    this.boatEffectsRoot.rotation.set(0, 0, 0);
    this.boatEffectsRoot.scale.set(1, 1, 1);
  }

  private startFishingAnimation(
    kind: FishingAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveFishingAnimation();
    return new Promise<void>((resolve) => {
      this.activeFishingAnimation = { kind, duration, elapsed: 0, resolve };
      this.applyFishingPhasePresentation();
      this.applyFishingAnimation(kind, 0);
    });
  }

  private advanceFishingPresentation(delta: number): void {
    this.fishingSplashHoldRemaining = Math.max(
      0,
      this.fishingSplashHoldRemaining - delta,
    );
    this.applyFishingPhasePresentation();
    const animation = this.activeFishingAnimation;
    if (!animation) return;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyFishingAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeFishingAnimation = null;
    this.finishFishingAnimation(animation.kind);
    this.applyFishingPhasePresentation();
    animation.resolve();
  }

  private applyFishingPhasePresentation(): void {
    this.fishing.line.visible = false;
    this.fishing.bobber.visible = false;
    this.fishing.splash.visible = false;
    this.fishing.catchDisplay.visible = false;
    if (this.fishingPhase !== 'bite') this.clearFishingBiteParticles();
    if (this.fishingPhase === 'idle') return;

    this.rodPivot.rotation.x = this.baseRodPivotRotationX;
    if (this.fishingPhase === 'entering' || this.fishingPhase === 'returning') return;
    this.camera.position.copy(this.fishingCameraPosition);
    this.camera.quaternion.copy(this.fishingCameraQuaternion);
    if (this.fishingPhase === 'ready') return;

    if (this.fishingPhase === 'landed') {
      this.fishing.catchDisplay.visible = this.activeFishingCatch !== null;
      return;
    }
    this.fishing.line.visible = true;
    this.fishing.bobber.visible = this.fishingPhase !== 'reeling';
    if (this.fishingPhase === 'waiting' && this.fishingSplashHoldRemaining > 0) {
      this.fishing.splash.visible = true;
    }
    if (this.fishingPhase === 'reeling') {
      this.fishing.catchDisplay.visible = this.activeFishingCatch !== null;
    }
  }

  private applyFishingAnimation(kind: FishingAnimationKind, progress: number): void {
    const normalized = clamp(progress, 0, 1);
    const eased = easeInOut(normalized);
    switch (kind) {
      case 'enter':
        if (normalized === 1) {
          this.camera.position.copy(this.fishingCameraPosition);
          this.camera.quaternion.copy(this.fishingCameraQuaternion);
        } else {
          this.camera.position.lerpVectors(
            this.fishingCameraStartPosition,
            this.fishingCameraPosition,
            smootherStep(normalized),
          );
          this.camera.quaternion.copy(this.fishingCameraStartQuaternion)
            .slerp(this.fishingCameraQuaternion, smootherStep(normalized));
        }
        break;
      case 'return':
        if (normalized === 1) {
          this.camera.position.copy(this.baseCameraPosition);
          this.camera.quaternion.copy(this.baseCameraQuaternion);
        } else {
          this.camera.position.lerpVectors(
            this.fishingCameraStartPosition,
            this.baseCameraPosition,
            smootherStep(normalized),
          );
          this.camera.quaternion.copy(this.fishingCameraStartQuaternion)
            .slerp(this.baseCameraQuaternion, smootherStep(normalized));
        }
        break;
      case 'cast': {
        const drawBack = normalized < 0.28
          ? easeInOut(normalized / 0.28) * 0.42
          : (1 - easeOut((normalized - 0.28) / 0.72)) * 0.42
            - Math.sin(Math.PI * (normalized - 0.28) / 0.72) * 0.5;
        this.rodPivot.rotation.x = this.baseRodPivotRotationX + drawBack;
        this.fishing.splash.visible = normalized >= 0.9 && normalized < 1;
        break;
      }
      case 'reel': {
        const swing = 0.34;
        this.rodPivot.rotation.x = this.baseRodPivotRotationX
          - Math.sin(Math.PI * normalized) * swing;
        if (this.activeFishingCatch) {
          this.fishingCatchRest.getWorldPosition(this.fishingCatchTargetWorld);
          this.fishingCatchApproachWorld.copy(this.fishingCatchTargetWorld);
          this.fishingCatchApproachWorld.y += 0.72;
          if (normalized < 0.72) {
            const haul = easeOut(normalized / 0.72);
            this.fishing.catchDisplay.position.lerpVectors(
              this.fishingReelStartWorld,
              this.fishingCatchApproachWorld,
              haul,
            );
            this.fishing.catchDisplay.position.y += Math.sin(Math.PI * haul) * 0.58;
          } else {
            const drop = easeInOut((normalized - 0.72) / 0.28);
            this.fishing.catchDisplay.position.lerpVectors(
              this.fishingCatchApproachWorld,
              this.fishingCatchTargetWorld,
              drop,
            );
            this.fishing.catchDisplay.position.y -= Math.sin(Math.PI * drop) * 0.045;
          }
          this.fishing.catchDisplay.rotation.z =
            Math.sin(normalized * Math.PI * 2) * 0.16 * (1 - normalized);
        }
        break;
      }
      case 'miss': {
        const swing = 0.18;
        this.rodPivot.rotation.x = this.baseRodPivotRotationX
          + Math.sin(Math.PI * normalized) * swing;
        break;
      }
    }
  }

  private finishFishingAnimation(kind: FishingAnimationKind): void {
    switch (kind) {
      case 'enter':
        this.fishingPhase = 'ready';
        break;
      case 'cast':
        this.fishingPhase = 'waiting';
        this.fishingSplashHoldRemaining = FISHING_SPLASH_HOLD_DURATION;
        break;
      case 'reel':
        this.fishingCatchRest.add(this.fishing.catchDisplay);
        this.fishing.catchDisplay.position.set(0, 0, 0);
        this.fishing.catchDisplay.rotation.set(0, 0, 0);
        this.fishingPhase = 'landed';
        break;
      case 'miss':
        break;
      case 'return':
        this.resetFishingVisuals();
        this.fishingPhase = 'idle';
        break;
    }
  }

  private resetFishingVisuals(): void {
    this.fishing.line.visible = false;
    this.fishing.bobber.visible = false;
    this.fishing.splash.visible = false;
    this.fishing.catchDisplay.visible = false;
    this.fishing.root.add(this.fishing.catchDisplay);
    this.fishing.catchDisplay.position.set(0, 0, 0);
    this.fishing.catchDisplay.rotation.set(0, 0, 0);
    this.clearFishingBiteParticles();
    this.fishingCatches.hide();
    this.activeFishingCatch = null;
    this.hasFishingCast = false;
    this.fishingSplashHoldRemaining = 0;
    this.rodPivot.rotation.x = this.baseRodPivotRotationX;
  }

  private setFishingCastPoint(point: FishingCastPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new RangeError('Fishing cast point must be finite.');
    }
    if (!this.isFishingPointInBounds(point.x, point.z)) {
      throw new RangeError('Fishing cast point is outside the authored water region.');
    }
    this.fishingCastPosition.set(point.x, 0, point.z);
    this.hasFishingCast = true;
    this.updateFishingWave(this.currentTime);
  }

  private isFishingPointInBounds(x: number, z: number): boolean {
    return x >= FISHING_CAST_MIN_X
      && x <= FISHING_CAST_MAX_X
      && z >= FISHING_CAST_MIN_Z
      && z <= FISHING_CAST_MAX_Z;
  }

  private updateFishingWave(
    time: number,
    amplitudeScale = this.weatherProfile.waveScale,
  ): void {
    if (!this.hasFishingCast) return;
    this.sampleWorldWaveInto(
      this.fishingWaveSample,
      time,
      this.fishingCastPosition.x,
      this.fishingCastPosition.z,
      amplitudeScale,
    );
    this.fishingWaveHeight = this.fishingWaveSample.height;
    if (this.fishingPhase === 'casting') {
      this.fishing.splash.position.set(
        this.fishingCastPosition.x,
        this.fishingWaveHeight,
        this.fishingCastPosition.z,
      );
    } else {
      this.fishing.bobber.position.set(
        this.fishingCastPosition.x,
        this.fishingWaveHeight,
        this.fishingCastPosition.z,
      );
      this.fishing.splash.position.copy(this.fishing.bobber.position);
    }
    if (this.fishingPhase !== 'reeling' && this.fishingPhase !== 'landed') {
      this.fishing.catchDisplay.position.copy(this.fishing.bobber.position);
    }
  }

  private updateFishingEffects(): void {
    if (this.fishing.splash.visible && this.activeFishingAnimation?.kind === 'cast') {
      const progress = this.activeFishingAnimation.elapsed / this.activeFishingAnimation.duration;
      for (let index = 0; index < this.fishing.splash.children.length; index += 1) {
        this.fishing.splash.children[index]!.position.y = 0.05
          + Math.sin(Math.PI * progress) * (0.14 + (index % 2) * 0.1);
      }
    }
  }

  private updateFishingBiteParticles(delta: number): void {
    if (this.fishingPhase !== 'bite') {
      this.clearFishingBiteParticles();
      return;
    }
    this.fishingBiteParticlesActive = true;
    this.fishingBiteParticles.update(delta);
    const dt = Math.min(0.1, Math.max(0, delta));
    this.fishingBiteParticleCooldown = Math.max(0, this.fishingBiteParticleCooldown - dt);
    if (this.fishingBiteParticleCooldown > 0) return;
    this.fishingBiteParticles.emit(
      this.fishing.bobber.position,
      FISHING_BITE_PARTICLE_INTENSITY,
    );
    this.fishingBiteParticleCooldown = FISHING_BITE_PARTICLE_INTERVAL_SECONDS;
  }

  private clearFishingBiteParticles(): void {
    if (!this.fishingBiteParticlesActive) return;
    this.fishingBiteParticles.reset();
    this.fishingBiteParticlesActive = false;
    this.fishingBiteParticleCooldown = 0;
  }

  private updateFishingLine(): void {
    if (!this.hasFishingCast || !this.fishing.line.visible) return;
    this.fishingLineOrigin.getWorldPosition(this.fishingLineOriginWorld);
    this.fishingLineEndWorld.set(
      this.fishingCastPosition.x,
      this.fishingWaveHeight + 0.075,
      this.fishingCastPosition.z,
    );

    const animation = this.activeFishingAnimation;
    if (animation?.kind === 'cast') {
      const progress = easeInOut(animation.elapsed / animation.duration);
      this.fishingLineEndWorld.x = this.fishingLineOriginWorld.x
        + (this.fishingCastPosition.x - this.fishingLineOriginWorld.x) * progress;
      this.fishingLineEndWorld.z = this.fishingLineOriginWorld.z
        + (this.fishingCastPosition.z - this.fishingLineOriginWorld.z) * progress;
      this.fishingLineEndWorld.y = this.fishingCastOriginY
        + (this.fishingWaveHeight + 0.075 - this.fishingCastOriginY) * progress
        + Math.sin(Math.PI * progress) * 1.35;
      this.fishing.bobber.position.copy(this.fishingLineEndWorld);
    } else if (this.fishingPhase === 'reeling' && this.activeFishingCatch) {
      this.fishingLineEndWorld.copy(this.fishing.catchDisplay.position);
    }

    const slack = this.fishingPhase === 'missing'
      ? 0.42
      : this.fishingPhase === 'waiting' || this.fishingPhase === 'bite'
        ? 0.1
        : 0.025;
    const positions = this.fishing.linePositions;
    for (let index = 0; index < 5; index += 1) {
      const progress = index / 4;
      const offset = index * 3;
      positions[offset] = this.fishingLineOriginWorld.x
        + (this.fishingLineEndWorld.x - this.fishingLineOriginWorld.x) * progress;
      positions[offset + 1] = this.fishingLineOriginWorld.y
        + (this.fishingLineEndWorld.y - this.fishingLineOriginWorld.y) * progress
        - Math.sin(Math.PI * progress) * slack;
      positions[offset + 2] = this.fishingLineOriginWorld.z
        + (this.fishingLineEndWorld.z - this.fishingLineOriginWorld.z) * progress;
    }
    this.fishing.linePositionAttribute.needsUpdate = true;
  }

  private applyBaseLighting(atmosphere: Readonly<SkyPalette>): void {
    const lightScale = this.weatherProfile.lightIntensityScale;
    this.ambient.color.copy(atmosphere.ambientLightColor);
    this.ambient.intensity = atmosphere.ambientLightIntensity * lightScale;
    this.key.color.copy(atmosphere.keyLightColor);
    this.key.intensity = atmosphere.keyLightIntensity * lightScale;
    this.lantern.light.intensity = this.skyState.phase === 'night'
      ? SURVIVAL_LANTERN_NIGHT_INTENSITY
      : SURVIVAL_LANTERN_DAY_INTENSITY;
    if (this.scene.background instanceof Color) {
      this.scene.background.copy(atmosphere.horizonColor);
    } else {
      this.scene.background = atmosphere.horizonColor.clone();
    }
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(atmosphere.fogColor);
      this.scene.fog.density = atmosphere.fogDensity
        * this.weatherProfile.fogDensityScale;
    } else {
      this.scene.fog = new FogExp2(
        atmosphere.fogColor,
        atmosphere.fogDensity * this.weatherProfile.fogDensityScale,
      );
    }
  }

  private applyCue(cue: PresentationCue, progress: number, elapsed: number): void {
    const eased = easeOut(clamp(progress, 0, 1));
    const pulse = Math.sin(Math.PI * clamp(progress, 0, 1));
    switch (cue) {
      case 'none':
        break;
      case 'fish':
        this.rodPivot.rotation.x = this.baseRodPivotRotationX - eased * 0.12;
        break;
      case 'dive':
        this.cueCameraRig.position.y -= pulse * 0.72;
        (this.scene.fog as FogExp2).density += pulse * 0.035;
        this.sky.setTint(DIVE_SKY_TINT, pulse * 0.8);
        if (this.scene.background instanceof Color) {
          this.scene.background.lerp(DIVE_SKY_TINT, pulse * 0.8);
        }
        break;
      case 'repair':
        this.camera.rotateY(-0.18 * eased);
        this.camera.rotateX(-0.035 * eased);
        this.key.intensity *= 1 + pulse * 0.18;
        break;
      case 'treat':
        this.ambient.intensity *= 1 + pulse * 0.12;
        break;
      case 'storm':
        this.motionRig.rotation.x += Math.sin(elapsed * 18) * 0.025 * (1 - progress);
        this.motionRig.rotation.z += Math.sin(elapsed * 23) * 0.035 * (1 - progress);
        break;
      case 'impact':
        this.motionRig.rotation.x += pulse * 0.075;
        this.camera.rotateX(-pulse * 0.045);
        break;
      case 'darkness':
        this.ambient.intensity *= 1 - eased * 0.68;
        this.key.intensity *= 1 - eased * 0.72;
        break;
      case 'sighting':
        break;
      case 'nightfall':
        this.ambient.intensity *= 1 - eased * 0.72;
        this.key.intensity *= 1 - eased * 0.78;
        break;
      case 'dawn':
        this.ambient.intensity *= 0.35 + eased * 0.65;
        this.key.intensity *= 0.3 + eased * 0.7;
        break;
      case 'rescue':
        this.eventPresentation.setRescueCue(eased);
        this.camera.rotateY(-0.12 * eased);
        break;
      case 'death':
        this.ambient.intensity *= 1 - eased * 0.88;
        this.key.intensity *= 1 - eased * 0.9;
        break;
      case 'sinking':
        this.motionRig.position.y -= eased * 1.05;
        this.ambient.intensity *= 1 - eased * 0.72;
        this.key.intensity *= 1 - eased * 0.8;
        (this.scene.fog as FogExp2).density += eased * 0.02;
        break;
    }
  }

  private activeDriftingCargoEventId(): DriftingCargoEventId | null {
    return this.activeFeaturedEventId !== null
      && isDriftingCargoEventId(this.activeFeaturedEventId)
      ? this.activeFeaturedEventId
      : null;
  }

  private featuredAnchorLabel(eventId: FeaturedEventId): string {
    if (eventId === 'drifting-barrel') return 'BARREL';
    if (eventId === 'drifting-chest') return 'CHEST';
    if (eventId === 'drifting-bottle') return 'BOTTLE';
    return 'FLOWERS';
  }

  private featuredAnchorDescription(eventId: FeaturedEventId): string {
    if (isDriftingCargoEventId(eventId)) return 'Floating salvage within reach.';
    if (eventId === 'drifting-bottle') return 'A sealed bottle taps the hull.';
    return 'Pale blooms pass in the dark water.';
  }

  private featuredAnchorChoice(eventId: FeaturedEventId): string | null {
    if (isDriftingCargoEventId(eventId)) return 'retrieve';
    if (eventId === 'drifting-bottle') return 'retrieve';
    return null;
  }

  private stageMoonEvent(eventId: string): void {
    this.cancelMoonAnimation();
    this.moonEventStaged = eventId === 'face-on-the-moon';
    this.resetMoonValues();
    this.sky.resetTransient();
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
  }

  private revealMoonEvent(eventId: string): Promise<void> {
    if (eventId !== 'face-on-the-moon') return Promise.resolve();
    if (!this.moonEventStaged) this.stageMoonEvent(eventId);
    this.cancelMoonAnimation();
    this.resetMoonValues();
    return new Promise((resolve) => {
      this.activeMoonAnimation = {
        kind: 'reveal',
        elapsed: 0,
        duration: MOON_FACE_REVEAL_DURATION,
        fromReveal: 0,
        fromGrin: 0,
        fromStarScale: 1,
        fromDim: 0,
        fromMoonScale: 1,
        fromCameraLower: 0,
        targetReveal: 1,
        targetGrin: MOON_FACE_BASE_GRIN,
        targetStarScale: MOON_FACE_STAR_SCALE,
        targetDim: MOON_FACE_BASE_DIM,
        targetMoonScale: MOON_FACE_MOON_SCALE,
        targetCameraLower: 0,
        response: null,
        resolve,
      };
    });
  }

  private reactMoonEvent(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null,
  ): Promise<void> {
    if (eventId !== 'face-on-the-moon') return Promise.resolve();
    if (!this.moonEventStaged) this.stageMoonEvent(eventId);
    this.cancelMoonAnimation();
    const pressureGain = (outcome.deltas.pressure ?? 0) > 0;
    const energyLoss = (outcome.deltas.energy ?? 0) < 0;
    const responseActor = response?.actors[0];
    const hasPhysicalResponse = responseActor !== undefined
      && sampleEventPhysicalResponsePose(
        eventId,
        { choiceId: response?.choiceId ?? '', condition: responseActor.condition },
        0,
        this.moonPhysicalResponsePose,
      );
    let activeResponse: EventPhysicalResponsePresentation | null = null;
    if (hasPhysicalResponse && response !== null && responseActor !== undefined) {
      this.supplyDisplay.clearEventPose();
      if (this.supplyDisplay.pinEventActor(responseActor.instanceId)) {
        activeResponse = response;
      }
    }
    if (!pressureGain && !energyLoss && activeResponse === null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.activeMoonAnimation = {
        kind: 'reaction',
        elapsed: 0,
        duration: MOON_FACE_REACTION_DURATION,
        fromReveal: this.moonFace.reveal,
        fromGrin: this.moonFace.grin,
        fromStarScale: this.moonFace.starScale,
        fromDim: this.moonFace.dim,
        fromMoonScale: this.moonFace.scale,
        fromCameraLower: this.moonCameraLower,
        targetReveal: 1,
        targetGrin: pressureGain
          ? Math.max(this.moonFace.grin, MOON_FACE_PRESSURE_GRIN)
          : this.moonFace.grin,
        targetStarScale: this.moonFace.starScale,
        targetDim: energyLoss
          ? Math.max(this.moonFace.dim, MOON_FACE_ENERGY_DIM)
          : this.moonFace.dim,
        targetMoonScale: this.moonFace.scale,
        targetCameraLower: energyLoss
          ? Math.max(this.moonCameraLower, MOON_FACE_CAMERA_LOWER)
          : this.moonCameraLower,
        response: activeResponse,
        resolve,
      };
    });
  }

  private updateMoonEvent(delta: number): void {
    if (!this.moonEventStaged) return;
    this.moonPulseElapsed += Math.max(0, Number.isFinite(delta) ? delta : 0);
    const animation = this.activeMoonAnimation;
    if (animation !== null) {
      animation.elapsed = Math.min(
        animation.duration,
        animation.elapsed + Math.max(0, Number.isFinite(delta) ? delta : 0),
      );
      const progress = animation.elapsed / animation.duration;
      if (animation.kind === 'reveal') {
        const revealProgress = smootherStep(clamp(
          (progress - MOON_FACE_HOLD_FRACTION) / (1 - MOON_FACE_HOLD_FRACTION),
          0,
          1,
        ));
        const faceProgress = smootherStep(clamp(
          (revealProgress - MOON_FACE_SHOCK_START)
            / (MOON_FACE_SHOCK_END - MOON_FACE_SHOCK_START),
          0,
          1,
        ));
        const grinProgress = smootherStep(clamp(
          (faceProgress - 0.52) / 0.48,
          0,
          1,
        ));
        this.moonFace.reveal = faceProgress;
        this.moonFace.grin = MOON_FACE_BASE_GRIN * grinProgress;
        this.moonFace.starScale = 1
          - (1 - MOON_FACE_STAR_SCALE) * easeInOut(revealProgress);
        this.moonFace.dim = MOON_FACE_BASE_DIM * easeInOut(revealProgress);
        this.moonFace.scale = 1
          + (MOON_FACE_MOON_SCALE - 1) * easeInOut(revealProgress);
      } else {
        const eased = easeInOut(progress);
        this.moonFace.reveal = animation.fromReveal
          + (animation.targetReveal - animation.fromReveal) * eased;
        this.moonFace.grin = animation.fromGrin
          + (animation.targetGrin - animation.fromGrin) * eased;
        this.moonFace.starScale = animation.fromStarScale
          + (animation.targetStarScale - animation.fromStarScale) * eased;
        this.moonFace.dim = animation.fromDim
          + (animation.targetDim - animation.fromDim) * eased;
        this.moonFace.scale = animation.fromMoonScale
          + (animation.targetMoonScale - animation.fromMoonScale) * eased;
        this.moonCameraLower = animation.fromCameraLower
          + (animation.targetCameraLower - animation.fromCameraLower) * eased;
        const responseActor = animation.response?.actors[0];
        if (
          responseActor !== undefined
          && sampleEventPhysicalResponsePose(
            'face-on-the-moon',
            {
              choiceId: animation.response!.choiceId,
              condition: responseActor.condition,
            },
            progress,
            this.moonPhysicalResponsePose,
          )
        ) {
          this.supplyDisplay.applyEventItemPose(
            responseActor.instanceId,
            this.moonPhysicalResponsePose,
          );
        }
      }
      if (progress >= 1) this.finishMoonAnimation();
    }
    this.applyMoonPresentation();
  }

  private settleMoonForVisibilityChange(): void {
    if (this.activeMoonAnimation === null) return;
    this.finishMoonAnimation();
    this.applyMoonPresentation();
  }

  private finishMoonAnimation(): void {
    const animation = this.activeMoonAnimation;
    if (animation === null) return;
    this.activeMoonAnimation = null;
    this.moonFace.reveal = animation.targetReveal;
    this.moonFace.grin = animation.targetGrin;
    this.moonFace.starScale = animation.targetStarScale;
    this.moonFace.dim = animation.targetDim;
    this.moonFace.scale = animation.targetMoonScale;
    this.moonCameraLower = animation.targetCameraLower;
    this.releaseMoonPhysicalResponse(animation);
    animation.resolve();
  }

  private clearMoonEvent(): void {
    this.cancelMoonAnimation();
    this.moonEventStaged = false;
    this.resetMoonValues();
    this.sky.resetTransient();
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
  }

  private resetMoonValues(): void {
    this.moonFace.reveal = 0;
    this.moonFace.grin = 0;
    this.moonFace.starScale = 1;
    this.moonFace.dim = 0;
    this.moonFace.scale = 1;
    this.moonCameraLower = 0;
    this.moonPulseElapsed = 0;
  }

  private applyMoonPresentation(): void {
    const twitchGate = Math.max(
      0,
      Math.sin(this.moonPulseElapsed * 0.61 - 1.1),
    );
    const pulse = this.moonFace.reveal * (
      Math.sin(this.moonPulseElapsed * 1.13) * 0.018
      + Math.sin(this.moonPulseElapsed * 4.73 + 1.1) * 0.01
      + Math.pow(twitchGate, 18) * 0.055
    );
    this.moonFaceDisplay.reveal = this.moonFace.reveal;
    this.moonFaceDisplay.grin = clamp(
      this.moonFace.grin + pulse,
      0,
      MOON_FACE_PRESSURE_GRIN,
    );
    this.moonFaceDisplay.starScale = this.moonFace.starScale;
    this.moonFaceDisplay.dim = this.moonFace.dim;
    this.moonFaceDisplay.scale = this.moonFace.scale;
    this.sky.setMoonFace(this.moonFaceDisplay);
    this.camera.rotateX(this.moonCameraLower);
  }

  private cancelMoonAnimation(): void {
    const animation = this.activeMoonAnimation;
    this.activeMoonAnimation = null;
    if (animation === null) return;
    this.releaseMoonPhysicalResponse(animation);
    animation.resolve();
  }

  private releaseMoonPhysicalResponse(animation: ActiveMoonAnimation): void {
    if (animation.response === null) return;
    this.supplyDisplay.clearEventPose();
    this.supplyDisplay.releaseEventActor();
  }

  private cancelActiveSequence(): void {
    const sequence = this.activeSequence;
    this.activeSequence = null;
    sequence?.resolve();
  }

  private captureCarlitosDelegateBase(): void {
    this.carlitosDelegateBasePosition.copy(this.carlitos.root.position);
    this.carlitosDelegateBaseRotation.set(
      this.carlitos.root.rotation.x,
      this.carlitos.root.rotation.y,
      this.carlitos.root.rotation.z,
    );
  }

  private updateCarlitosDelegation(delta: number): void {
    const animation = this.activeCarlitosDelegation;
    if (animation === null) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + safeDelta);
    const progress = animation.duration === 0 ? 1 : animation.elapsed / animation.duration;
    let x = 0;
    let y = 0;
    let z = 0;
    let yaw = 0;
    let roll = 0;
    if (progress < 0.12) {
      const travel = easeInOut(progress / 0.12);
      x = -0.08 * travel;
      y = -0.025 * travel;
      z = -0.07 * travel;
      yaw = -0.08 * travel;
      roll = 0.1 * travel;
    } else if (progress < 0.56) {
      const travel = easeInOut((progress - 0.12) / 0.44);
      x = -0.08 + (CARLITOS_DELEGATE_OFFSET.x + 0.08) * travel;
      y = -0.025 + (CARLITOS_DELEGATE_OFFSET.y + 0.025) * travel;
      z = -0.07 + (CARLITOS_DELEGATE_OFFSET.z + 0.07) * travel;
      yaw = -0.08 + 0.28 * travel;
      roll = 0.1 - 0.18 * travel;
    } else if (progress < 0.74) {
      const pull = Math.sin((progress - 0.56) / 0.18 * Math.PI);
      x = CARLITOS_DELEGATE_OFFSET.x - pull * 0.04;
      y = CARLITOS_DELEGATE_OFFSET.y - pull * 0.025;
      z = CARLITOS_DELEGATE_OFFSET.z;
      yaw = 0.2;
      roll = -0.08 - pull * 0.08;
    } else {
      const travel = 1 - easeInOut((progress - 0.74) / 0.26);
      x = CARLITOS_DELEGATE_OFFSET.x * travel;
      y = CARLITOS_DELEGATE_OFFSET.y * travel;
      z = CARLITOS_DELEGATE_OFFSET.z * travel;
      yaw = 0.2 * travel;
      roll = -0.08 * travel;
    }
    this.carlitos.root.position.set(
      this.carlitosDelegateBasePosition.x + x,
      this.carlitosDelegateBasePosition.y + y,
      this.carlitosDelegateBasePosition.z + z,
    );
    this.carlitos.root.rotation.set(
      this.carlitosDelegateBaseRotation.x,
      this.carlitosDelegateBaseRotation.y + yaw,
      this.carlitosDelegateBaseRotation.z + roll,
    );
    if (progress === 1) this.finishCarlitosDelegation();
  }

  private finishCarlitosDelegation(): void {
    const animation = this.activeCarlitosDelegation;
    if (animation === null) return;
    this.activeCarlitosDelegation = null;
    this.carlitos.root.position.copy(this.carlitosDelegateBasePosition);
    this.carlitos.root.rotation.set(
      this.carlitosDelegateBaseRotation.x,
      this.carlitosDelegateBaseRotation.y,
      this.carlitosDelegateBaseRotation.z,
    );
    animation.resolve();
  }

  private cancelActiveFishingAnimation(): void {
    const animation = this.activeFishingAnimation;
    this.activeFishingAnimation = null;
    animation?.resolve();
  }

  private isTerminalCue(cue: PresentationCue): boolean {
    return cue === 'rescue' || cue === 'death' || cue === 'sinking';
  }
}
