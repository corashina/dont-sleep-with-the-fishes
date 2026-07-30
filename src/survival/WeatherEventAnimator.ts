import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DodecahedronGeometry,
  Euler,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { ActionOutcome } from './survivalTypes';
import {
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
      readonly response: EventPhysicalResponsePresentation;
      readonly outcome: ActionOutcome;
      elapsed: number;
      readonly duration: number;
      activeActorIndex: number;
      readonly resolve: () => void;
    };

const CLOSE_FIGURE_Z = -3.2;
const DISTANT_FIGURE_Z = -8.6;

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

function createFogMan(material: Material): Group {
  const root = new Group();
  root.name = 'fog-man-silhouette';
  root.position.set(3.4, 1.2, DISTANT_FIGURE_Z);

  const body = new Mesh(new CylinderGeometry(0.34, 0.47, 1.25, 5), material);
  body.name = 'fog-man-body';
  body.position.y = 0.46;
  body.rotation.z = -0.025;
  root.add(body);

  const coat = new Mesh(new CylinderGeometry(0.43, 0.68, 1.45, 5), material);
  coat.name = 'fog-man-coat';
  coat.position.set(0.04, -0.26, -0.025);
  coat.rotation.y = 0.13;
  root.add(coat);

  const head = new Mesh(new DodecahedronGeometry(0.29, 0), material);
  head.name = 'fog-man-head';
  head.position.set(-0.035, 1.28, 0.015);
  head.scale.set(0.82, 1.08, 0.74);
  root.add(head);

  const shoulders = new Mesh(new BoxGeometry(1.08, 0.18, 0.34, 1, 1, 1), material);
  shoulders.name = 'fog-man-uneven-shoulders';
  shoulders.position.set(0.08, 0.83, -0.03);
  shoulders.rotation.set(0.03, -0.08, -0.09);
  root.add(shoulders);

  const nearShoulder = new Mesh(new BoxGeometry(0.33, 0.28, 0.31), material);
  nearShoulder.name = 'fog-man-raised-shoulder';
  nearShoulder.position.set(-0.43, 0.86, -0.02);
  nearShoulder.rotation.z = 0.18;
  root.add(nearShoulder);

  root.visible = false;
  return root;
}

function createFlashlightBeam(material: Material): Group {
  const root = new Group();
  root.name = 'weather-flashlight-beam';
  const beam = new Mesh(new ConeGeometry(0.72, 4.8, 8, 1, true), material);
  beam.name = 'weather-flashlight-beam-cone';
  beam.position.set(0.15, 1.45, -2.1);
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

function createRainSplash(material: Material): Group {
  const root = new Group();
  root.name = 'weather-rain-bucket-splash';
  const ring = new Mesh(new TorusGeometry(0.23, 0.018, 4, 10), material);
  ring.name = 'weather-rain-splash-ring';
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const left = new Mesh(new ConeGeometry(0.035, 0.34, 5), material);
  left.name = 'weather-rain-splash-left';
  left.position.set(-0.12, 0.18, 0.03);
  left.rotation.z = -0.3;
  root.add(left);
  const right = new Mesh(new ConeGeometry(0.028, 0.27, 5), material);
  right.name = 'weather-rain-splash-right';
  right.position.set(0.14, 0.15, -0.05);
  right.rotation.z = 0.42;
  root.add(right);
  root.position.set(-0.8, 1.02, -0.45);
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
  private readonly splashMaterial: MeshStandardMaterial;
  private readonly silhouette: Group;
  private readonly flashlightBeam: Group;
  private readonly flashlightBeamCone: Mesh;
  private readonly anchorChain: Group;
  private readonly rainSplash: Group;
  private readonly lightningFlash: Group;
  private active: ActiveWeatherAnimation | null = null;
  private disposed = false;

  constructor(
    private readonly cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
  ) {
    this.worldRoot.name = 'weather-event-world';
    this.boatRoot.name = 'weather-event-boat';
    this.figureMaterial = new MeshStandardMaterial({
      color: 0x17151e,
      emissive: 0x08070b,
      emissiveIntensity: 0.18,
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
    this.splashMaterial = new MeshStandardMaterial({
      color: 0x8cb6bd,
      emissive: 0x557b83,
      emissiveIntensity: 0.2,
      roughness: 0.5,
      flatShading: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.silhouette = createFogMan(this.figureMaterial);
    this.flashlightBeam = createFlashlightBeam(this.beamMaterial);
    this.flashlightBeamCone = this.flashlightBeam.children[0] as Mesh;
    this.anchorChain = createAnchorChain(chainMaterial);
    this.rainSplash = createRainSplash(this.splashMaterial);
    this.lightningFlash = createLightningFlash(this.lightningMaterial);
    this.worldRoot.add(this.silhouette, this.lightningFlash);
    this.boatRoot.add(this.flashlightBeam, this.anchorChain, this.rainSplash);
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    collectMeshResources(this.boatRoot, this.ownedGeometries, this.ownedMaterials);
    this.rememberCameraBase();
  }

  stage(_eventId: string): void {
    if (this.disposed) return;
    this.cancelActive();
    this.rememberCameraBase();
    this.hideTransientEffects();
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
    if (!this.supplyDisplay.pinEventActor(instanceId)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve(false);
    }
    if (!this.supplyDisplay.applyEventItemPose(instanceId, this.itemSample)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve(false);
    }
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
    const duration = response === null
      ? null
      : weatherReactionDuration(eventId, response.choiceId, response.actors.length);
    if (response === null || duration === null) {
      this.cancelActive();
      return Promise.resolve();
    }
    if (this.active !== null) this.cancelActive();
    this.rememberCameraBase();
    this.supplyDisplay.clearEventPose();
    this.hideTransientEffects();
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        response,
        outcome,
        elapsed: 0,
        duration,
        activeActorIndex: -1,
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
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials, new Set());
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
    this.supplyDisplay.applyEventAmbientPose(sample.supplyRoll, sample.supplyLift);
    if (eventId === 'man-in-the-fog') {
      this.showSilhouette(sample.figureVisibility, sample.figureDistance, false);
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
    this.supplyDisplay.applyEventItemPose(instanceId, this.itemSample);
    this.supplyDisplay.applyEventAmbientPose(this.itemSample.supplyRoll, 0);
    if (this.itemSample.cameraYaw !== 0 || this.itemSample.cameraPush !== 0) {
      this.applyCameraPose(
        0,
        0,
        -this.itemSample.cameraPush,
        this.itemSample.cameraYaw,
        0,
        0,
      );
    }
    const effect = this.itemSample.effect;
    if (effect <= 0.01) return;
    switch (this.itemSample.effectKind) {
      case 'storm-anchor-check':
      case 'wave-anchor-stabilize':
        this.anchorChain.visible = true;
        this.anchorChain.scale.y = 0.18 + effect * 0.82;
        this.anchorChain.rotation.z = this.itemSample.effectKind === 'storm-anchor-check'
          ? -0.08 * effect
          : 0.04 * effect;
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
      case 'shower-rain-catch':
        this.rainSplash.visible = true;
        this.rainSplash.position.set(-0.8, 1.02, -0.45);
        this.rainSplash.scale.setScalar(0.48 + effect * 0.68);
        this.splashMaterial.opacity = effect * 0.66;
        break;
      case 'storm-bucket-bail':
        this.rainSplash.visible = true;
        this.rainSplash.position.set(0.72, 0.86, -0.75);
        this.rainSplash.rotation.z = -0.32 * effect;
        this.rainSplash.scale.setScalar(0.58 + effect * 0.78);
        this.splashMaterial.opacity = effect * 0.7;
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
    const damagingFlashlight = eventId === 'man-in-the-fog'
      && response.choiceId === 'flashlight'
      && healthDamage < 0;
    const actorCount = response.actors.length;
    const actorIndex = actorCount === 0
      ? 0
      : Math.min(actorCount - 1, Math.floor(progress * actorCount));
    const actor = response.actors[actorIndex];
    const condition = actor?.condition === 'broken'
      ? 'broken'
      : actor?.condition === 'lost' || actor?.condition === 'consumed'
        ? 'lost'
        : null;
    if (!sampleWeatherReaction(
      eventId,
      response.choiceId,
      actorIndex,
      actorCount,
      condition,
      hullDamage,
      progress,
      this.reactionSample,
    )) return;

    if (actor !== undefined && active.activeActorIndex !== actorIndex) {
      if (this.supplyDisplay.pinEventActor(actor.instanceId)) {
        active.activeActorIndex = actorIndex;
      }
    }
    if (actor !== undefined && active.activeActorIndex === actorIndex) {
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

    const sample = this.reactionSample;
    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );
    this.applyReactionEffect(sample);

    if (damagingFlashlight) {
      const grab = pulse(progress, 0.08, 0.44, 0.9);
      this.showSilhouette(grab, grab, true);
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
      case 'shower-safe-settle':
      case 'shower-break-collapse':
        this.rainSplash.visible = true;
        this.rainSplash.position.set(-0.8, 1.02, -0.45);
        this.rainSplash.scale.setScalar(0.52 + effect * 0.6);
        this.splashMaterial.opacity = 0.32 + effect * 0.34;
        break;
      case 'storm-anchor-steady':
        this.anchorChain.visible = true;
        this.anchorChain.scale.y = 0.24 + effect * 0.76;
        this.anchorChain.rotation.z = -0.04 * effect;
        break;
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

  private showSilhouette(visibility: number, distance: number, close: boolean): void {
    if (visibility <= 0.015) return;
    this.silhouette.visible = true;
    this.figureMaterial.opacity = Math.min(0.76, visibility * 0.72);
    if (close) {
      this.silhouette.position.set(
        1.15 - distance * 0.28,
        1.06,
        DISTANT_FIGURE_Z + (CLOSE_FIGURE_Z - DISTANT_FIGURE_Z) * distance,
      );
      this.silhouette.scale.setScalar(1 + distance * 0.34);
      return;
    }
    this.silhouette.position.set(
      3.4 - distance * 0.52,
      1.2,
      DISTANT_FIGURE_Z + distance * 2.6,
    );
    this.silhouette.scale.setScalar(1);
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
    this.silhouette.position.set(3.4, 1.2, DISTANT_FIGURE_Z);
    this.silhouette.scale.setScalar(1);
    this.figureMaterial.opacity = 0;
    this.flashlightBeam.visible = false;
    this.flashlightBeam.rotation.set(0, 0, 0);
    this.flashlightBeamCone.scale.set(0.01, 0.01, 0.01);
    this.beamMaterial.opacity = 0;
    this.anchorChain.visible = false;
    this.anchorChain.scale.set(1, 1, 1);
    this.anchorChain.rotation.set(0, 0, 0);
    this.rainSplash.visible = false;
    this.rainSplash.position.set(-0.8, 1.02, -0.45);
    this.rainSplash.rotation.set(0, 0, 0);
    this.rainSplash.scale.set(1, 1, 1);
    this.splashMaterial.opacity = 0;
    this.splashMaterial.emissiveIntensity = 0.2;
    this.lightningFlash.visible = false;
    this.lightningFlash.scale.set(1, 1, 1);
    this.lightningMaterial.opacity = 0;
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    this.restoreCamera();
    this.hideTransientEffects();
    switch (active.kind) {
      case 'item':
        this.supplyDisplay.clearEventPose();
        active.resolve(true);
        break;
      case 'react':
        const actor = active.activeActorIndex < 0
          ? undefined
          : active.response.actors[active.activeActorIndex];
        if (actor?.condition === 'lost' || actor?.condition === 'consumed') {
          this.supplyDisplay.releaseEventActorOnNextSync();
        } else {
          this.supplyDisplay.clearEventPose();
          this.supplyDisplay.releaseEventActor();
        }
        active.resolve();
        break;
      case 'reveal':
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
    if (active?.kind === 'item') {
      active.resolve(false);
    } else if (active !== null) {
      active.resolve();
    }
  }
}
