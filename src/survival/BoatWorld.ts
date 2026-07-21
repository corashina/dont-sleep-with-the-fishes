import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  Line,
  LineBasicMaterial,
  Material,
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
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { createWaterExclusion } from '../ocean/WaterExclusion';
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
import { boatStorageTransform } from '../world/BoatStorage';
import { createLifeboat, type LifeboatBuild } from '../world/Lifeboat';
import { createProp } from '../world/PropFactory';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';
import { Skybox } from '../world/Skybox';
import type { SkyPalette } from '../world/skyPalette';
import {
  ACTION_FOR_ITEM,
  projectBoatBounds,
  type BoatInteractionAnchor,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import { BoatSpray } from './BoatSpray';
import { FishingCatchLibrary } from './FishingCatchLibrary';
import type { FishingCatchId } from './fishingCatalog';
import type {
  PresentationCue,
  SurvivalSnapshot,
  WeatherId,
} from './survivalTypes';

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
const INITIAL_BOAT_POSE: BoatPose = {
  y: 0,
  pitch: 0,
  roll: 0,
  driftX: 0,
  driftZ: 0,
};

function weatherAmplitudeScale(weather: WeatherId): number {
  if (weather === 'squall') return 1.35;
  if (weather === 'overcast') return 1;
  return 0.78;
}

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
  readonly bubbles: Group;
  readonly ripples: Group;
  readonly catchDisplay: Group;
}

interface SavedProp {
  instance: ItemInstance;
  prop: Object3D;
  materials: readonly ConditionMaterialBinding[];
}

interface ConditionMaterialBinding {
  readonly mesh: Mesh;
  readonly usable: Material | Material[];
  readonly broken: Material | Material[];
}

interface InteractionHighlightState {
  emissive: number;
  emissiveIntensity: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const easeInOut = (value: number): number => value * value * (3 - 2 * value);

const FISHING_CAMERA_DURATION = 1;
const FISHING_CAST_DURATION = 0.8;
const FISHING_REEL_DURATION = 1;
const FISHING_MISS_DURATION = 0.8;
const FISHING_REDUCED_DURATION = Number.EPSILON;
const FISHING_CAST_MIN_X = -2.7;
const FISHING_CAST_MAX_X = 2.7;
const FISHING_CAST_MIN_Z = -7.4;
const FISHING_CAST_MAX_Z = -3.7;
const CENTERED_FISHING_CAST: FishingCastPoint = Object.freeze({ x: 0, z: -5.3 });
const FISHING_TARGET_SIZE = 52;

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

  const bubbles = new Group();
  bubbles.name = 'fishing-bubbles';
  const bubbleGeometry = new SphereGeometry(0.055, 6, 4);
  const bubbleMaterial = new MeshStandardMaterial({
    color: 0xb7d9d6,
    roughness: 0.3,
    transparent: true,
    opacity: 0.68,
    flatShading: true,
  });
  for (let index = 0; index < 6; index += 1) {
    const bubble = addOwnedFishingMesh(
      bubbles,
      bubbleGeometry,
      bubbleMaterial,
      geometries,
      materials,
    );
    const angle = index * Math.PI * 2 / 6;
    bubble.position.set(Math.cos(angle) * 0.21, 0.03 + index * 0.025, Math.sin(angle) * 0.21);
    bubble.scale.setScalar(0.72 + (index % 3) * 0.18);
  }
  bubbles.visible = false;
  root.add(bubbles);

  const ripples = new Group();
  ripples.name = 'fishing-ripples';
  const rippleGeometry = new TorusGeometry(0.24, 0.018, 5, 18);
  const rippleMaterial = new MeshStandardMaterial({
    color: 0xc5d9d3,
    roughness: 0.48,
    transparent: true,
    opacity: 0.62,
    flatShading: true,
  });
  for (let index = 0; index < 3; index += 1) {
    const ripple = addOwnedFishingMesh(
      ripples,
      rippleGeometry,
      rippleMaterial,
      geometries,
      materials,
    );
    ripple.rotation.x = Math.PI / 2;
    ripple.position.y = 0.025 + index * 0.008;
    ripple.scale.setScalar(0.8 + index * 0.45);
  }
  ripples.visible = false;
  root.add(ripples);

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
    bubbles,
    ripples,
    catchDisplay,
  };
}

function brokenMaterial(material: Material): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(new Color(0x384243), 0.68);
    clone.roughness = Math.max(0.82, clone.roughness);
    clone.metalness *= 0.45;
  }
  return clone;
}

function setPropHighlighted(root: Object3D, highlighted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const state = material.userData.interactionHighlight as InteractionHighlightState | undefined;
    if (state === undefined) {
      material.userData.interactionHighlight = {
        emissive: material.emissive.getHex(),
        emissiveIntensity: material.emissiveIntensity,
      } satisfies InteractionHighlightState;
    }
    const original = material.userData.interactionHighlight as InteractionHighlightState;
    if (highlighted) {
      material.emissive.setHex(0x6f4218);
      material.emissiveIntensity = Math.max(.65, original.emissiveIntensity);
    } else {
      material.emissive.setHex(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    }
  });
}

export class BoatWorld {
  readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly reducedMotion: MediaQueryList;
  private readonly ocean: OceanRenderer;
  private readonly sky: Skybox;
  private readonly motionRig = new Group();
  private readonly cameraRig = new Group();
  private readonly boat: Group;
  private readonly ambient = new AmbientLight(0xc4d1cf, 1.1);
  private readonly key = new DirectionalLight(0xffe1b5, 2.2);
  private readonly distantVessel = new Group();
  private readonly vesselMaterial = new MeshStandardMaterial({
    color: 0x172126,
    roughness: 1,
    transparent: true,
    opacity: 0,
  });
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
  private readonly baseCameraLookTarget = new Vector3(0, -0.18, -1.35);
  private readonly bowCameraPosition = new Vector3(0, 1.32, -0.72);
  private readonly bowCameraLookTarget = new Vector3(0, -0.58, -5.3);
  private readonly bowCameraQuaternion = new Quaternion();
  private readonly fishingCameraStartPosition = new Vector3();
  private readonly fishingCameraStartQuaternion = new Quaternion();
  private readonly fishingMatrixScratch = new Matrix4();
  private readonly savedProps: SavedProp[] = [];
  private readonly savedPropByInstanceId = new Map<ItemInstance['instanceId'], Object3D>();
  private readonly repairTools: Object3D;
  private readonly repairToolsBounds = new Box3();
  private readonly rod: Object3D;
  private readonly rodBounds = new Box3();
  private readonly fishingLineOrigin = new Object3D();
  private readonly fishingCatches: FishingCatchLibrary;
  private readonly fishing: FishingVisuals;
  private readonly baseRodRotationZ: number;
  private readonly buoyancy = new BoatBuoyancy(
    sampleDefaultWave,
    undefined,
    sampleDefaultWaveInto,
  );
  private readonly boatPose: BoatPose = { ...INITIAL_BOAT_POSE };
  private readonly boatTargetPose: BoatPose = { ...INITIAL_BOAT_POSE };
  private previousBowWorldY = 0;
  private secondaryMotionInitialized = false;
  private readonly spray = new BoatSpray();
  private readonly bowAnchor = new Object3D();
  private readonly bowWorldPosition = new Vector3();
  private readonly worldCameraPosition = new Vector3();
  private readonly fishingRaycaster = new Raycaster();
  private readonly fishingInteractionPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly fishingNdc = new Vector2();
  private readonly fishingRayHit = new Vector3();
  private readonly fishingLineOriginWorld = new Vector3();
  private readonly fishingLineEndWorld = new Vector3();
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
  private fishingWaveHeight = 0;
  private currentTime = 0;
  private weather: WeatherId = 'calm';
  private phase: 'day' | 'night' = 'day';
  private sprayCooldown = 0;
  private activeSequence: ActiveSequence | null = null;
  private settledCue: PresentationCue | null = null;
  private highlightedItemId: string | null = null;
  private disposed = false;

  constructor(
    camera: PerspectiveCamera,
    reducedMotion: MediaQueryList,
    propModels: PropModelLibrary,
    moonTexture: Texture,
    savedItems: readonly ItemInstance[] = [],
  ) {
    this.scene = new Scene();
    this.sky = new Skybox(
      this.scene,
      { weather: 'calm', phase: 'day', severity: 0 },
      moonTexture,
    );
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();

    const build = createLifeboat();
    this.boat = build.root;
    this.waterExclusion = build.waterExclusion;
    build.textures.forEach((texture) => this.ownedTextures.add(texture));
    savedItems.forEach((instance) => {
      const prop = createProp(propModels, instance);
      const materials: ConditionMaterialBinding[] = [];
      prop.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const usable = object.material;
        const broken = Array.isArray(usable)
          ? usable.map((material) => brokenMaterial(material))
          : brokenMaterial(usable);
        const brokenList = Array.isArray(broken) ? broken : [broken];
        brokenList.forEach((material) => this.ownedMaterials.add(material));
        materials.push({ mesh: object, usable, broken });
      });
      const transform = boatStorageTransform(instance);
      prop.position.copy(transform.position);
      prop.rotation.copy(transform.rotation);
      prop.scale.setScalar(transform.scale);
      build.storageRoot.add(prop);
      this.savedProps.push({ instance, prop, materials });
      this.savedPropByInstanceId.set(instance.instanceId, prop);
      prop.userData.remainingUses = ITEM_DEFINITIONS[instance.type].charges;
      prop.userData.condition = 'usable';
    });

    const repairTools = this.boat.getObjectByName('hull-repair-tools');
    if (repairTools === undefined) throw new Error('Lifeboat requires hull repair tools');
    this.repairTools = repairTools;

    this.rod = propModels.createEquipment('fishingRod');
    this.rod.position.set(1.28, 0.47, -1.65);
    this.rod.rotation.y = -0.08;
    this.fishingLineOrigin.name = 'fishing-line-origin';
    this.fishingLineOrigin.position.set(0, 0.82, 0);
    this.rod.add(this.fishingLineOrigin);
    this.boat.add(this.rod);

    this.motionRig.name = 'boat-motion-rig';
    this.cameraRig.name = 'boat-camera-rig';
    this.motionRig.add(this.boat, this.cameraRig);
    this.cameraRig.add(camera);
    camera.position.set(0, 0.88, 2.35);
    camera.lookAt(this.baseCameraLookTarget);
    this.baseCameraPosition.copy(camera.position);
    this.baseCameraQuaternion = camera.quaternion.clone();
    this.fishingMatrixScratch.lookAt(
      this.bowCameraPosition,
      this.bowCameraLookTarget,
      camera.up,
    );
    this.bowCameraQuaternion.setFromRotationMatrix(this.fishingMatrixScratch);
    this.baseRodRotationZ = this.rod.rotation.z;

    this.fishingCatches = new FishingCatchLibrary();
    this.fishing = createFishingVisuals(this.ownedGeometries, this.ownedMaterials);

    this.bowAnchor.name = 'survival-bow-motion-anchor';
    this.bowAnchor.position.set(0, 0.1, -2.75);
    this.boat.add(this.bowAnchor);

    this.ocean = new OceanRenderer();
    this.key.position.set(-5, 8, 4);
    this.key.target.position.set(0, 0, -3);
    this.key.castShadow = true;

    this.buildDistantVessel();
    this.scene.add(
      this.motionRig,
      this.ocean.mesh,
      this.spray.points,
      this.ambient,
      this.key,
      this.key.target,
      this.distantVessel,
      this.fishing.root,
    );
    collectMeshResources(this.boat, this.ownedGeometries, this.ownedMaterials);
    collectMeshResources(this.distantVessel, this.ownedGeometries, this.ownedMaterials);
    this.applyBasePresentation();
  }

  setPhase(phase: 'day' | 'night'): void {
    if (this.disposed) return;
    this.phase = phase;
  }

  setWeather(weather: WeatherId): void {
    if (this.disposed) return;
    this.weather = weather;
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.savedProps.forEach(({ instance, prop, materials }) => {
      const condition = snapshot.inventory[instance.instanceId]?.condition ?? 'lost';
      const visible = condition === 'usable' || condition === 'broken';
      prop.visible = visible;
      prop.userData.condition = condition;
      prop.userData.depleted = false;
      prop.userData.remainingUses = condition === 'usable'
        ? ITEM_DEFINITIONS[instance.type].charges
        : 0;
      materials.forEach(({ mesh, usable, broken }) => {
        mesh.material = condition === 'broken' ? broken : usable;
      });
    });
    if (this.highlightedItemId !== null) {
      const highlighted = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
      if (highlighted === undefined || !highlighted.visible) this.setHighlightedItem(null);
    }
  }

  setHighlightedItem(instanceId: string | null): void {
    if (this.disposed || instanceId === this.highlightedItemId) return;
    if (this.highlightedItemId !== null) {
      const previous = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
      if (previous !== undefined) setPropHighlighted(previous, false);
    }
    this.highlightedItemId = null;
    if (instanceId === null) return;
    const next = this.savedPropByInstanceId.get(instanceId as ItemInstance['instanceId']);
    if (next === undefined || !next.visible) return;
    setPropHighlighted(next, true);
    this.highlightedItemId = instanceId;
  }

  projectInteractionAnchors(width: number, height: number): BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return [];
    this.scene.updateMatrixWorld(true);

    const itemAnchors = this.savedProps.map(({ instance, prop }) => {
      const projection = projectBoatBounds(
        new Box3().setFromObject(prop, true),
        this.camera,
        width,
        height,
      );
      const { width: hitWidth, height: hitHeight, depth, ...point } = projection;
      return {
        id: instance.instanceId,
        itemType: instance.type,
        toolId: null,
        action: prop.userData.condition === 'usable' ? ACTION_FOR_ITEM[instance.type] ?? null : null,
        ...point,
        visible: prop.visible && point.visible,
        depleted: false,
        remainingUses: prop.userData.remainingUses as number | null,
        hitArea: { width: hitWidth, height: hitHeight, depth },
      } satisfies BoatInteractionAnchor;
    });
    const fishingProjection = projectBoatBounds(
      this.rodBounds.setFromObject(this.rod, true),
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
      hitArea: {
        width: fishingHitWidth,
        height: fishingHitHeight,
        depth: fishingDepth,
      },
    } satisfies BoatInteractionAnchor;
    const repairProjection = projectBoatBounds(
      this.repairToolsBounds.setFromObject(this.repairTools, true),
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
      hitArea: { width: hitWidth, height: hitHeight, depth },
    } satisfies BoatInteractionAnchor;
    return [...itemAnchors, fishingAnchor, repairAnchor];
  }

  enterFishingView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.fishingCameraStartPosition.copy(this.camera.position);
    this.fishingCameraStartQuaternion.copy(this.camera.quaternion);
    this.fishingPhase = 'entering';
    return this.startFishingAnimation(
      'enter',
      this.reducedMotion.matches ? FISHING_REDUCED_DURATION : FISHING_CAMERA_DURATION,
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
    this.fishingPhase = 'casting';
    return this.startFishingAnimation(
      'cast',
      this.reducedMotion.matches ? FISHING_REDUCED_DURATION : FISHING_CAST_DURATION,
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

  playFishingReel(catchId: FishingCatchId): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.hasFishingCast) this.setFishingCastPoint(CENTERED_FISHING_CAST);
    this.activeFishingCatch = this.fishingCatches.prepare(catchId);
    this.activeFishingCatch.position.set(0, 0, 0);
    this.activeFishingCatch.rotation.set(0, 0, 0);
    this.fishing.catchDisplay.add(this.activeFishingCatch);
    this.fishingPhase = 'reeling';
    return this.startFishingAnimation(
      'reel',
      this.reducedMotion.matches ? FISHING_REDUCED_DURATION : FISHING_REEL_DURATION,
    );
  }

  playFishingMiss(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.hasFishingCast) this.setFishingCastPoint(CENTERED_FISHING_CAST);
    this.fishingPhase = 'missing';
    return this.startFishingAnimation(
      'miss',
      this.reducedMotion.matches ? FISHING_REDUCED_DURATION : FISHING_MISS_DURATION,
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
      this.reducedMotion.matches ? FISHING_REDUCED_DURATION : FISHING_CAMERA_DURATION,
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
    if (this.disposed || delta <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    this.currentTime = time;
    const amplitudeScale = weatherAmplitudeScale(this.weather);
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
      { weather: this.weather, phase: this.phase, severity: 0 },
      this.worldCameraPosition,
    );
    this.applyBaseLighting(this.sky.palette);
    if (this.settledCue) this.applyCue(this.settledCue, 1, time);

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
    this.updateFishingWave(time);
    this.updateFishingEffects(time);

    this.updateSecondaryMotion(delta);

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
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  dispose(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.setHighlightedItem(null),
      () => { this.disposed = true; },
      () => this.cancelActiveSequence(),
      () => this.cancelActiveFishingAnimation(),
      () => this.fishingCatches.dispose(),
      () => this.ocean.dispose(),
      () => this.spray.dispose(),
      () => this.sky.dispose(),
      () => this.scene.remove(
        this.motionRig,
        this.ocean.mesh,
        this.spray.points,
        this.ambient,
        this.key,
        this.key.target,
        this.distantVessel,
        this.fishing.root,
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

  private buildDistantVessel(): void {
    this.distantVessel.name = 'distant-rescue-vessel';
    this.distantVessel.position.set(-9, 1.25, -48);
    const hull = new Mesh(new BoxGeometry(8.5, 1.05, 1.2), this.vesselMaterial);
    const cabin = new Mesh(new BoxGeometry(2.2, 1.15, 0.86), this.vesselMaterial);
    const mast = new Mesh(new BoxGeometry(0.12, 3.2, 0.12), this.vesselMaterial);
    cabin.position.set(1.2, 0.85, 0);
    mast.position.set(-0.7, 1.75, 0);
    this.distantVessel.add(hull, cabin, mast);
    this.distantVessel.visible = false;
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
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
    this.rod.rotation.z = this.baseRodRotationZ;
    this.distantVessel.visible = false;
    this.vesselMaterial.opacity = 0;
  }

  private startFishingAnimation(
    kind: FishingAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveFishingAnimation();
    return new Promise<void>((resolve) => {
      this.activeFishingAnimation = { kind, duration, elapsed: 0, resolve };
      this.applyFishingPhasePresentation();
      this.applyFishingAnimation(kind, this.reducedMotion.matches ? 1 : 0);
    });
  }

  private advanceFishingPresentation(delta: number): void {
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
    this.fishing.bubbles.visible = false;
    this.fishing.ripples.visible = false;
    this.fishing.catchDisplay.visible = false;
    if (this.fishingPhase === 'idle') return;

    this.rod.rotation.z = this.baseRodRotationZ;
    if (this.fishingPhase === 'entering' || this.fishingPhase === 'returning') return;
    this.camera.position.copy(this.bowCameraPosition);
    this.camera.quaternion.copy(this.bowCameraQuaternion);
    if (this.fishingPhase === 'ready') return;

    this.fishing.line.visible = true;
    this.fishing.bobber.visible = true;
    if (this.fishingPhase === 'bite') {
      this.fishing.bubbles.visible = true;
      this.fishing.ripples.visible = true;
    } else if (this.fishingPhase === 'reeling') {
      this.fishing.catchDisplay.visible = this.activeFishingCatch !== null;
    }
  }

  private applyFishingAnimation(kind: FishingAnimationKind, progress: number): void {
    const normalized = clamp(progress, 0, 1);
    const eased = easeInOut(normalized);
    switch (kind) {
      case 'enter':
        if (normalized === 1) {
          this.camera.position.copy(this.bowCameraPosition);
          this.camera.quaternion.copy(this.bowCameraQuaternion);
        } else {
          this.camera.position.lerpVectors(
            this.fishingCameraStartPosition,
            this.bowCameraPosition,
            eased,
          );
          this.camera.quaternion.copy(this.fishingCameraStartQuaternion)
            .slerp(this.bowCameraQuaternion, eased);
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
            eased,
          );
          this.camera.quaternion.copy(this.fishingCameraStartQuaternion)
            .slerp(this.baseCameraQuaternion, eased);
        }
        break;
      case 'cast': {
        const swing = this.reducedMotion.matches ? 0.05 : 0.68;
        this.rod.rotation.z = this.baseRodRotationZ - Math.sin(Math.PI * normalized) * swing;
        this.fishing.splash.visible = normalized >= 0.68 && normalized < 1;
        break;
      }
      case 'reel': {
        const swing = this.reducedMotion.matches ? 0.04 : 0.34;
        this.rod.rotation.z = this.baseRodRotationZ - Math.sin(Math.PI * normalized) * swing;
        if (this.activeFishingCatch) {
          this.activeFishingCatch.position.y = eased * (this.reducedMotion.matches ? 0.18 : 1.5);
          this.activeFishingCatch.rotation.z = this.reducedMotion.matches
            ? 0
            : Math.sin(normalized * Math.PI * 2) * 0.16 * (1 - normalized);
        }
        break;
      }
      case 'miss': {
        const swing = this.reducedMotion.matches ? 0.025 : 0.18;
        this.rod.rotation.z = this.baseRodRotationZ + Math.sin(Math.PI * normalized) * swing;
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
        break;
      case 'reel':
      case 'miss':
        this.resetFishingVisuals();
        this.fishingPhase = 'ready';
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
    this.fishing.bubbles.visible = false;
    this.fishing.ripples.visible = false;
    this.fishing.catchDisplay.visible = false;
    this.fishingCatches.hide();
    this.activeFishingCatch = null;
    this.hasFishingCast = false;
    this.rod.rotation.z = this.baseRodRotationZ;
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

  private updateFishingWave(time: number): void {
    if (!this.hasFishingCast) return;
    sampleDefaultWaveInto(
      this.fishingWaveSample,
      time,
      this.fishingCastPosition.x,
      this.fishingCastPosition.z,
      weatherAmplitudeScale(this.weather),
    );
    this.fishingWaveHeight = this.fishingWaveSample.height;
    this.fishing.bobber.position.set(
      this.fishingCastPosition.x,
      this.fishingWaveHeight,
      this.fishingCastPosition.z,
    );
    this.fishing.splash.position.copy(this.fishing.bobber.position);
    this.fishing.bubbles.position.copy(this.fishing.bobber.position);
    this.fishing.ripples.position.copy(this.fishing.bobber.position);
    this.fishing.catchDisplay.position.copy(this.fishing.bobber.position);
  }

  private updateFishingEffects(time: number): void {
    const animateBiteEffects = !this.reducedMotion.matches;
    if (this.fishing.bubbles.visible) {
      for (let index = 0; index < this.fishing.bubbles.children.length; index += 1) {
        const bubble = this.fishing.bubbles.children[index]!;
        bubble.position.y = 0.03 + index * 0.025
          + (animateBiteEffects ? Math.sin(time * 3.4 + index) * 0.035 : 0);
      }
    }
    if (this.fishing.ripples.visible) {
      for (let index = 0; index < this.fishing.ripples.children.length; index += 1) {
        const ripple = this.fishing.ripples.children[index]!;
        const scale = 0.75 + index * 0.45
          + (animateBiteEffects ? (Math.sin(time * 2.8 + index) + 1) * 0.09 : 0.09);
        ripple.scale.setScalar(scale);
      }
    }
    if (this.fishing.splash.visible && this.activeFishingAnimation?.kind === 'cast') {
      const progress = this.activeFishingAnimation.elapsed / this.activeFishingAnimation.duration;
      for (let index = 0; index < this.fishing.splash.children.length; index += 1) {
        this.fishing.splash.children[index]!.position.y = 0.05
          + Math.sin(Math.PI * progress) * (0.14 + (index % 2) * 0.1);
      }
    }
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
      this.fishingLineEndWorld.y = this.fishingLineOriginWorld.y
        + (this.fishingWaveHeight + 0.075 - this.fishingLineOriginWorld.y) * progress
        + Math.sin(Math.PI * progress) * (this.reducedMotion.matches ? 0.08 : 1.15);
      this.fishing.bobber.position.copy(this.fishingLineEndWorld);
    } else if (animation?.kind === 'reel' && this.activeFishingCatch) {
      this.fishingLineEndWorld.y += this.activeFishingCatch.position.y;
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

  private updateSecondaryMotion(delta: number): void {
    const reduced = this.reducedMotion.matches;
    if (reduced) {
      this.spray.reset();
      this.sprayCooldown = 0;
      this.secondaryMotionInitialized = false;
      return;
    }

    this.spray.update(delta);
    this.scene.updateMatrixWorld(true);
    this.bowAnchor.getWorldPosition(this.bowWorldPosition);
    const dt = Math.min(delta, 0.1);
    const bowVelocity = this.secondaryMotionInitialized && dt > 0
      ? (this.bowWorldPosition.y - this.previousBowWorldY) / dt : 0;
    const bowImpact = clamp((bowVelocity - 0.2) / 0.8, 0, 1);
    this.previousBowWorldY = this.bowWorldPosition.y;
    this.secondaryMotionInitialized = true;
    this.sprayCooldown = Math.max(0, this.sprayCooldown - Math.min(delta, 0.1));
    if (bowImpact >= 0.25 && this.sprayCooldown === 0) {
      this.spray.emit(this.bowWorldPosition, bowImpact);
      this.sprayCooldown = this.weather === 'squall' ? 0.18 : 0.35;
    }

  }

  private applyBaseLighting(atmosphere: Readonly<SkyPalette>): void {
    this.ambient.color.copy(atmosphere.ambientLightColor);
    this.ambient.intensity = atmosphere.ambientLightIntensity;
    this.key.color.copy(atmosphere.keyLightColor);
    this.key.intensity = atmosphere.keyLightIntensity;
    if (this.scene.background instanceof Color) {
      this.scene.background.copy(atmosphere.horizonColor);
    } else {
      this.scene.background = atmosphere.horizonColor.clone();
    }
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(atmosphere.fogColor);
      this.scene.fog.density = atmosphere.fogDensity;
    } else {
      this.scene.fog = new FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
    }
  }

  private applyCue(cue: PresentationCue, progress: number, elapsed: number): void {
    const eased = easeOut(clamp(progress, 0, 1));
    const pulse = Math.sin(Math.PI * clamp(progress, 0, 1));
    const reduced = this.reducedMotion.matches;
    switch (cue) {
      case 'none':
        break;
      case 'fish':
        this.rod.rotation.z = this.baseRodRotationZ - eased * (reduced ? 0.035 : 0.12);
        break;
      case 'dive':
        if (!reduced) this.cameraRig.position.y -= pulse * 0.72;
        (this.scene.fog as FogExp2).density += pulse * 0.035;
        this.sky.setTint(DIVE_SKY_TINT, pulse * 0.8);
        if (this.scene.background instanceof Color) {
          this.scene.background.lerp(DIVE_SKY_TINT, pulse * 0.8);
        }
        break;
      case 'repair':
        if (!reduced) {
          this.camera.rotateY(-0.18 * eased);
          this.camera.rotateX(-0.035 * eased);
        }
        this.key.intensity *= 1 + pulse * 0.18;
        break;
      case 'treat':
        this.ambient.intensity *= 1 + pulse * 0.12;
        break;
      case 'storm':
        if (!reduced) {
          this.motionRig.rotation.x += Math.sin(elapsed * 18) * 0.025 * (1 - progress);
          this.motionRig.rotation.z += Math.sin(elapsed * 23) * 0.035 * (1 - progress);
        }
        break;
      case 'impact':
        if (!reduced) {
          this.motionRig.rotation.x += pulse * 0.075;
          this.cameraRig.position.z -= pulse * 0.08;
        }
        break;
      case 'darkness':
        this.ambient.intensity *= 1 - eased * 0.68;
        this.key.intensity *= 1 - eased * 0.72;
        break;
      case 'sighting':
        this.distantVessel.visible = progress > 0.08;
        this.vesselMaterial.opacity = 0.16 + eased * 0.38;
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
        this.distantVessel.visible = true;
        this.vesselMaterial.opacity = 0.25 + eased * 0.75;
        if (!reduced) this.camera.rotateY(-0.12 * eased);
        break;
      case 'death':
        this.ambient.intensity *= 1 - eased * 0.88;
        this.key.intensity *= 1 - eased * 0.9;
        break;
      case 'sinking':
        if (!reduced) this.motionRig.position.y -= eased * 1.05;
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
