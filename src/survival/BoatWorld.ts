import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  DAY_ACTION_ONLY_ITEM_IDS,
  ITEM_DEFINITIONS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import type { WaterQuality } from '../rendering/waterQuality';
import {
  createWaterExclusion,
  type WaterExclusionRegion,
} from '../ocean/WaterExclusion';
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
import { createLifeboat } from '../world/Lifeboat';
import { LifeboatAssets } from '../world/LifeboatAssets';
import { createRepairToolbox } from '../world/RepairToolbox';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
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
  type BoatInteractionAnchor,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import { BoatInteractionProjector } from './BoatInteractionProjector';
import { BoatSupplyDisplay } from './BoatSupplyDisplay';
import { BoatCameraController } from './BoatCameraController';
import { CarlitosDelegationPresentation } from './CarlitosDelegationPresentation';
import { CarlitosPresentation } from './CarlitosPresentation';
import { ChestDisplay } from './ChestDisplay';
import { DivePresentationController } from './DivePresentationController';
import type { DangerousWatersBoatReaction } from './DangerousWatersPresentation';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { EventPresentationAdapter } from './EventPresentationAdapter';
import { EventPresentationHost } from './EventPresentationHost';
import { EventPresentationRegistry } from './EventPresentationRegistry';
import { EventItemEffects } from './EventItemEffects';
import { EventItemUseAdapter } from './EventItemUseAdapter';
import {
  EventItemUseController,
  type EventItemUseRequest,
} from './EventItemUseController';
import {
  resolveEventItemUseContext,
} from './eventItemUseChoreography';
import type { EventModelLibrary } from './EventModelLibrary';
import {
  type EventChoicePresentation,
  type FocusedEventPresentationFactories,
} from './FocusedEventPresentation';
import type { EventPresentationCue } from './midnightTourAudioCue';
import {
  driftingItemLeaveKey,
  driftingItemRetrieveKey,
  type DriftingItemEventId,
} from './eventCatalog';
import {
  eventPresentationRoute,
  isEventPresentationRoute,
  type FeaturedEventId,
} from './eventPresentationRoutes';
import type {
  EventOutcomePresentation,
  EventSceneContext,
} from './eventPresentationTypes';
import type { FishingCatchId } from './fishingCatalog';
import {
  FISHING_ROD_LEAN,
  FishingPresentation,
  type FishingCastPoint,
} from './FishingPresentation';
import {
  createHangingLantern,
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_NIGHT_INTENSITY,
  type HangingLantern,
} from './HangingLantern';
import {
  createSurvivalLantern,
  type SurvivalLantern,
} from './SurvivalLantern';
import type {
  ActionOutcome,
  EventPresentationKey,
  PresentationCue,
  WeatherId,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { SurvivalEventId } from './eventCatalog';
import {
  eventSideFromSeed,
  oppositeEventSide,
  type EventSide,
} from './eventVariant';
import {
  EMPTY_SURVIVAL_EVENT_MODELS,
  type SurvivalEventModels,
} from './SurvivalEventModelLibrary';
import { RepairToolboxAnimation } from './RepairToolboxAnimation';

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
const SURVIVAL_BOAT_ANCHOR = new Vector3(0, 0.22, 0);
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

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;
const DRIFTING_ITEM_BOW_REST = Object.freeze({
  x: 0.72,
  y: 0.58,
  z: -2.52,
});
const FLOWERS_DECK_TARGET = Object.freeze({
  x: 0.72,
  y: 0.58,
  z: 1.05,
});
const CHECK_BACK_STERN_FLOOR = Object.freeze({
  x: 0,
  y: -0.16,
  z: 2.3,
});
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
  private readonly hangingLantern: HangingLantern;
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
  private readonly oceanExclusion: WaterExclusionRegion;
  private readonly oceanExclusions: readonly WaterExclusionRegion[];
  private readonly originalCameraParent: Object3D | null;
  private readonly originalCameraPosition: Vector3;
  private readonly originalCameraQuaternion: Quaternion;
  private readonly cameraController: BoatCameraController;
  private readonly baseCameraLookTarget = new Vector3(0, 0.88, -1.55);
  private readonly diveController: DivePresentationController;
  private readonly supplyDisplay: BoatSupplyDisplay;
  private readonly carlitos: CarlitosPresentation;
  private readonly carlitosDelegation: CarlitosDelegationPresentation;
  private readonly chestDisplay: ChestDisplay;
  private readonly itemEffects: EventItemEffects;
  private readonly itemUseAdapter: EventItemUseAdapter;
  private readonly itemUseController: EventItemUseController;
  private readonly eventPresentationHost = new EventPresentationHost();
  private readonly interactionProjector: BoatInteractionProjector;
  private readonly eventPresentationRegistry = new EventPresentationRegistry();
  private fallbackEventPresentation: EventPresentationAdapter | null = null;
  private readonly rescueCueCallbacks = new WeakMap<
    EventPresentationAdapter,
    (progress: number | null) => void
  >();
  private activeRescueCueCallback: ((progress: number | null) => void) | null = null;
  private eventCueHandler: (cue: EventPresentationCue) => void = () => undefined;
  private readonly fallbackDedicatedEventModels: EventModelLibrary | null;
  private readonly fallbackFeaturedEventModels: SurvivalEventModels | null;
  private readonly focusedEventFactories: FocusedEventPresentationFactories;
  private chestState: SurvivalSnapshot['chest']['state'] = 'none';
  private readonly toolHoverOutline = new HoverOutline();
  private readonly applyDangerousWatersReaction = (
    reaction: Readonly<DangerousWatersBoatReaction>,
  ): void => {
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
  };
  private readonly driftingItemBowRest = new Object3D();
  private readonly flowersDeckTarget = new Object3D();
  private readonly checkBackSternFloor = new Object3D();
  private activeFeaturedEventId: FeaturedEventId | null = null;
  private readonly repairTools: Object3D;
  private readonly repairToolboxAnimation: RepairToolboxAnimation;
  private readonly rodPivot = new Group();
  private readonly rod: Object3D;
  private readonly fishingPresentation: FishingPresentation;
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
  private readonly moonItemAimTarget = new Object3D();
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
  constructor(
    camera: PerspectiveCamera,
    private readonly propModels: PropModelLibrary,
    moonTexture: Texture,
    savedItems: readonly ItemInstance[] = [],
    lifeboatAssets?: LifeboatAssets,
    shipFurniture?: ShipFurnitureLibrary,
    waterQuality: WaterQuality = 'low',
    models?: SurvivalEventModels | EventModelLibrary | FocusedEventPresentationFactories,
    eventModels?: EventModelLibrary,
    focusedEventFactories: FocusedEventPresentationFactories = {},
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
    this.fallbackDedicatedEventModels = dedicatedEventModels
      ?? createEmptyEventModelLibraryForTest();
    this.fallbackFeaturedEventModels = featuredEventModels ?? (
      shipFurniture === undefined
        ? EMPTY_SURVIVAL_EVENT_MODELS
        : {
            clone: (id) => {
              if (id === 'driftingBarrel') return shipFurniture.clone('barrel');
              return EMPTY_SURVIVAL_EVENT_MODELS.clone(id);
            },
          } satisfies SurvivalEventModels
    );
    this.focusedEventFactories = resolvedFocusedFactories;
    this.scene = new Scene();
    this.camera = camera;
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();
    let sky: Skybox | null = null;
    let weatherEffects: WeatherEffects | null = null;
    let lantern: SurvivalLantern | null = null;
    let hangingLantern: HangingLantern | null = null;
    let carlitos: CarlitosPresentation | null = null;
    let carlitosDelegation: CarlitosDelegationPresentation | null = null;
    let supplyDisplay: BoatSupplyDisplay | null = null;
    let chestDisplay: ChestDisplay | null = null;
    let itemUseAdapter: EventItemUseAdapter | null = null;
    let itemUseController: EventItemUseController | null = null;
    let diveController: DivePresentationController | null = null;
    let fishingPresentation: FishingPresentation | null = null;
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
      this.oceanExclusion = createWaterExclusion(
        this.boat,
        build.waterExclusion.halfWidth,
        build.waterExclusion.halfLength,
        build.waterExclusion.taperStart,
        build.waterExclusion.minimumLocalY,
      );
      this.oceanExclusions = [this.oceanExclusion];
      collectMeshResources(this.boat, this.ownedGeometries, this.ownedMaterials);
      this.driftingItemBowRest.name = 'drifting-item-bow-rest';
      this.driftingItemBowRest.position.set(
        DRIFTING_ITEM_BOW_REST.x,
        DRIFTING_ITEM_BOW_REST.y,
        DRIFTING_ITEM_BOW_REST.z,
      );
      this.boat.add(this.driftingItemBowRest);
      this.flowersDeckTarget.name = 'flowers-deck-target';
      this.flowersDeckTarget.position.set(
        FLOWERS_DECK_TARGET.x,
        FLOWERS_DECK_TARGET.y,
        FLOWERS_DECK_TARGET.z,
      );
      this.boat.add(this.flowersDeckTarget);
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
      hangingLantern = createHangingLantern(
        propModels.createPracticalLight('lantern'),
      );
      this.hangingLantern = hangingLantern;
      this.boat.add(hangingLantern.root);

      carlitos = new CarlitosPresentation(propModels);
      this.carlitos = carlitos;
      carlitosDelegation = new CarlitosDelegationPresentation(carlitos);
      this.carlitosDelegation = carlitosDelegation;
      this.boat.add(carlitos.root);

      supplyDisplay = new BoatSupplyDisplay(
        propModels,
        build.storageRoot,
        savedItems,
      );
      this.supplyDisplay = supplyDisplay;
      chestDisplay = new ChestDisplay(
        propModels.createEventModel('chestClosed')?.root ?? null,
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
      this.boat.add(this.chestDisplay.root);

      const repairHammer = propModels.createEquipment('hammer');
      const repairTools = createRepairToolbox(repairHammer);
      repairTools.position.set(-1.05, 0.225, 0.78);
      repairTools.rotation.y = -Math.PI / 2;
      repairTools.scale.setScalar(0.72);
      this.boat.add(repairTools);
      collectMeshResources(repairTools, this.ownedGeometries, this.ownedMaterials);
      this.repairTools = repairTools;
      this.repairToolboxAnimation = new RepairToolboxAnimation(
        this.boat,
        repairTools,
        repairHammer,
      );

      this.rodPivot.name = 'fishing-rod-pivot';
      this.rodPivot.position.set(0, 0.56, -2.28);
      this.rodPivot.rotation.x = FISHING_ROD_LEAN;
      this.rod = propModels.createEquipment('fishingRod');
      collectMeshResources(this.rod, this.ownedGeometries, this.ownedMaterials);
      this.rod.position.set(0, 0, -0.9);
      this.rod.rotation.x = -Math.PI / 2;
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
      this.cameraController = new BoatCameraController(
        camera,
        this.cameraRig,
        this.baseCameraLookTarget,
      );
      diveController = new DivePresentationController({
        camera,
        cameraControl: this.cameraController,
        supplies: this.supplyDisplay,
        sampleWorldWaveInto: this.sampleWorldWaveInto,
        readWorldWaveAmplitudeScale: this.readWorldWaveAmplitudeScale,
        goggleModel: propModels.create({
          instanceId: 'dive-goggles-model' as ItemInstanceId,
          type: 'scubaSet',
        }),
      });
      this.diveController = diveController;
      fishingPresentation = FishingPresentation.create({
        camera,
        cameraControl: this.cameraController,
        resetBasePresentation: () => this.applyBasePresentation(),
        sampleWaveInto: this.sampleWorldWaveInto,
        waveAmplitudeScale: this.readWorldWaveAmplitudeScale,
        rodPivot: this.rodPivot,
        rod: this.rod,
        boatRoot: this.boat,
        worldRoot: this.scene,
      });
      this.fishingPresentation = fishingPresentation;
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
        this.ocean.mesh,
        this.ambient,
        this.key,
        this.key.target,
        this.itemEffects.root,
      );
      this.interactionProjector = new BoatInteractionProjector(
        this.scene,
        this.camera,
        {
          supplyRecords: this.supplyDisplay.records(),
          carlitosRoot: this.carlitos.root,
          carlitosInteractionRoot: this.carlitos.interactionRoot,
          fishingRoot: this.rodPivot,
          fishingVisibilityRoot: this.rod,
          repairRoot: this.repairTools,
          lanternRoot: this.lantern.root,
          chestRoot: this.chestDisplay.root,
          chestState: () => this.chestState,
          activeFeaturedEventId: () => this.activeFeaturedEventId,
        },
        this.eventPresentationHost,
      );
      this.applyBasePresentation();
    } catch (error) {
      try {
        runCleanupSteps([
          () => ocean?.dispose(),
          () => fishingPresentation?.dispose(),
          () => diveController?.dispose(),
          () => itemUseController?.dispose(),
          () => itemUseAdapter?.dispose(),
          () => chestDisplay?.dispose(),
          () => supplyDisplay?.dispose(),
          () => carlitosDelegation?.dispose(),
          () => carlitos?.dispose(),
          () => this.toolHoverOutline.dispose(),
          () => hangingLantern?.dispose(),
          () => lantern?.dispose(),
          () => weatherEffects?.dispose(),
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

  createEventPresentation(
    eventId: SurvivalEventId,
    dedicatedModels: EventModelLibrary,
    featuredModels: SurvivalEventModels,
  ): EventPresentationAdapter {
    if (this.disposed) throw new Error('Boat world is disposed.');
    let rescueCueCallback: ((progress: number | null) => void) | null = null;
    const adapter = this.eventPresentationRegistry.create(eventId, {
      worldParent: this.scene,
      boatParent: this.boat,
      dedicatedEnvironment: {
          eventModels: dedicatedModels,
          supplies: this.supplyDisplay,
          carlitos: this.carlitos,
          vortexWave: this.vortexWave,
          sampleWorldWaveInto: this.sampleWorldWaveInto,
          readWorldWaveAmplitudeScale: this.readWorldWaveAmplitudeScale,
          cameraEffectsRoot: this.cameraEffectsRoot,
          boatEffectsRoot: this.boatEffectsRoot,
          camera: this.camera,
      },
      focusedDependencies: {
        propModels: this.propModels,
        waves: DEFAULT_WAVES,
        cameraRig: this.cameraRig,
        camera: this.camera,
        boatMotionRoot: this.motionRig,
        supplyDisplay: this.supplyDisplay,
        chestDisplay: this.chestDisplay,
        emitCue: (cue) => this.eventCueHandler(cue),
      },
      focusedFactories: this.focusedEventFactories,
      featuredModels,
      featuredTargets: {
        driftingItemBow: this.driftingItemBowRest,
        driftingChest: this.chestDisplay.root,
        flowersDeck: this.flowersDeckTarget,
        checkBackStern: this.checkBackSternFloor,
      },
      driftingWater: {
        sampleWaveInto: this.sampleWorldWaveInto,
        readAmplitudeScale: this.readWorldWaveAmplitudeScale,
      },
      moon: {
        sky: this.sky,
        camera: this.camera,
        cameraControl: this.cameraController,
        supplies: this.supplyDisplay,
        itemAimTarget: this.moonItemAimTarget,
      },
      registerRescueCueCallback: (callback) => {
        rescueCueCallback = callback;
      },
      applyDangerousWatersReaction: this.applyDangerousWatersReaction,
    });
    if (rescueCueCallback !== null) {
      this.rescueCueCallbacks.set(adapter, rescueCueCallback);
    }
    return adapter;
  }

  attach(adapter: EventPresentationAdapter): void {
    if (this.disposed) throw new Error('Boat world is disposed.');
    this.eventPresentationHost.attach(adapter);
    try {
      this.interactionProjector.installFocusedInteractionTargets(
        this.eventPresentationHost.interactionTargets(),
      );
    } catch (error) {
      try {
        runCleanupSteps([
          () => this.interactionProjector.clearFocusedInteractionTargets(),
          () => this.eventPresentationHost.detach(adapter),
        ]);
      } catch {
        // Preserve the projector installation error after rollback.
      }
      throw error;
    }
    this.activeRescueCueCallback = this.rescueCueCallbacks.get(adapter) ?? null;
  }

  detach(adapter: EventPresentationAdapter): void {
    try {
      runCleanupSteps([
        () => this.eventPresentationHost.detach(adapter),
        () => {
          if (this.eventPresentationHost.activeEventId() === null) {
            this.interactionProjector.clearFocusedInteractionTargets();
          }
        },
      ]);
    } finally {
      if (this.eventPresentationHost.activeEventId() === null) {
        this.activeRescueCueCallback = null;
      }
    }
  }

  private ensureEventPresenter(eventId: SurvivalEventId): void {
    if (this.eventPresentationHost.activeEventId() === eventId) return;
    if (this.fallbackEventPresentation !== null) {
      const previous = this.fallbackEventPresentation;
      this.fallbackEventPresentation = null;
      runCleanupSteps([
        () => this.detach(previous),
        () => previous.dispose(),
      ]);
    }
    if (this.eventPresentationHost.activeEventId() !== null) {
      throw new Error(`Event bundle is not active: ${eventId}`);
    }
    if (
      this.fallbackDedicatedEventModels === null
      || this.fallbackFeaturedEventModels === null
    ) {
      throw new Error(`Event bundle is not active: ${eventId}`);
    }
    const adapter = this.createEventPresentation(
      eventId,
      this.fallbackDedicatedEventModels,
      this.fallbackFeaturedEventModels,
    );
    try {
      this.attach(adapter);
    } catch (error) {
      try {
        adapter.dispose();
      } catch {
        // Preserve the attachment error.
      }
      throw error;
    }
    this.fallbackEventPresentation = adapter;
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

  setRearCameraView(rear: boolean, instant = false): void {
    if (this.disposed) return;
    this.cameraController.setRearView(rear, instant);
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

  setEventCueHandler(handler: (cue: EventPresentationCue) => void): void {
    this.eventCueHandler = handler;
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.ocean.setQuality(value);
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.supplyDisplay.sync(snapshot);
    this.carlitosDelegation.setAmbientSide(eventSideFromSeed(snapshot.seed));
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
    return this.diveController.play(instanceId, onWaterImpact);
  }

  clearDivePresentation(): void {
    this.diveController.clear();
  }

  setHighlightedItem(instanceId: string | null): void {
    if (this.disposed) return;
    this.supplyDisplay.setHighlighted(instanceId);
    const focusedRoot = instanceId === null
      ? null
      : this.eventPresentationHost.interactionRoot(instanceId);
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
              : this.eventPresentationHost.interactionRoot(this.activeFeaturedEventId)
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
    if (eventPresentationRoute(eventId) !== null) {
      this.ensureEventPresenter(eventId as SurvivalEventId);
    }
    const operation = ++this.weatherEventOperation;
    this.itemUseController.clear(this.phase);
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
    if (await this.playEventSceneItemUse(eventId, choiceId, instanceId)) return;
    if (this.disposed || operation !== this.weatherEventOperation) return;
    await this.supplyDisplay.playEventItemUse(instanceId);
  }

  returnEventItemUse(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.itemUseController.recover();
  }

  playRepairToolboxAnimation(onAudioStart?: () => void): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.repairToolboxAnimation.play(onAudioStart);
  }

  cancelRepairToolboxAnimation(): void {
    if (this.disposed) return;
    this.repairToolboxAnimation.cancel();
  }

  private playEventSceneItemUse(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (this.eventPresentationHost.activeEventId() !== eventId) {
      return Promise.resolve(false);
    }
    return this.eventPresentationHost.playItemUse(choiceId, instanceId);
  }

  playEventChoice(
    eventId: string,
    choice: string | EventChoicePresentation,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (eventPresentationRoute(eventId) !== null) {
      this.ensureEventPresenter(eventId as SurvivalEventId);
    }
    this.weatherEventOperation += 1;
    if (typeof choice === 'string' || choice.instanceId === null) {
      this.itemUseController.clear(this.phase);
    }
    return this.eventPresentationHost.playChoice(
      typeof choice === 'string'
        ? { choiceId: choice, instanceId: null, condition: null }
        : choice,
    );
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
    this.carlitosDelegation.finish();
    this.weatherEventOperation += 1;
    this.itemUseController.clear(this.phase);
    this.repairToolboxAnimation.cancel();
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
    this.ensureEventPresenter(eventId as SurvivalEventId);
    const carlitosEventSide = this.carlitosSeatSideForEvent(
      eventId,
      resolvedVariantSeed ?? 0,
    );
    this.carlitosDelegation.setEventSide(carlitosEventSide);
    this.activeFeaturedEventId = route === 'featured'
      ? eventId as FeaturedEventId
      : null;
    if (route !== 'dedicated') {
      this.resetDedicatedEffects();
      Object.assign(this.vortexWave, createInactiveVortexWaveState());
    }
    this.eventPresentationHost.stage(
      typeof eventOrContext === 'string'
        ? {
            eventId: eventId as SurvivalEventId,
            targetInstanceId: null,
            variantSeed: resolvedVariantSeed ?? 0,
          }
        : eventOrContext,
    );
  }

  async revealEvent(eventId: string): Promise<void> {
    if (this.disposed) return;
    if (eventId === 'night-calm-fallback') {
      this.restoreEventCameraFront();
      return;
    }
    const route = eventPresentationRoute(eventId);
    if (route === null) throw new Error(`Missing event presentation route: ${eventId}`);
    this.ensureEventPresenter(eventId as SurvivalEventId);
    const operation = ++this.weatherEventOperation;
    await this.eventPresentationHost.reveal();
    if (
      !this.disposed
      && operation === this.weatherEventOperation
      && eventId !== 'check-the-back'
    ) {
      this.restoreEventCameraFront();
    }
  }

  private restoreEventCameraFront(): void {
    this.cameraController.restoreBasePose();
  }

  enterDriftingItemView(eventId: DriftingItemEventId): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.activeFeaturedEventId !== eventId) return Promise.resolve();
    const target = this.eventPresentationHost.itemAimTarget();
    return target === null
      ? Promise.resolve()
      : this.cameraController.beginDriftingItemView(target);
  }

  exitDriftingItemView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.cameraController.endDriftingItemView();
  }

  retrieveDriftingItem(eventId: DriftingItemEventId): Promise<void> {
    if (this.disposed || this.activeFeaturedEventId !== eventId) {
      return Promise.resolve();
    }
    this.toolHoverOutline.setTarget(null);
    return this.retrieveFeaturedDriftingItem(eventId);
  }

  delegateDriftingItem(eventId: DriftingItemEventId): Promise<void> {
    if (this.disposed || this.activeFeaturedEventId !== eventId) {
      return Promise.resolve();
    }
    this.toolHoverOutline.setTarget(null);
    return this.carlitosDelegation.delegate(
      () => this.retrieveFeaturedDriftingItem(eventId),
    );
  }

  recedeDriftingItem(eventId: DriftingItemEventId): Promise<void> {
    if (this.disposed || this.activeFeaturedEventId !== eventId) {
      return Promise.resolve();
    }
    this.toolHoverOutline.setTarget(null);
    return this.playFeaturedPresentation(driftingItemLeaveKey(eventId));
  }

  private retrieveFeaturedDriftingItem(eventId: DriftingItemEventId): Promise<void> {
    const handOffChest = eventId === 'drifting-chest' && this.chestState !== 'none';
    if (handOffChest) this.chestDisplay.root.visible = false;
    return this.playFeaturedPresentation(driftingItemRetrieveKey(eventId)).then(() => {
      if (!handOffChest || this.disposed) return;
      const eventChest = this.eventPresentationHost.resultRoot(eventId);
      if (eventChest !== null) eventChest.visible = false;
      this.chestDisplay.restorePose();
    });
  }

  private playFeaturedPresentation(key: EventPresentationKey): Promise<void> {
    return this.eventPresentationHost.react({
      outcome: {
        accepted: true,
        code: 'event-presentation',
        message: '',
        deltas: {},
        cue: 'none',
        eventPresentationKey: key,
      },
      physicalResponse: EMPTY_EVENT_PHYSICAL_RESPONSE,
      result: null,
      choice: null,
    });
  }

  projectEventInteractionBounds(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    return this.interactionProjector.projectEventInteraction(eventId, width, height);
  }

  projectEventResultBounds(
    eventId: string,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    return this.interactionProjector.projectEventResult(eventId, width, height);
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
    if (eventPresentationRoute(eventId) !== null) {
      this.ensureEventPresenter(eventId as SurvivalEventId);
    }
    this.weatherEventOperation += 1;
    if (isEventPresentationRoute(eventId, 'dedicated') && presentation === undefined) {
      throw new Error('Dedicated event reaction requires exact result data.');
    }
    if (isEventPresentationRoute(eventId, 'focused') && presentation === undefined) {
      this.supplyDisplay.clearEventMotion();
    }
    await Promise.all([
      presentation === undefined
        ? Promise.resolve()
        : this.itemUseController.react(presentation),
      this.eventPresentationHost.react({
        outcome,
        physicalResponse,
        result: presentation ?? null,
        choice: focusedChoice,
      }),
    ]);
  }

  clearEvent(): void {
    if (this.disposed) return;
    this.cameraController.cancelDriftingItemView();
    this.weatherEventOperation += 1;
    this.carlitosDelegation.setEventSide(null);
    this.itemUseController.clear(this.phase);
    this.eventPresentationHost.clear();
    this.resetDedicatedEffects();
    this.activeFeaturedEventId = null;
    this.supplyDisplay.clearEventMotion();
    if (this.phase === 'day') this.supplyDisplay.releaseDayStowedItems();
    Object.assign(this.vortexWave, createInactiveVortexWaveState());
  }

  setDocumentHidden(hidden: boolean): void {
    if (this.disposed || !hidden) return;
    this.cameraController.settleForVisibilityChange();
    this.fishingPresentation.settleForVisibilityChange();
    this.weatherEventOperation += 1;
    this.carlitosDelegation.finish();
    this.itemUseController.settleForVisibilityChange(this.phase);
    this.repairToolboxAnimation.cancel();
    this.skipSequence();
    this.diveController.settleForVisibilityChange();
    this.supplyDisplay.settleEventItemUse();
    this.supplyDisplay.clearEventMotion();
    this.resetDedicatedEffects();
    Object.assign(this.vortexWave, createInactiveVortexWaveState());
  }

  private eventItemAimTarget(_eventId: string): Object3D | null {
    return this.interactionProjector.eventItemAimTarget(_eventId);
  }

  projectInteractionAnchors(
    width: number,
    height: number,
  ): readonly BoatInteractionAnchor[] {
    return this.interactionProjector.projectAnchors(width, height);
  }

  enterFishingView(): Promise<void> {
    return this.fishingPresentation.enterView();
  }

  castFishingAtScreenPoint(
    clientX: number,
    clientY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): FishingCastPoint | null {
    return this.fishingPresentation.castPointFromScreen(
      clientX,
      clientY,
      viewportWidth,
      viewportHeight,
    );
  }

  centeredFishingCast(): FishingCastPoint {
    return this.fishingPresentation.centeredCast();
  }

  playFishingCast(point: FishingCastPoint): Promise<void> {
    return this.fishingPresentation.playCast(point);
  }

  showFishingWaiting(point: FishingCastPoint): void {
    this.fishingPresentation.showWaiting(point);
  }

  showFishingBite(point: FishingCastPoint): void {
    this.fishingPresentation.showBite(point);
  }

  projectFishingBite(width: number, height: number): ProjectedBoatBounds {
    return this.fishingPresentation.projectBite(width, height);
  }

  playFishingReel(catchId: FishingCatchId): Promise<void> {
    return this.fishingPresentation.playReel(catchId);
  }

  projectFishingCatch(width: number, height: number): ProjectedBoatBounds | null {
    return this.fishingPresentation.projectCatch(width, height);
  }

  playFishingMiss(): Promise<void> {
    return this.fishingPresentation.playMiss();
  }

  exitFishingView(): Promise<void> {
    return this.fishingPresentation.exitView();
  }

  clearFishingPresentation(): void {
    this.fishingPresentation.clear();
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
    this.eventPresentationHost.settleForVisibilityChange();
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
    this.cameraController.update(advancePresentation ? delta : 0);
    this.applyBasePresentation();
    this.hangingLantern.update(
      this.boatPose,
      this.weatherProfile,
      time,
      delta,
    );
    this.diveController.update(time, advancePresentation ? delta : 0);
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
    this.chestDisplay.update(delta);

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

      this.fishingPresentation.advance(time, delta);
      this.supplyDisplay.resetEventPoseForFrame();
      this.eventPresentationHost.update(time, delta);
      this.cameraController.updateDriftingItemView(
        delta,
        this.currentDriftingItemAimTarget(),
      );
      this.carlitosDelegation.update(delta);
      this.supplyDisplay.update(delta);
      this.itemUseController.update(delta);
      this.repairToolboxAnimation.update(delta);
      this.fishingPresentation.updateParticles(delta);
    } else {
      const activeEventId = this.eventPresentationHost.activeEventId();
      if (activeEventId !== null && eventPresentationRoute(activeEventId) === 'moon') {
        this.eventPresentationHost.update(time, 0);
      }
      this.cameraController.applyDriftingItemView(
        this.currentDriftingItemAimTarget(),
      );
    }
    setSceneBinocularMaskStrength(
      this.scene,
      this.itemEffects.binocularMaskStrength,
    );
    this.fishingPresentation.updateSurface(time, amplitudeScale);
    const fog = this.scene.fog as FogExp2;
    const atmosphere = this.sky.palette;
    this.oceanAtmosphere.fogColor.copy(fog.color);
    this.oceanAtmosphere.horizonColor.copy(atmosphere.horizonColor);
    this.oceanAtmosphere.skyColor.copy(atmosphere.zenithColor);
    this.oceanAtmosphere.sunColor.copy(atmosphere.sunColor);
    this.oceanAtmosphere.sunVisibility = atmosphere.sunVisibility;
    this.ocean.update(time, amplitudeScale, fog.density, this.oceanAtmosphere);
    this.scene.updateMatrixWorld(true);
    this.fishingPresentation.updateLineGeometry();
    this.oceanExclusion.worldToLocal.copy(this.boat.matrixWorld).invert();
    this.ocean.setExclusions(this.oceanExclusions);
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.weatherEffects.update(time, delta, this.worldCameraPosition);
    if (this.lightningStrikePending) {
      this.lightningStrikePending = false;
      this.lightningStrikeListener?.();
    }
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  private currentDriftingItemAimTarget(): Object3D | null {
    return this.cameraController.requiresDriftingItemTarget()
      ? this.eventPresentationHost.itemAimTarget()
      : null;
  }

  dispose(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.setHighlightedItem(null),
      () => { this.eventCueHandler = () => undefined; },
      () => this.cameraController.dispose(),
      () => {
        this.disposed = true;
        this.weatherEventOperation += 1;
        this.lightningStrikePending = false;
        this.lightningStrikeListener = null;
      },
      () => this.interactionProjector.dispose(),
      () => this.cancelActiveSequence(),
      () => this.carlitosDelegation.dispose(),
      () => this.itemUseController.dispose(),
      () => this.repairToolboxAnimation.cancel(),
      () => {
        try {
          this.eventPresentationHost.dispose();
        } finally {
          this.activeRescueCueCallback = null;
        }
      },
      () => {
        const adapter = this.fallbackEventPresentation;
        this.fallbackEventPresentation = null;
        adapter?.dispose();
      },
      () => this.itemUseAdapter.dispose(),
      () => this.resetDedicatedEffects(),
      () => Object.assign(this.vortexWave, createInactiveVortexWaveState()),
      () => this.diveController.dispose(),
      () => this.carlitos.dispose(),
      () => this.supplyDisplay.dispose(),
      () => this.chestDisplay.dispose(),
      () => this.toolHoverOutline.dispose(),
      () => this.hangingLantern.dispose(),
      () => this.lantern.dispose(),
      () => this.fishingPresentation.disposeAnimation(),
      () => this.fishingPresentation.disposeCatches(),
      () => this.ocean.dispose(),
      () => this.weatherEffects.dispose(),
      () => this.fishingPresentation.disposeParticles(),
      () => this.sky.dispose(),
      () => this.fishingPresentation.detach(),
      () => this.scene.remove(
        this.motionRig,
        this.ocean.mesh,
        this.ambient,
        this.key,
        this.key.target,
        this.itemEffects.root,
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
      () => this.fishingPresentation.disposeVisualResources(),
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
    this.rodPivot.rotation.x = FISHING_ROD_LEAN;
    this.activeRescueCueCallback?.(null);
  }

  private resetDedicatedEffects(): void {
    this.cameraEffectsRoot.position.set(0, 0, 0);
    this.cameraEffectsRoot.rotation.set(0, 0, 0);
    this.cameraEffectsRoot.scale.set(1, 1, 1);
    this.boatEffectsRoot.position.set(0, 0, 0);
    this.boatEffectsRoot.rotation.set(0, 0, 0);
    this.boatEffectsRoot.scale.set(1, 1, 1);
  }

  private applyBaseLighting(atmosphere: Readonly<SkyPalette>): void {
    const lightScale = this.weatherProfile.lightIntensityScale;
    this.ambient.color.copy(atmosphere.ambientLightColor);
    this.ambient.intensity = atmosphere.ambientLightIntensity * lightScale;
    this.key.color.copy(atmosphere.keyLightColor);
    this.key.intensity = atmosphere.keyLightIntensity * lightScale;
    const night = this.skyState.phase === 'night';
    this.hangingLantern.light.intensity = night
      ? HANGING_LANTERN_NIGHT_INTENSITY
      : HANGING_LANTERN_DAY_INTENSITY;
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
        this.rodPivot.rotation.x = FISHING_ROD_LEAN - eased * 0.12;
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
        this.activeRescueCueCallback?.(eased);
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

  private carlitosSeatSideForEvent(
    eventId: string,
    variantSeed: number,
  ): EventSide | null {
    switch (eventId) {
      case 'night-trader':
      case 'drifting-bottle':
      case 'man-in-the-fog':
      case 'midnight-tour':
        return oppositeEventSide(eventSideFromSeed(variantSeed));
      case 'drifting-barrel':
      case 'drifting-chest':
      case 'eerie-melody':
      case 'other-people':
        return 1;
      case 'school-of-fish':
      case 'tornado':
        return -1;
      default:
        return null;
    }
  }

  private isTerminalCue(cue: PresentationCue): boolean {
    return cue === 'rescue' || cue === 'death' || cue === 'sinking';
  }
}
