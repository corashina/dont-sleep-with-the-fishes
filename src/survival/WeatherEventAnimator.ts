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
import type { EventModelLibrary } from './EventModelLibrary';
import type {
  ActionOutcome,
  ItemCondition,
} from './survivalTypes';
import {
  sampleWeatherItemUse,
  sampleWeatherReveal,
  weatherItemUseDuration,
  weatherRevealDuration,
  type WeatherItemSample,
  type WeatherRevealSample,
} from './weatherEventChoreography';

export interface EventPhysicalResponsePresentation {
  readonly choiceId: string;
  readonly instanceId: ItemInstanceId;
  readonly condition: ItemCondition;
}

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
      readonly outcome: ActionOutcome;
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

const REACTION_DURATION = 0.84;
const CLOSE_FIGURE_Z = -3.2;
const DISTANT_FIGURE_Z = -6.2;
const REVEAL_FIGURE_X = -1.5;
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
    eventModels: EventModelLibrary,
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

    this.ownedMaterials.add(this.figureMaterial);
    this.silhouette = prepareFogMan(eventModels.create('fogMan'), this.figureMaterial);
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
    if (response === null || weatherRevealDuration(eventId) === null) {
      this.cancelActive();
      return Promise.resolve();
    }
    if (this.active !== null) this.cancelActive();
    this.rememberCameraBase();
    this.supplyDisplay.clearEventPose();
    this.hideTransientEffects();
    if (!this.supplyDisplay.pinEventActor(response.instanceId)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        response,
        outcome,
        elapsed: 0,
        duration: REACTION_DURATION,
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
        this.updateReaction(active.eventId, active.outcome, active.response, progress);
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
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null,
    progress: number,
  ): void {
    resetItemSample(this.itemSample);
    const healthDamage = Math.min(0, outcome.deltas.health ?? 0);
    const hullDamage = Math.min(0, outcome.deltas.hull ?? 0);
    const damagingFlashlight = eventId === 'man-in-the-fog'
      && response?.choiceId === 'flashlight'
      && healthDamage < 0;
    const lostSupply = eventId === 'restless-waves'
      && response?.condition === 'lost';
    const brokenRing = eventId === 'restless-waves'
      && response?.choiceId === 'swimRing'
      && response.condition === 'broken';

    if (brokenRing) {
      const compression = smoothstep((progress - 0.04) / 0.36);
      const buckle = pulse(progress, 0.02, 0.24, 0.54);
      this.itemSample.y = -0.09 * compression;
      this.itemSample.yaw = -0.3 * compression;
      this.itemSample.roll = 0.34 * compression + 0.08 * buckle;
      this.itemSample.scaleX = 1 - 0.3 * compression;
      this.itemSample.scaleY = 1 - 0.36 * compression;
      this.itemSample.scaleZ = 1 + 0.08 * compression;
      this.supplyDisplay.applyEventItemPose(response.instanceId, this.itemSample);
    } else if (response?.condition === 'broken') {
      const settle = Math.sin(Math.PI * Math.min(1, progress / 0.58))
        * (1 - smoothstep((progress - 0.46) / 0.54));
      this.itemSample.y = -0.12 * settle;
      this.itemSample.roll = 0.26 * settle;
      this.itemSample.scaleY = 1 - 0.08 * settle;
      this.supplyDisplay.applyEventItemPose(response.instanceId, this.itemSample);
    } else if (lostSupply) {
      const departure = smoothstep((progress - 0.08) / 0.82);
      this.itemSample.x = 1.8 * departure;
      this.itemSample.y = 0.16 * departure;
      this.itemSample.z = 0.15 * departure;
      this.itemSample.yaw = 0.5 * departure;
      this.itemSample.roll = -0.2 * departure;
      this.supplyDisplay.applyEventItemPose(response.instanceId, this.itemSample);
    } else if (response?.condition === 'lost' || response?.condition === 'consumed') {
      const departure = smoothstep((progress - 0.08) / 0.82);
      this.itemSample.x = -1.8 * departure;
      this.itemSample.y = 0.52 * departure;
      this.itemSample.z = -1.25 * departure;
      this.itemSample.yaw = 1.1 * departure;
      this.itemSample.roll = -0.55 * departure;
      this.supplyDisplay.applyEventItemPose(response.instanceId, this.itemSample);
    }

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
    if (hullDamage < 0) {
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
    this.figureMaterial.opacity = Math.min(0.96, visibility * 0.94);
    if (close) {
      this.silhouette.position.set(
        1.15 - distance * 0.28,
        -0.14,
        DISTANT_FIGURE_Z + (CLOSE_FIGURE_Z - DISTANT_FIGURE_Z) * distance,
      );
      this.silhouette.scale.setScalar(1 + distance * 0.34);
      return;
    }
    this.silhouette.position.set(
      REVEAL_FIGURE_X - distance * 0.25,
      REVEAL_FIGURE_Y,
      DISTANT_FIGURE_Z + distance * 1.6,
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
        if (
          active.response?.condition === 'lost'
          || active.response?.condition === 'consumed'
        ) {
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
