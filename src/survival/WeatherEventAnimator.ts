import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Euler,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { EventModelLibrary } from './EventModelLibrary';
import type { ActionOutcome, ItemCondition } from './survivalTypes';
import {
  isCameraOnlyWeatherEvent,
  sampleWeatherItemUse,
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
      readonly instanceId: ItemInstanceId;
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

const DISTANT_FIGURE_Z = -9.2;
const REVEAL_FIGURE_X = -2.1;
const REVEAL_FIGURE_Y = 0;

function clamp01(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 0;
  return value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pulse(progress: number, start: number, peak: number, end: number): number {
  if (progress <= start || progress >= end) return 0;
  return progress < peak
    ? smoothstep((progress - start) / (peak - start))
    : 1 - smoothstep((progress - peak) / (end - peak));
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

function prepareFogMan(model: Group, material: Material): Group {
  const replacedMaterials = new Set<Material>();
  const replacedTextures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const replaced of materials) {
      replacedMaterials.add(replaced);
      for (const value of Object.values(replaced)) {
        if (value instanceof Texture) replacedTextures.add(value);
      }
    }
    object.material = material;
  });
  disposeResourceSets(replacedTextures, replacedMaterials);

  const root = new Group();
  root.name = 'fog-man-silhouette';
  root.position.set(REVEAL_FIGURE_X, REVEAL_FIGURE_Y, DISTANT_FIGURE_Z);
  root.visible = false;
  root.add(model);
  return root;
}

function createFlashlightBeam(material: Material): Group {
  const root = new Group();
  root.name = 'weather-flashlight-beam';
  const beam = new Mesh(new ConeGeometry(0.72, 4.8, 8, 1, true), material);
  beam.name = 'weather-flashlight-beam-cone';
  beam.position.set(0.15, 1.45, -3);
  beam.rotation.x = -Math.PI / 2;
  beam.scale.set(0.01, 0.01, 0.01);
  root.add(beam);
  root.visible = false;
  return root;
}

function createAnchorChain(material: Material): Group {
  const root = new Group();
  root.name = 'weather-anchor-chain';
  for (let index = 0; index < 9; index += 1) {
    const link = new Mesh(new TorusGeometry(0.085, 0.018, 4, 8), material);
    link.name = `weather-anchor-chain-link-${index + 1}`;
    link.position.set(
      index % 2 === 0 ? -0.025 : 0.025,
      0.82 - index * 0.17,
      -0.22 - index * 0.055,
    );
    link.rotation.set(
      index % 2 === 0 ? Math.PI / 2 : 0,
      index % 2 === 0 ? 0 : Math.PI / 2,
      -0.12,
    );
    root.add(link);
  }
  root.position.set(1.52, 0.2, -0.3);
  root.visible = false;
  return root;
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
  private readonly cameraBasePosition = new Vector3();
  private readonly cameraBaseRotation = new Euler();
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
  private readonly figureMaterial: MeshStandardMaterial;
  private readonly beamMaterial: MeshBasicMaterial;
  private readonly lightningMaterial: MeshBasicMaterial;
  private readonly silhouette: Group;
  private readonly flashlightBeam: Group;
  private readonly flashlightBeamCone: Mesh;
  private readonly anchorChain: Group;
  private readonly lightningFlash: Group;
  private active: ActiveWeatherAnimation | null = null;
  private selectedActorId: ItemInstanceId | null = null;
  private disposed = false;

  constructor(
    private readonly cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
    eventModels?: EventModelLibrary,
  ) {
    this.worldRoot.name = 'weather-event-world';
    this.boatRoot.name = 'weather-event-boat';
    this.figureMaterial = new MeshStandardMaterial({
      color: 0x504b45,
      emissive: 0x62594f,
      emissiveIntensity: 1.25,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.beamMaterial = new MeshBasicMaterial({
      color: 0xd6d2a5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    this.lightningMaterial = new MeshBasicMaterial({
      color: 0xdce8e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const chainMaterial = new MeshStandardMaterial({
      color: 0x394245,
      metalness: 0.58,
      roughness: 0.72,
      flatShading: true,
    });
    this.ownedMaterials.add(this.figureMaterial);
    this.silhouette = eventModels === undefined
      ? new Group()
      : prepareFogMan(eventModels.create('fogMan'), this.figureMaterial);
    this.silhouette.name = 'fog-man-silhouette';
    this.flashlightBeam = createFlashlightBeam(this.beamMaterial);
    this.flashlightBeamCone = this.flashlightBeam.children[0] as Mesh;
    this.anchorChain = createAnchorChain(chainMaterial);
    this.lightningFlash = createLightningFlash(this.lightningMaterial);
    this.worldRoot.add(this.silhouette, this.lightningFlash);
    this.boatRoot.add(this.flashlightBeam, this.anchorChain);
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    collectMeshResources(this.boatRoot, this.ownedGeometries, this.ownedMaterials);
    this.rememberCameraBase();
  }

  stage(_eventId: string): void {
    if (this.disposed) return;
    this.cancelActive();
    this.rememberCameraBase();
    this.hideTransientEffects();
    this.selectedActorId = null;
  }

  supportsItemUse(eventId: string, choiceId: string): boolean {
    return weatherItemUseDuration(eventId, choiceId) !== null;
  }

  reveal(eventId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelActive();
    const duration = weatherRevealDuration(eventId);
    if (duration === null) return Promise.resolve();
    this.rememberCameraBase();
    this.hideTransientEffects();
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
    instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.cancelActive();
    const duration = weatherItemUseDuration(eventId, choiceId);
    if (duration === null) return Promise.resolve(false);
    this.rememberCameraBase();
    this.hideTransientEffects();
    resetItemSample(this.itemSample);
    if (isCameraOnlyWeatherEvent(eventId)) {
      this.supplyDisplay.clearEventMotion();
      this.selectedActorId = null;
      return new Promise((resolve) => {
        this.active = {
          kind: 'item',
          eventId,
          choiceId,
          instanceId,
          elapsed: 0,
          duration,
          resolve,
        };
      });
    }
    if (!this.supplyDisplay.pinEventActor(instanceId)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve(false);
    }
    if (!this.supplyDisplay.applyEventItemPose(instanceId, this.itemSample)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve(false);
    }
    this.selectedActorId = instanceId;
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        eventId,
        choiceId,
        instanceId,
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
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const actors: readonly WeatherReactionActor[] = (response?.actors.length ?? 0) > 0
      ? response!.actors
      : this.selectedActorId === null
        ? []
        : [{ instanceId: this.selectedActorId, condition: null }];
    const duration = weatherReactionDuration(eventId, response?.choiceId ?? '', actors.length);
    if (duration === null) {
      this.cancelActive();
      return Promise.resolve();
    }
    if (this.active !== null) this.cancelActive();
    this.rememberCameraBase();
    this.supplyDisplay.clearEventPose();
    this.hideTransientEffects();
    if (!isCameraOnlyWeatherEvent(eventId)) {
      for (const actor of actors) {
        this.supplyDisplay.pinEventActor(actor.instanceId);
      }
    }
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

  update(_time: number, delta: number): void {
    if (this.disposed) return;
    const active = this.active;
    if (active === null) return;

    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.hideTransientEffects();
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
        this.updateItem(active.eventId, active.choiceId, active.instanceId, progress);
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
    if (!isCameraOnlyWeatherEvent(eventId)) {
      this.supplyDisplay.applyEventAmbientPose(sample.supplyRoll, sample.supplyLift);
    }
    if (eventId === 'man-in-the-fog') {
      this.showSilhouette(sample.figureVisibility);
    }
    if (eventId === 'thunderstorm' && sample.lightningEmphasis > 0.015) {
      this.lightningFlash.visible = true;
      this.lightningFlash.scale.setScalar(0.9 + sample.lightningEmphasis * 0.22);
      this.lightningMaterial.opacity = 0.24 + sample.lightningEmphasis * 0.72;
    }
  }

  private updateItem(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    progress: number,
  ): void {
    if (!sampleWeatherItemUse(eventId, choiceId, progress, this.itemSample)) return;
    if (isCameraOnlyWeatherEvent(eventId)) {
      this.applyCameraPose(
        0,
        0,
        -this.itemSample.cameraPush,
        this.itemSample.cameraYaw,
        0,
        0,
      );
      return;
    }
    this.supplyDisplay.applyEventItemPose(instanceId, this.itemSample);
    this.supplyDisplay.applyEventAmbientPose(this.itemSample.supplyRoll, 0);
    if (this.itemSample.cameraYaw !== 0 || this.itemSample.cameraPush !== 0) {
      this.applyCameraPose(0, 0, -this.itemSample.cameraPush, this.itemSample.cameraYaw, 0, 0);
    }
    const effect = this.itemSample.effect;
    if (effect <= 0.01) return;
    switch (this.itemSample.effectKind) {
      case 'wave-anchor-stabilize':
        this.anchorChain.visible = true;
        this.anchorChain.scale.y = 0.18 + effect * 0.82;
        this.anchorChain.rotation.z = 0.04 * effect;
        break;
      case 'fog-flashlight-sweep':
        this.flashlightBeam.visible = true;
        this.flashlightBeam.rotation.y = this.itemSample.yaw * 0.72;
        this.flashlightBeamCone.scale.set(
          0.62 + effect * 0.38,
          0.78 + effect * 0.22,
          0.62 + effect * 0.38,
        );
        this.beamMaterial.opacity = effect * 0.24;
        break;
      default:
        break;
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
    const fogAttack = eventId === 'man-in-the-fog' && healthDamage < 0;
    const actorCount = active.actors.length;
    const sampleCount = Math.max(1, actorCount);
    for (let actorIndex = 0; actorIndex < sampleCount; actorIndex += 1) {
      const actor = active.actors[actorIndex];
      const condition = actor?.condition === 'broken'
        ? 'broken'
        : actor?.condition === 'lost' || actor?.condition === 'consumed'
          ? 'lost'
          : null;
      if (!sampleWeatherReaction(
        eventId,
        response?.choiceId ?? '',
        actorIndex,
        actorCount,
        condition,
        hullDamage,
        progress,
        this.reactionSample,
      )) return;

      if (actor !== undefined && !isCameraOnlyWeatherEvent(eventId)) {
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
          const settle = Math.sin(Math.PI * Math.min(1, progress / 0.58))
            * (1 - smoothstep((progress - 0.46) / 0.54));
          this.itemSample.y = -0.12 * settle;
          this.itemSample.roll = 0.26 * settle;
          this.itemSample.scaleY = 1 - 0.08 * settle;
        } else if (
          sample.effectKind === 'none'
          && (actor.condition === 'lost' || actor.condition === 'consumed')
        ) {
          const departure = smoothstep((progress - 0.08) / 0.82);
          this.itemSample.x = -1.8 * departure;
          this.itemSample.y = 0.52 * departure;
          this.itemSample.z = -1.25 * departure;
          this.itemSample.yaw = 1.1 * departure;
          this.itemSample.roll = -0.55 * departure;
        }
        this.supplyDisplay.applyEventItemPose(actor.instanceId, this.itemSample);
      }
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

    if (fogAttack) {
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
        -0.025 * impact,
        0,
        -0.06 * impact,
        0,
        0.09 * impact,
      );
      return;
    }
    if (
      hullDamage < 0
      && eventId !== 'shower-night'
      && eventId !== 'windy-night'
      && eventId !== 'bad-sleep'
      && eventId !== 'thunderstorm'
    ) {
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
    this.cameraRig.position.x += x;
    this.cameraRig.position.y += y;
    this.cameraRig.position.z += z;
    this.cameraRig.rotateY(yaw);
    this.cameraRig.rotateX(pitch);
    this.cameraRig.rotateZ(roll);
  }

  private showSilhouette(visibility: number): void {
    if (visibility <= 0.015) return;
    this.silhouette.visible = true;
    this.figureMaterial.opacity = Math.min(0.38, visibility * 0.36);
    this.silhouette.position.set(
      REVEAL_FIGURE_X,
      REVEAL_FIGURE_Y,
      DISTANT_FIGURE_Z,
    );
    this.silhouette.scale.setScalar(0.86);
  }

  private rememberCameraBase(): void {
    this.cameraBasePosition.copy(this.cameraRig.position);
    this.cameraBaseRotation.copy(this.cameraRig.rotation);
  }

  private restoreCamera(): void {
    this.cameraRig.position.copy(this.cameraBasePosition);
    this.cameraRig.rotation.copy(this.cameraBaseRotation);
  }

  private hideTransientEffects(): void {
    this.silhouette.visible = false;
    this.silhouette.position.set(REVEAL_FIGURE_X, REVEAL_FIGURE_Y, DISTANT_FIGURE_Z);
    this.silhouette.scale.setScalar(1);
    this.figureMaterial.opacity = 0;
    this.flashlightBeam.visible = false;
    this.flashlightBeam.rotation.set(0, 0, 0);
    this.flashlightBeamCone.scale.set(0.01, 0.01, 0.01);
    this.beamMaterial.opacity = 0;
    this.anchorChain.visible = false;
    this.anchorChain.scale.set(1, 1, 1);
    this.anchorChain.rotation.set(0, 0, 0);
    this.lightningFlash.visible = false;
    this.lightningFlash.scale.set(1, 1, 1);
    this.lightningMaterial.opacity = 0;
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    switch (active.kind) {
      case 'item':
        this.restoreCamera();
        this.hideTransientEffects();
        this.supplyDisplay.clearEventPose();
        active.resolve(true);
        break;
      case 'react':
        if (active.response === null) {
          this.supplyDisplay.clearEventPose();
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
        this.supplyDisplay.clearEventPose();
        active.resolve();
        break;
    }
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active !== null) this.restoreCamera();
    this.supplyDisplay.clearEventMotion();
    this.hideTransientEffects();
    this.selectedActorId = null;
    if (active?.kind === 'item') {
      active.resolve(false);
    } else if (active !== null) {
      active.resolve();
    }
  }
}
