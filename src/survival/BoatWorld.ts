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
} from 'three';
import {
  ITEM_DEFINITIONS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import type { WaterQuality } from '../rendering/waterQuality';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import { HoverOutline } from '../rendering/HoverOutline';
import {
  BoatBuoyancy,
  smoothBoatPoseInto,
  type BoatPose,
} from '../ocean/BoatBuoyancy';
import {
  DEFAULT_WAVES,
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
import { BoatSupplyDisplay } from './BoatSupplyDisplay';
import { ChestDisplay } from './ChestDisplay';
import type {
  DangerousWatersBoatReaction,
  DangerousWatersItemPose,
} from './DangerousWatersPresentation';
import { DriftingLootPresentation } from './DriftingLootPresentation';
import { EventPresentationLayer } from './EventPresentationLayer';
import { FishingCatchLibrary } from './FishingCatchLibrary';
import { FishingBiteParticles } from './FishingBiteParticles';
import type { FishingCatchId } from './fishingCatalog';
import {
  WeatherEventAnimator,
  type EventPhysicalResponsePresentation,
} from './WeatherEventAnimator';
import {
  createSurvivalLantern,
  SURVIVAL_LANTERN_DAY_INTENSITY,
  SURVIVAL_LANTERN_NIGHT_INTENSITY,
  type SurvivalLantern,
} from './SurvivalLantern';
import type {
  ActionOutcome,
  DriftingLootVariant,
  PresentationCue,
  SurvivalSnapshot,
  WeatherId,
} from './survivalTypes';

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

const DIVE_SKY_TINT = new Color(0x0d5063);
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

function sampleDefaultWaveInto(
  output: WaveSample,
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
): void {
  sampleWaveFieldInto(output, DEFAULT_WAVES, time, x, z, amplitudeScale);
}

function sampleDefaultWave(
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
): WaveSample {
  return sampleWaveField(DEFAULT_WAVES, time, x, z, amplitudeScale);
}

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

interface FishingVisuals {
  readonly root: Group;
  readonly line: Line<BufferGeometry, LineBasicMaterial>;
  readonly linePositions: Float32Array;
  readonly linePositionAttribute: BufferAttribute;
  readonly bobber: Group;
  readonly splash: Group;
  readonly catchDisplay: Group;
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

export class BoatWorld {
  readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly ocean: OceanRenderer;
  private readonly sky: Skybox;
  private readonly weatherEffects: WeatherEffects;
  private readonly motionRig = new Group();
  private readonly cueCameraRig = new Group();
  private readonly cameraRig = new Group();
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
  private readonly fishingCameraStartPosition = new Vector3();
  private readonly fishingCameraStartQuaternion = new Quaternion();
  private readonly fishingMatrixScratch = new Matrix4();
  private readonly supplyDisplay: BoatSupplyDisplay;
  private readonly chestDisplay = new ChestDisplay();
  private chestState: SurvivalSnapshot['chest']['state'] = 'none';
  private readonly toolHoverOutline = new HoverOutline();
  private readonly weatherEventAnimator: WeatherEventAnimator;
  private readonly eventPresentation: EventPresentationLayer;
  private dangerousWatersItemId: ItemInstanceId | null = null;
  private readonly dangerousWatersItemPose: DangerousWatersItemPose = {
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
  private readonly dangerousWatersBoatReaction: DangerousWatersBoatReaction = {
    pitch: 0,
    yaw: 0,
    roll: 0,
    cameraZ: 0,
    lightScale: 1,
  };
  private readonly driftingLootSternRest = new Object3D();
  private readonly driftingLootPresentation: DriftingLootPresentation | null;
  private readonly repairTools: Object3D;
  private readonly supplyAnchorBounds = new Map<
    BoatSupplyGroupId,
    BoatObjectBoundsCache | null
  >();
  private readonly fishingAnchorBounds: BoatObjectBoundsCache | null;
  private readonly repairAnchorBounds: BoatObjectBoundsCache | null;
  private readonly lanternAnchorBounds: BoatObjectBoundsCache | null;
  private readonly chestAnchorBounds: BoatObjectBoundsCache | null;
  private readonly rodPivot = new Group();
  private readonly rod: Object3D;
  private readonly fishingLineOrigin = new Object3D();
  private readonly fishingCatchRest = new Group();
  private readonly fishingCatches: FishingCatchLibrary;
  private readonly fishingBiteParticles = new FishingBiteParticles();
  private readonly fishing: FishingVisuals;
  private readonly baseRodPivotRotationX: number;
  private readonly buoyancy = new BoatBuoyancy(
    sampleDefaultWave,
    undefined,
    sampleDefaultWaveInto,
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
  private activeSequence: ActiveSequence | null = null;
  private settledCue: PresentationCue | null = null;
  private weatherEventOperation = 0;
  private disposed = false;

  constructor(
    camera: PerspectiveCamera,
    propModels: PropModelLibrary,
    moonTexture: Texture,
    savedItems: readonly ItemInstance[] = [],
    lifeboatAssets?: LifeboatAssets,
    shipFurniture?: ShipFurnitureLibrary,
    waterQuality: WaterQuality = 'low',
  ) {
    this.scene = new Scene();
    this.sky = new Skybox(
      this.scene,
      this.skyState,
      moonTexture,
      {
        sun: SURVIVAL_CELESTIAL_DIRECTION,
        moon: SURVIVAL_CELESTIAL_DIRECTION,
      },
    );
    this.weatherEffects = new WeatherEffects(this.scene);
    this.camera = camera;
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();

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
    this.driftingLootSternRest.name = 'drifting-loot-stern-rest';
    this.driftingLootSternRest.position.set(
      DRIFTING_LOOT_STERN_REST.x,
      DRIFTING_LOOT_STERN_REST.y,
      DRIFTING_LOOT_STERN_REST.z,
    );
    this.boat.add(this.driftingLootSternRest);
    this.lantern = createSurvivalLantern(propModels.createPracticalLight('lantern'));
    this.boat.add(this.lantern.root);

    this.supplyDisplay = new BoatSupplyDisplay(
      propModels,
      build.storageRoot,
      savedItems,
    );
    this.boat.add(this.chestDisplay.root);
    this.weatherEventAnimator = new WeatherEventAnimator(
      this.cameraRig,
      this.supplyDisplay,
    );
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
    this.cameraRig.name = 'boat-camera-rig';
    this.motionRig.add(this.boat, this.cueCameraRig);
    this.cueCameraRig.add(this.cameraRig);
    this.cameraRig.add(camera);
    camera.position.set(0, 0.88, 1.72);
    camera.lookAt(this.baseCameraLookTarget);
    this.baseCameraPosition.copy(camera.position);
    this.baseCameraQuaternion = camera.quaternion.clone();
    this.fishingMatrixScratch.lookAt(
      this.fishingCameraAngleOrigin,
      this.fishingCameraLookTarget,
      camera.up,
    );
    this.fishingCameraQuaternion.setFromRotationMatrix(this.fishingMatrixScratch);
    this.baseRodPivotRotationX = this.rodPivot.rotation.x;

    this.fishingCatches = new FishingCatchLibrary();
    this.fishing = createFishingVisuals(this.ownedGeometries, this.ownedMaterials);
    this.eventPresentation = new EventPresentationLayer();
    this.driftingLootPresentation = shipFurniture === undefined
      ? null
      : new DriftingLootPresentation({
          barrel: shipFurniture.clone('barrel'),
          crate: shipFurniture.clone('cargoCrate'),
        }, this.driftingLootSternRest);

    this.ocean = new OceanRenderer(
      waterQuality,
      SURVIVAL_CELESTIAL_DIRECTION,
    );
    this.key.target.position.set(0, 0, -3);
    alignDirectionalLightWithSun(
      this.key,
      12,
      SURVIVAL_CELESTIAL_DIRECTION,
    );
    this.key.castShadow = true;

    this.scene.add(
      this.motionRig,
      this.ocean.mesh,
      this.ambient,
      this.key,
      this.key.target,
      this.eventPresentation.root,
      this.weatherEventAnimator.worldRoot,
      ...(this.driftingLootPresentation === null
        ? []
        : [this.driftingLootPresentation.root]),
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
    this.applyBasePresentation();
  }

  setPhase(phase: 'day' | 'night'): void {
    if (this.disposed) return;
    this.phase = phase;
    this.skyState.phase = phase;
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
    this.weatherEffects.setLightningStrikeListener(listener);
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.ocean.setQuality(value);
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.supplyDisplay.sync(snapshot);
    this.chestState = snapshot.chest.state;
    this.chestDisplay.sync(snapshot.chest);
  }

  setHighlightedItem(instanceId: string | null): void {
    if (this.disposed) return;
    this.supplyDisplay.setHighlighted(instanceId);
    this.toolHoverOutline.setTarget(
      instanceId === 'repair-tools'
        ? this.repairTools
        : instanceId === 'end-day-lantern'
          ? this.lantern.root
          : instanceId === 'persistent-chest'
            ? this.chestDisplay.root
          : instanceId === 'drifting-loot'
            ? this.driftingLootPresentation?.interactionRoot() ?? null
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
  ): Promise<void> {
    if (this.disposed) return;
    const operation = ++this.weatherEventOperation;
    if (
      eventId === 'dangerous-waters'
      && this.supplyDisplay.pinEventActor(instanceId)
    ) {
      this.dangerousWatersItemId = instanceId;
      try {
        await this.eventPresentation.playChoice(eventId, choiceId);
      } finally {
        if (!this.disposed && operation === this.weatherEventOperation) {
          this.dangerousWatersItemId = null;
          this.supplyDisplay.clearEventMotion();
        }
      }
      return;
    }
    if (await this.weatherEventAnimator.playItemUse(eventId, choiceId, instanceId)) {
      return;
    }
    if (this.disposed || operation !== this.weatherEventOperation) return;
    await this.supplyDisplay.playEventItemUse(instanceId);
  }

  playEventChoice(eventId: string, choiceId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.weatherEventOperation += 1;
    return this.eventPresentation.playChoice(eventId, choiceId);
  }

  stageEvent(eventId: string, variant: DriftingLootVariant | null = null): void {
    if (this.disposed) return;
    this.weatherEventOperation += 1;
    if (eventId === 'drifting-loot' && this.driftingLootPresentation !== null) {
      if (variant === null) throw new Error('Drifting loot requires a variant.');
      this.eventPresentation.clear();
      this.weatherEventAnimator.clear();
      this.driftingLootPresentation.stage(variant);
      return;
    }
    this.driftingLootPresentation?.clear();
    this.eventPresentation.stage(eventId);
    this.weatherEventAnimator.stage(eventId);
  }

  async revealEvent(eventId: string): Promise<void> {
    if (this.disposed) return;
    this.weatherEventOperation += 1;
    if (eventId === 'drifting-loot' && this.driftingLootPresentation !== null) {
      await this.driftingLootPresentation.reveal();
      return;
    }
    await Promise.all([
      this.eventPresentation.reveal(eventId),
      this.weatherEventAnimator.reveal(eventId),
    ]);
  }

  retrieveDriftingLoot(): Promise<void> {
    if (this.disposed || this.driftingLootPresentation === null) return Promise.resolve();
    this.toolHoverOutline.setTarget(null);
    return this.driftingLootPresentation.retrieve();
  }

  recedeDriftingLoot(): Promise<void> {
    if (this.disposed || this.driftingLootPresentation === null) return Promise.resolve();
    this.toolHoverOutline.setTarget(null);
    return this.driftingLootPresentation.recede();
  }

  projectDriftingLoot(width: number, height: number): ProjectedBoatBounds | null {
    if (this.disposed || this.driftingLootPresentation === null) return null;
    this.scene.updateMatrixWorld(true);
    return this.driftingLootPresentation.projectHeld(this.camera, width, height);
  }

  async reactToEventOutcome(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null = null,
  ): Promise<void> {
    if (this.disposed) return;
    this.weatherEventOperation += 1;
    await Promise.all([
      this.eventPresentation.react(eventId, outcome),
      this.weatherEventAnimator.react(eventId, outcome, response),
    ]);
  }

  clearEvent(): void {
    if (this.disposed) return;
    this.weatherEventOperation += 1;
    this.eventPresentation.clear();
    this.driftingLootPresentation?.clear();
    this.weatherEventAnimator.clear();
    this.dangerousWatersItemId = null;
    this.supplyDisplay.clearEventMotion();
  }

  setDocumentHidden(hidden: boolean): void {
    if (this.disposed || !hidden) return;
    this.weatherEventOperation += 1;
    this.skipSequence();
    this.eventPresentation.settleForVisibilityChange();
    this.weatherEventAnimator.settleForVisibilityChange();
    this.dangerousWatersItemId = null;
    this.supplyDisplay.settleEventItemUse();
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
    const driftingLootProjection = this.driftingLootPresentation?.projectInteraction(
      this.camera,
      width,
      height,
    ) ?? null;
    const driftingLootAnchor = driftingLootProjection === null
      ? null
      : {
          id: 'drifting-loot',
          label: driftingLootProjection.variant === 'barrel' ? 'BARREL' : 'CRATE',
          description: 'Floating salvage within reach.',
          eventChoiceId: 'retrieve',
          itemType: null,
          toolId: null,
          action: null,
          x: driftingLootProjection.bounds.x,
          y: driftingLootProjection.bounds.y,
          visible: driftingLootProjection.bounds.visible,
          depleted: false,
          remainingUses: null,
          quantity: 1,
          usableQuantity: 1,
          brokenQuantity: 0,
          backingInstanceId: null,
          hitArea: {
            width: Math.max(64, driftingLootProjection.bounds.width),
            height: Math.max(64, driftingLootProjection.bounds.height),
            depth: driftingLootProjection.bounds.depth,
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
    return [
      ...itemAnchors,
      fishingAnchor,
      repairAnchor,
      lanternAnchor,
      chestAnchor,
      ...(driftingLootAnchor === null ? [] : [driftingLootAnchor]),
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
    if (!this.activeSequence) return;
    const sequence = this.activeSequence;
    this.activeSequence = null;
    this.settledCue = this.isTerminalCue(sequence.cue) ? sequence.cue : null;
    this.applyBasePresentation();
    this.applyCue(sequence.cue, 1, sequence.duration);
    sequence.resolve();
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
    this.buoyancy.sampleTargetInto(
      this.boatTargetPose,
      time,
      SURVIVAL_BOAT_ANCHOR.x,
      SURVIVAL_BOAT_ANCHOR.z,
      amplitudeScale,
    );
    smoothBoatPoseInto(this.boatPose, this.boatPose, this.boatTargetPose, delta, 7);
    this.applyBasePresentation();
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.sky.update(
      delta,
      this.skyState,
      this.worldCameraPosition,
    );
    this.applyBaseLighting(this.sky.palette);
    if (this.settledCue) this.applyCue(this.settledCue, 1, time);
    this.supplyDisplay.updatePropAnimations(delta);

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
      this.driftingLootPresentation?.update(time, delta);
      this.weatherEventAnimator.update(time, delta);
      this.applyDangerousWatersPresentation();
      this.supplyDisplay.update(delta);
      this.updateFishingBiteParticles(delta);
    }
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
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  dispose(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.setHighlightedItem(null),
      () => {
        this.disposed = true;
        this.weatherEventOperation += 1;
      },
      () => this.cancelActiveSequence(),
      () => this.weatherEventAnimator.dispose(),
      () => this.supplyDisplay.dispose(),
      () => this.chestDisplay.dispose(),
      () => this.toolHoverOutline.dispose(),
      () => this.eventPresentation.dispose(),
      () => this.driftingLootPresentation?.dispose(),
      () => this.lantern.dispose(),
      () => this.cancelActiveFishingAnimation(),
      () => this.fishingCatches.dispose(),
      () => this.ocean.dispose(),
      () => this.weatherEffects.dispose(),
      () => this.fishingBiteParticles.dispose(),
      () => this.sky.dispose(),
      () => this.scene.remove(
        this.motionRig,
        this.ocean.mesh,
        this.ambient,
        this.key,
        this.key.target,
        this.fishing.root,
        this.fishingBiteParticles.points,
      ),
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
      this.motionRig.rotation.x += reaction.pitch;
      this.motionRig.rotation.y += reaction.yaw;
      this.motionRig.rotation.z += reaction.roll;
      this.cueCameraRig.position.z += reaction.cameraZ;
      this.ambient.intensity *= reaction.lightScale;
      this.key.intensity *= reaction.lightScale;
    }
    if (
      this.dangerousWatersItemId !== null
      && this.eventPresentation.copyDangerousWatersItemPose(
        this.dangerousWatersItemPose,
      )
    ) {
      this.supplyDisplay.applyEventItemPose(
        this.dangerousWatersItemId,
        this.dangerousWatersItemPose,
      );
    }
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
    sampleDefaultWaveInto(
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
    this.lantern.light.intensity = this.phase === 'night'
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
        this.cueCameraRig.position.z -= pulse * 0.08;
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

  private cancelActiveSequence(): void {
    const sequence = this.activeSequence;
    this.activeSequence = null;
    sequence?.resolve();
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
