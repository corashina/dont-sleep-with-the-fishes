import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { FogMonster } from './FogMonster';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import { clamp01, pulse, smoothstep } from './animationMath';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { EventModelLibrary } from './EventModelLibrary';
import type { WorldWaveSampler } from './eventPresentationTypes';
import { SeaMistCurtain } from './SeaMistCurtain';
import type { ActionOutcome, ItemCondition } from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';
import {
  isCameraOnlyWeatherEvent,
  sampleWeatherReaction,
  sampleWeatherReveal,
  weatherItemUseDuration,
  weatherReactionDuration,
  weatherRevealDuration,
  type WeatherItemSample,
  type WeatherReactionSample,
  type WeatherRevealSample,
} from './weatherEventChoreography';

type ActiveWeatherAnimation =
  | {
      readonly kind: 'reveal';
      readonly eventId: string;
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'item';
      readonly eventId: string;
      readonly choiceId: string;
      elapsed: number;
      readonly duration: number;
      readonly resolve: (value: boolean) => void;
    }
  | {
      readonly kind: 'react';
      readonly eventId: string;
      readonly response: EventPhysicalResponsePresentation | null;
      readonly actors: readonly WeatherReactionActor[];
      readonly outcome: ActionOutcome;
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

interface WeatherReactionActor {
  readonly instanceId: ItemInstanceId;
  readonly condition: ItemCondition | null;
}

const DIRECT_WEATHER_IMPACT_EVENTS = new Set([
  'shower-night',
  'windy-night',
  'bad-sleep',
  'thunderstorm',
]);

function reactionActors(
  response: EventPhysicalResponsePresentation | null,
  selectedInstanceId: ItemInstanceId | null,
  selectedActorId: ItemInstanceId | null,
): readonly WeatherReactionActor[] {
  if ((response?.actors.length ?? 0) > 0) {
    return response!.actors.filter(({ instanceId }) => instanceId !== selectedInstanceId);
  }
  return selectedActorId === null
    ? []
    : [{ instanceId: selectedActorId, condition: null }];
}

function reactionCondition(
  actor: WeatherReactionActor | undefined,
): 'broken' | 'lost' | null {
  if (actor?.condition === 'broken') return 'broken';
  if (actor?.condition === 'lost' || actor?.condition === 'consumed') return 'lost';
  return null;
}

const FOG_MONSTER_MIST_OPACITY = 0.56;

interface WeatherWaveEnvironment {
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly readWorldWaveAmplitudeScale: () => number;
}

function resetItemSample(sample: WeatherItemSample): void {
  sample.x = 0;
  sample.y = 0;
  sample.z = 0;
  sample.yaw = 0;
  sample.pitch = 0;
  sample.roll = 0;
  sample.scaleX = 1;
  sample.scaleY = 1;
  sample.scaleZ = 1;
  sample.effect = 0;
  sample.cameraYaw = 0;
  sample.cameraPush = 0;
  sample.supplyRoll = 0;
  sample.effectKind = 'none';
}

function createLightningFlash(material: Material): Group {
  const root = new Group();
  root.name = 'weather-lightning-flash';
  const segments = [
    [-0.26, 1.18, -0.06, -0.25],
    [0.02, 0.48, 0.03, 0.34],
    [-0.18, -0.22, -0.02, -0.3],
    [0.06, -0.86, 0.02, 0.22],
  ] as const;
  for (let index = 0; index < segments.length; index += 1) {
    const [x, y, z, roll] = segments[index]!;
    const segment = new Mesh(
      new BoxGeometry(0.085 - index * 0.012, 0.88 - index * 0.08, 0.045),
      material,
    );
    segment.name = `weather-lightning-segment-${index + 1}`;
    segment.position.set(x, y, z);
    segment.rotation.z = roll;
    root.add(segment);
  }
  root.position.set(-3.8, 4.1, -12.5);
  root.visible = false;
  return root;
}

export class WeatherEventAnimator {
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly revealSample: WeatherRevealSample = {
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    supplyRoll: 0,
    supplyLift: 0,
    figureVisibility: 0,
    figureDistance: 0,
    lightningEmphasis: 0,
  };
  private readonly itemSample: WeatherItemSample = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    effect: 0,
    cameraYaw: 0,
    cameraPush: 0,
    supplyRoll: 0,
    effectKind: 'none',
  };
  private readonly reactionSample: WeatherReactionSample = {
    actorX: 0,
    actorY: 0,
    actorZ: 0,
    actorYaw: 0,
    actorPitch: 0,
    actorRoll: 0,
    actorScaleX: 1,
    actorScaleY: 1,
    actorScaleZ: 1,
    actorEffect: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    effectKind: 'none',
  };
  private readonly monster: FogMonster | null;
  private readonly lightningMaterial: MeshBasicMaterial;
  private readonly lightningFlash: Group;
  private readonly windPaper: Mesh;
  private readonly fog: SeaMistCurtain | null;
  private active: ActiveWeatherAnimation | null = null;
  private selectedActorId: ItemInstanceId | null = null;
  private stagedEventId: string | null = null;
  private disposed = false;

  constructor(
    _cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
    eventModels?: EventModelLibrary,
    viewCamera?: Object3D,
    onlyEventId?: string,
    waveEnvironment?: WeatherWaveEnvironment,
  ) {
    this.cameraLook = viewCamera === undefined
      ? null
      : new StationaryEventCamera(viewCamera);
    this.worldRoot.name = 'weather-event-world';
    this.boatRoot.name = 'weather-event-boat';
    this.lightningMaterial = new MeshBasicMaterial({
      color: 0xdce8e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    this.monster = eventModels !== undefined && (
      onlyEventId === undefined || onlyEventId === 'monster-in-the-fog'
    ) ? new FogMonster(eventModels.create('fogMonster'), viewCamera, waveEnvironment) : null;
    const usesFogMonster = onlyEventId === undefined || onlyEventId === 'monster-in-the-fog';
    this.fog = usesFogMonster
      ? new SeaMistCurtain('weather-fog-monster-mist', 'surrounding')
      : null;
    this.lightningFlash = createLightningFlash(this.lightningMaterial);
    const paperShape = new Shape();
    paperShape.moveTo(-0.34, -0.22);
    paperShape.lineTo(0.31, -0.2);
    paperShape.lineTo(0.35, 0.18);
    paperShape.lineTo(-0.29, 0.23);
    paperShape.lineTo(-0.36, 0.04);
    paperShape.closePath();
    const paperMaterial = new MeshStandardMaterial({
      color: 0xb7a787,
      emissive: 0x261f18,
      emissiveIntensity: 0.08,
      roughness: 0.94,
      metalness: 0,
      side: DoubleSide,
      flatShading: true,
    });
    this.windPaper = new Mesh(new ShapeGeometry(paperShape), paperMaterial);
    this.windPaper.name = 'weather-windy-paper';
    this.windPaper.visible = false;
    this.windPaper.renderOrder = 3;
    if (this.fog !== null) this.worldRoot.add(this.fog.root);
    this.worldRoot.add(this.lightningFlash, this.windPaper);
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    collectMeshResources(this.boatRoot, this.ownedGeometries, this.ownedMaterials);
    if (this.monster !== null) this.worldRoot.add(this.monster.root);
    this.rememberCameraBase();
  }

  stage(eventId: string, variantSeed = 0): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = eventId;
    if (eventId === 'monster-in-the-fog') this.monster?.stage(variantSeed);
    this.rememberCameraBase();
    this.hideTransientEffects();
    this.showStagedFog();
    this.selectedActorId = null;
  }

  supportsItemUse(eventId: string, choiceId: string): boolean {
    return weatherItemUseDuration(eventId, choiceId) !== null;
  }

  itemAimTarget(eventId: string): Object3D | null {
    if (this.disposed || this.stagedEventId !== eventId) return null;
    switch (eventId) {
      case 'monster-in-the-fog':
        return this.monster?.root ?? null;
      case 'thunderstorm':
        return this.lightningFlash;
      case 'windy-night':
        return this.windPaper;
      case 'shower-night':
      case 'restless-waves':
      case 'bad-sleep':
        return this.worldRoot;
      default:
        return null;
    }
  }

  reveal(eventId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelActive();
    const duration = weatherRevealDuration(eventId);
    if (duration === null) return Promise.resolve();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.hideTransientEffects();
    this.showStagedFog();
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        eventId,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  playItemUse(
    eventId: string,
    choiceId: string,
    _instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.cancelActive();
    const duration = weatherItemUseDuration(eventId, choiceId);
    if (duration === null) return Promise.resolve(false);
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.hideTransientEffects();
    this.showStagedFogMonster();
    this.showStagedFog();
    resetItemSample(this.itemSample);
    this.selectedActorId = null;
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        eventId,
        choiceId,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  react(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null,
    selectedInstanceId: ItemInstanceId | null = null,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const actors = reactionActors(response, selectedInstanceId, this.selectedActorId);
    const duration = weatherReactionDuration(eventId, response?.choiceId ?? '', actors.length);
    if (duration === null) {
      this.cancelActive();
      return Promise.resolve();
    }
    this.stagedEventId = eventId;
    if (this.active !== null) this.cancelActive();
    this.rememberCameraBase();
    this.hideTransientEffects();
    this.showStagedFogMonster();
    this.showStagedFog();
    this.pinReactionActors(eventId, actors);
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        response,
        actors,
        outcome,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    if (this.stagedEventId === 'monster-in-the-fog') this.monster?.update(time, delta);
    const active = this.active;
    if (active === null) return;

    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.hideTransientEffects();
    this.showStagedFog();
    if (active.kind !== 'reveal') this.showStagedFogMonster();
    active.elapsed = Math.min(
      active.duration,
      active.elapsed + Math.max(0, Number.isFinite(delta) ? delta : 0),
    );
    const progress = active.elapsed / active.duration;
    switch (active.kind) {
      case 'reveal':
        this.updateReveal(active.eventId, progress);
        break;
      case 'item':
        break;
      case 'react':
        this.updateReaction(active, progress);
        break;
    }

    if (progress < 1) return;
    this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = null;
    this.hideTransientEffects();
    this.supplyDisplay.clearEventPose();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActive();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.worldRoot.removeFromParent();
    this.boatRoot.removeFromParent();
    this.monster?.dispose();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private updateReveal(eventId: string, progress: number): void {
    if (!sampleWeatherReveal(eventId, progress, this.revealSample)) return;
    const sample = this.revealSample;
    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );
    if (!isCameraOnlyWeatherEvent(eventId) && eventId !== 'bad-sleep') {
      this.supplyDisplay.applyEventAmbientPose(sample.supplyRoll, sample.supplyLift);
    }
    if (eventId === 'monster-in-the-fog') {
      this.showSilhouette(sample.figureVisibility);
    }
    if (eventId === 'windy-night') this.applyWindPaper(progress);
    if (eventId === 'thunderstorm' && sample.lightningEmphasis > 0.015) {
      this.lightningFlash.visible = true;
      this.lightningFlash.scale.setScalar(0.9 + sample.lightningEmphasis * 0.22);
      this.lightningMaterial.opacity = 0.24 + sample.lightningEmphasis * 0.72;
    }
  }

  private updateReaction(
    active: Extract<ActiveWeatherAnimation, { readonly kind: 'react' }>,
    progress: number,
  ): void {
    const { eventId, outcome, response } = active;
    resetItemSample(this.itemSample);
    const healthDamage = Math.min(0, outcome.deltas.health ?? 0);
    const hullDamage = Math.min(0, outcome.deltas.hull ?? 0);
    const actorCount = active.actors.length;
    const sampleCount = Math.max(1, actorCount);
    for (let actorIndex = 0; actorIndex < sampleCount; actorIndex += 1) {
      const actor = active.actors[actorIndex];
      if (!sampleWeatherReaction(
        eventId,
        response?.choiceId ?? '',
        actorIndex,
        actorCount,
        reactionCondition(actor),
        hullDamage,
        progress,
        this.reactionSample,
      )) return;

      if (actor !== undefined) this.applyReactionActor(eventId, actor, progress);
      this.applyReactionEffect(this.reactionSample);
    }

    const sample = this.reactionSample;
    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );

    this.applyReactionCamera(eventId, healthDamage, hullDamage, progress);
  }

  private pinReactionActors(
    eventId: string,
    actors: readonly WeatherReactionActor[],
  ): void {
    if (isCameraOnlyWeatherEvent(eventId)) return;
    for (const actor of actors) this.supplyDisplay.pinEventActor(actor.instanceId);
  }

  private applyReactionActor(
    eventId: string,
    actor: WeatherReactionActor,
    progress: number,
  ): void {
    if (isCameraOnlyWeatherEvent(eventId)) return;
    const sample = this.reactionSample;
    this.itemSample.x = sample.actorX;
    this.itemSample.y = sample.actorY;
    this.itemSample.z = sample.actorZ;
    this.itemSample.yaw = sample.actorYaw;
    this.itemSample.pitch = sample.actorPitch;
    this.itemSample.roll = sample.actorRoll;
    this.itemSample.scaleX = sample.actorScaleX;
    this.itemSample.scaleY = sample.actorScaleY;
    this.itemSample.scaleZ = sample.actorScaleZ;
    if (sample.effectKind === 'none' && actor.condition === 'broken') {
      this.applyBrokenActorPose(progress);
    } else if (sample.effectKind === 'none' && reactionCondition(actor) === 'lost') {
      this.applyLostActorPose(progress);
    }
    this.supplyDisplay.applyEventItemPose(actor.instanceId, this.itemSample);
  }

  private applyBrokenActorPose(progress: number): void {
    const settle = Math.sin(Math.PI * Math.min(1, progress / 0.58))
      * (1 - smoothstep((progress - 0.46) / 0.54));
    this.itemSample.y = -0.12 * settle;
    this.itemSample.roll = 0.26 * settle;
    this.itemSample.scaleY = 1 - 0.08 * settle;
  }

  private applyLostActorPose(progress: number): void {
    const departure = smoothstep((progress - 0.08) / 0.82);
    this.itemSample.x = -1.8 * departure;
    this.itemSample.y = 0.52 * departure;
    this.itemSample.z = -1.25 * departure;
    this.itemSample.yaw = 1.1 * departure;
    this.itemSample.roll = -0.55 * departure;
  }

  private applyReactionCamera(
    eventId: string,
    healthDamage: number,
    hullDamage: number,
    progress: number,
  ): void {
    if (eventId === 'monster-in-the-fog' && healthDamage < 0) {
      const grab = pulse(progress, 0.08, 0.44, 0.9);
      this.applyCameraPose(
        -0.14 * grab,
        0.05 * grab,
        0.11 * grab,
        -0.2 * grab,
        0.04 * grab,
        -0.06 * grab,
      );
      return;
    }
    if (eventId === 'restless-waves' && hullDamage < 0) {
      const impact = pulse(progress, 0.04, 0.24, 0.62);
      this.applyCameraPose(
        0.14 * impact,
        0,
        0,
        -0.06 * impact,
        0,
        0.09 * impact,
      );
      return;
    }
    if (hullDamage < 0 && !DIRECT_WEATHER_IMPACT_EVENTS.has(eventId)) {
      const impact = Math.sin(Math.PI * progress) * (1 - smoothstep(progress));
      this.applyCameraPose(
        0.08 * impact,
        -0.04 * impact,
        0,
        0.09 * impact,
        0,
        0.05 * impact,
      );
    }
  }

  private applyReactionEffect(sample: WeatherReactionSample): void {
    const effect = sample.actorEffect;
    if (effect <= 0.01) return;
    switch (sample.effectKind) {
      case 'storm-loss-lightning':
        this.lightningFlash.visible = true;
        this.lightningFlash.scale.setScalar(0.92 + effect * 0.18);
        this.lightningMaterial.opacity = 0.28 + effect * 0.68;
        break;
      default:
        break;
    }
  }

  private applyCameraPose(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    roll: number,
  ): void {
    void roll;
    this.applyStationaryView(
      yaw - x * 0.45,
      pitch + y * 0.65 + z * 0.45,
    );
  }

  private applyStationaryView(yaw: number, pitch: number): void {
    this.cameraLook?.apply(yaw, pitch);
  }

  private showSilhouette(visibility: number): void {
    this.monster?.setVisibility(visibility);
  }

  private showStagedFogMonster(): void {
    if (this.stagedEventId === 'monster-in-the-fog') this.showSilhouette(1);
  }

  private showStagedFog(): void {
    if (this.stagedEventId !== 'monster-in-the-fog' || this.fog === null) return;
    this.fog.root.visible = true;
    this.fog.setOpacity(FOG_MONSTER_MIST_OPACITY);
  }

  private applyWindPaper(progress: number): void {
    const value = clamp01(progress);
    this.windPaper.visible = value > 0.03 && value < 0.94;
    this.windPaper.position.set(
      -3.4 + value * 7.1,
      1.35 + Math.sin(value * Math.PI * 3) * 0.42,
      -3.2 - Math.sin(value * Math.PI) * 0.7,
    );
    this.windPaper.rotation.set(
      Math.sin(value * Math.PI * 8) * 0.28,
      value * Math.PI * 3.2,
      -0.24 + Math.sin(value * Math.PI * 6) * 0.34,
    );
  }

  private rememberCameraBase(): void {
    this.cameraLook?.capture();
  }

  private restoreCamera(): void {
    this.cameraLook?.restore();
  }

  private hideTransientEffects(): void {
    this.monster?.setVisibility(0);
    if (this.fog !== null) {
      this.fog.root.visible = false;
      this.fog.setOpacity(0);
    }
    this.lightningFlash.visible = false;
    this.lightningFlash.scale.set(1, 1, 1);
    this.lightningMaterial.opacity = 0;
    this.windPaper.visible = false;
    this.windPaper.position.set(-3.4, 1.35, -3.2);
    this.windPaper.rotation.set(0, 0, -0.24);
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    switch (active.kind) {
      case 'item':
        this.restoreCamera();
        this.hideTransientEffects();
        this.showStagedFogMonster();
        this.showStagedFog();
        active.resolve(true);
        break;
      case 'react':
        if (active.response === null) {
          active.resolve();
          break;
        }
        if (
          !isCameraOnlyWeatherEvent(active.eventId)
          && active.actors.some(
            ({ condition }) => condition === 'lost' || condition === 'consumed',
          )
        ) {
          this.supplyDisplay.releaseEventActorOnNextSync();
        }
        active.resolve();
        break;
      case 'reveal':
        this.restoreCamera();
        this.hideTransientEffects();
        this.showStagedFogMonster();
        this.showStagedFog();
        active.resolve();
        break;
    }
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active !== null) this.restoreCamera();
    this.hideTransientEffects();
    this.showStagedFogMonster();
    this.showStagedFog();
    this.selectedActorId = null;
    if (active?.kind === 'item') {
      active.resolve(false);
    } else if (active !== null) {
      active.resolve();
    }
  }

}
