import {
  BufferGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventModelLibrary } from './EventModelLibrary';
import {
  sampleEventPhysicalResponsePose,
  type EventPhysicalResponsePose,
} from './eventPhysicalResponseChoreography';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type { ActionOutcome } from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';
import {
  GHOST_FLIGHT_PATHS,
  sampleSupernaturalItemUse,
  sampleSupernaturalReaction,
  sampleSupernaturalReveal,
  supernaturalItemUseDuration,
  supernaturalRevealDuration,
  type SupernaturalItemSample,
  type SupernaturalReactionSample,
  type SupernaturalRevealSample,
} from './supernaturalEventChoreography';

type ActiveSupernaturalAnimation =
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
      readonly outcome: ActionOutcome;
      readonly response: EventPhysicalResponsePresentation | null;
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

const REACTION_DURATION = 0.84;
const SIREN_ROCK_X = -4.3;
const SIREN_ROCK_Y = -0.26;
const SIREN_ROCK_Z = -9.2;
const FOG_OPACITY_WEIGHTS = [0.72, 1, 0.58] as const;
const FLARE_RADII = [
  1, 0.68, 0.94, 0.62, 1.08, 0.7,
  0.88, 0.6, 1.02, 0.66, 0.9, 0.64,
] as const;
const GHOST_ATTACK_TARGETS = [
  [-1.8, 1.18, -2.4],
  [-0.9, 1.42, -1.9],
  [0, 1.08, -1.55],
  [0.92, 1.36, -2.05],
  [1.72, 1.12, -2.55],
] as const;

function replaceMaterials(root: Group, material: Material): void {
  const replacedMaterials = new Set<Material>();
  const replacedTextures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const replaced of materials) {
      replacedMaterials.add(replaced);
      for (const value of Object.values(replaced)) {
        if (value instanceof Texture) replacedTextures.add(value);
      }
    }
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  disposeResourceSets(replacedTextures, replacedMaterials);
}

function createFogStripGeometry(width: number, height: number, variant: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const xOffsets = [-0.5, -0.28, -0.04, 0.25, 0.5] as const;
  const upperOffsets = [
    [0.28, 0.47, 0.39, 0.52, 0.31],
    [0.35, 0.5, 0.32, 0.46, 0.27],
    [0.3, 0.42, 0.51, 0.34, 0.25],
  ] as const;
  const lowerOffsets = [
    [-0.34, -0.49, -0.38, -0.53, -0.3],
    [-0.28, -0.46, -0.35, -0.5, -0.25],
    [-0.32, -0.43, -0.52, -0.36, -0.27],
  ] as const;
  const positions: number[] = [];
  for (let index = 0; index < xOffsets.length; index += 1) {
    positions.push(
      xOffsets[index]! * width,
      upperOffsets[variant]![index]! * height,
      0,
    );
  }
  for (let index = 0; index < xOffsets.length; index += 1) {
    positions.push(
      xOffsets[index]! * width,
      lowerOffsets[variant]![index]! * height,
      0,
    );
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 5, 1, 1, 5, 6,
    1, 6, 2, 2, 6, 7,
    2, 7, 3, 3, 7, 8,
    3, 8, 4, 4, 8, 9,
  ]);
  return geometry;
}

function createFlareBurstGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions: number[] = [0, 0.1, 0];
  const colors: number[] = [1, 0.36, 0.22];
  const indices: number[] = [];
  for (let index = 0; index < FLARE_RADII.length; index += 1) {
    const angle = Math.PI * 2 * index / FLARE_RADII.length;
    const radius = FLARE_RADII[index]!;
    positions.push(
      Math.cos(angle) * radius * 2.35,
      Math.sin(angle) * radius * 3.05,
      0,
    );
    const edge = index % 2 === 0 ? 0.28 : 0.14;
    colors.push(edge, 0.018, 0.025);
    indices.push(0, index + 1, (index + 1) % FLARE_RADII.length + 1);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createFogCurtain(materials: readonly Material[]): Group {
  const root = new Group();
  root.name = 'supernatural-fog-curtain';
  root.position.x = SIREN_ROCK_X - 0.25;
  for (let index = 0; index < 3; index += 1) {
    const strip = new Mesh(
      createFogStripGeometry(7.2 - index * 0.7, 2.4 + index * 0.25, index),
      materials[index]!,
    );
    strip.name = `supernatural-fog-strip-${index + 1}`;
    strip.position.set(
      -1.2 + index * 1.1,
      1.1 + index * 0.25,
      -7.6 - index * 1.25,
    );
    strip.rotation.y = -0.08 + index * 0.06;
    root.add(strip);
  }
  root.visible = false;
  return root;
}

function createFlareFlash(material: Material): Mesh {
  const flash = new Mesh(createFlareBurstGeometry(), material);
  flash.name = 'supernatural-flare-flash';
  flash.position.set(0, 2.2, -4.5);
  flash.visible = false;
  return flash;
}

export class SupernaturalEventAnimator {
  readonly worldRoot = new Group();

  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly revealSample: SupernaturalRevealSample = {
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    ghostVisibility: 0,
    ghostDistances: [0, 0, 0, 0, 0],
    ghostSideOffsets: [0, 0, 0, 0, 0],
    flareFlash: 0,
    fogCurtain: 0,
    sirenHeadTurn: 0,
    sirenLunge: 0,
    melodyClarity: 0,
  };
  private readonly itemSample: SupernaturalItemSample = {
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
  };
  private readonly reactionSample: SupernaturalReactionSample = {
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    ghostVisibility: 0,
    ghostAdvance: 0,
    flareFlash: 0,
    fogCurtain: 0,
    sirenLunge: 0,
    sirenStrike: 0,
  };
  private readonly physicalResponsePose: EventPhysicalResponsePose = {
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
  private readonly ghostMaterial = new MeshStandardMaterial({
    color: 0xb4c9c7,
    emissive: 0x526b72,
    emissiveIntensity: 0.34,
    roughness: 0.92,
    flatShading: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  private readonly sirenMaterial = new MeshStandardMaterial({
    color: 0xb9b1bd,
    emissive: 0x586879,
    emissiveIntensity: 0.52,
    roughness: 0.9,
    flatShading: true,
  });
  private readonly rockMaterial = new MeshStandardMaterial({
    color: 0x4d5b61,
    roughness: 1,
    flatShading: true,
  });
  private readonly fogMaterials = [
    new MeshBasicMaterial({
      color: 0x395158,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
    new MeshBasicMaterial({
      color: 0x465e63,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
    new MeshBasicMaterial({
      color: 0x2d454d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
  ] as const;
  private readonly flareMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly ghosts: readonly Group[];
  private readonly siren: Group;
  private readonly sirenRock: Group;
  private readonly sirenTableau = new Group();
  private readonly fogCurtain: Group;
  private readonly flareFlash: Mesh;
  private readonly sirenBaseRotation: Euler;
  private readonly sirenBasePosition: Vector3;
  private readonly sirenHead: Object3D | null;
  private readonly sirenHeadBaseRotation = new Euler();
  private active: ActiveSupernaturalAnimation | null = null;
  private stagedEventId: string | null = null;
  private disposed = false;

  constructor(
    _cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
    eventModels: EventModelLibrary,
    viewCamera?: Object3D,
  ) {
    this.cameraLook = viewCamera === undefined
      ? null
      : new StationaryEventCamera(viewCamera);
    this.worldRoot.name = 'supernatural-event-world';
    this.ghosts = Array.from({ length: 5 }, (_, index) => {
      const ghost = eventModels.create('ghost');
      ghost.name = `ghost-${index + 1}`;
      replaceMaterials(ghost, this.ghostMaterial);
      const path = GHOST_FLIGHT_PATHS[index]!;
      ghost.position.set(path.start[0], path.start[1], path.start[2]);
      ghost.rotation.y = path.end[0] > path.start[0] ? -0.18 : 0.18;
      ghost.scale.multiplyScalar(0.88 + index * 0.045);
      ghost.visible = false;
      return ghost;
    });
    this.siren = eventModels.create('siren');
    this.siren.name = 'event-siren';
    replaceMaterials(this.siren, this.sirenMaterial);
    this.siren.position.set(-0.12, 0.18, 0.02);
    this.siren.rotation.set(0, 0.28, 0);
    this.sirenBasePosition = this.siren.position.clone();
    this.sirenBaseRotation = this.siren.rotation.clone();
    this.sirenHead = this.siren.getObjectByName('Formad_Head') ?? null;
    if (this.sirenHead !== null) this.sirenHeadBaseRotation.copy(this.sirenHead.rotation);

    this.sirenRock = eventModels.create('sirenRock');
    this.sirenRock.name = 'event-siren-rock';
    replaceMaterials(this.sirenRock, this.rockMaterial);
    this.sirenRock.position.set(0, 0, 0);

    this.sirenTableau.name = 'siren-tableau';
    this.sirenTableau.position.set(SIREN_ROCK_X, SIREN_ROCK_Y, SIREN_ROCK_Z);
    this.sirenTableau.add(this.sirenRock, this.siren);
    this.sirenTableau.visible = false;
    this.fogCurtain = createFogCurtain(this.fogMaterials);
    this.flareFlash = createFlareFlash(this.flareMaterial);
    this.worldRoot.add(
      ...this.ghosts,
      this.sirenTableau,
      this.fogCurtain,
      this.flareFlash,
    );
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    this.rememberCameraBase();
  }

  stage(eventId: string): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = supernaturalRevealDuration(eventId) === null ? null : eventId;
    this.rememberCameraBase();
    this.restoreStage();
  }

  supportsItemUse(eventId: string, choiceId: string): boolean {
    return supernaturalItemUseDuration(eventId, choiceId) !== null;
  }

  reveal(eventId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const duration = supernaturalRevealDuration(eventId);
    if (duration === null) return Promise.resolve();
    this.cancelActive();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.restoreStage();
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
    const duration = supernaturalItemUseDuration(eventId, choiceId);
    if (duration === null) return Promise.resolve(false);
    this.cancelActive();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.restoreStage();
    if (eventId === 'ghosts') this.hideGhosts();
    sampleSupernaturalItemUse(eventId, choiceId, 0, this.itemSample);
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
    if (supernaturalRevealDuration(eventId) === null) return Promise.resolve();
    this.cancelActive();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.supplyDisplay.clearEventPose();
    this.restoreStage();
    if (eventId === 'ghosts') this.hideGhosts();
    const actor = response?.actors[0];
    if (actor !== undefined && !this.supplyDisplay.pinEventActor(actor.instanceId)) {
      this.supplyDisplay.clearEventMotion();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        outcome,
        response,
        elapsed: 0,
        duration: REACTION_DURATION,
        resolve,
      };
    });
  }

  update(_time: number, delta: number, _amplitudeScale = 1): void {
    if (this.disposed) return;
    const active = this.active;
    if (active === null) return;

    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.restoreStage();
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
    if (progress >= 1) this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = null;
    this.hideAll();
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
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials);
  }

  private updateReveal(eventId: string, progress: number): void {
    if (!sampleSupernaturalReveal(eventId, progress, this.revealSample)) return;
    const sample = this.revealSample;
    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );
    if (eventId === 'ghosts') {
      this.sirenTableau.visible = false;
      this.fogCurtain.visible = false;
      this.ghostMaterial.opacity = Math.min(0.64, sample.ghostVisibility * 0.56);
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const ghost = this.ghosts[index]!;
        ghost.visible = sample.ghostVisibility > 0.015;
        ghost.position.set(
          sample.ghostSideOffsets[index]!,
          GHOST_FLIGHT_PATHS[index]!.start[1]
            + (GHOST_FLIGHT_PATHS[index]!.end[1]
              - GHOST_FLIGHT_PATHS[index]!.start[1]) * progress,
          -sample.ghostDistances[index]!,
        );
      }
      this.showFlare(sample.flareFlash);
      return;
    }

    for (let index = 0; index < this.ghosts.length; index += 1) {
      this.ghosts[index]!.visible = false;
    }
    this.sirenTableau.visible = sample.melodyClarity > 0.015;
    this.fogCurtain.visible = sample.fogCurtain > 0.015;
    this.setFogOpacity(Math.min(
      0.28,
      sample.fogCurtain * (0.2 + sample.melodyClarity * 0.08),
    ));
    this.turnSirenHead(sample.sirenHeadTurn);
    this.siren.position.z = this.sirenBasePosition.z + sample.sirenLunge;
  }

  private updateItem(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    progress: number,
  ): void {
    if (!sampleSupernaturalItemUse(eventId, choiceId, progress, this.itemSample)) return;
    this.supplyDisplay.applyEventItemPose(instanceId, this.itemSample);
    this.applyCameraPose(
      0,
      0,
      -this.itemSample.cameraPush,
      this.itemSample.cameraYaw,
      0,
      0,
    );
    if (eventId === 'ghosts') {
      this.hideGhosts();
      if (choiceId === 'flareGun') this.showFlare(this.itemSample.effect);
      return;
    }
    if (this.itemSample.effect > 0.015) {
      this.fogCurtain.visible = true;
      this.setFogOpacity(0.16 + this.itemSample.effect * 0.1);
    }
  }

  private updateReaction(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null,
    progress: number,
  ): void {
    if (!sampleSupernaturalReaction(
      eventId,
      outcome,
      response ?? undefined,
      progress,
      this.reactionSample,
    )) return;
    const sample = this.reactionSample;
    const actor = response?.actors[0];
    if (
      actor !== undefined
      && sampleEventPhysicalResponsePose(
        eventId,
        { choiceId: response?.choiceId ?? '', condition: actor.condition },
        progress,
        this.physicalResponsePose,
      )
    ) {
      this.supplyDisplay.applyEventItemPose(
        actor.instanceId,
        this.physicalResponsePose,
      );
    }
    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );
    if (eventId === 'ghosts') {
      this.ghostMaterial.opacity = Math.min(0.62, sample.ghostVisibility * 0.52);
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const ghost = this.ghosts[index]!;
        const pathEnd = GHOST_FLIGHT_PATHS[index]!.end;
        const target = GHOST_ATTACK_TARGETS[index]!;
        ghost.position.set(
          pathEnd[0] + (target[0] - pathEnd[0]) * sample.ghostAdvance,
          pathEnd[1] + (target[1] - pathEnd[1]) * sample.ghostAdvance,
          pathEnd[2] + (target[2] - pathEnd[2]) * sample.ghostAdvance,
        );
        ghost.visible = sample.ghostVisibility > 0.015;
      }
      this.showFlare(sample.flareFlash);
      return;
    }

    this.sirenTableau.visible = true;
    this.siren.position.z = this.sirenBasePosition.z + sample.sirenLunge * 3.6;
    this.siren.position.y = this.sirenBasePosition.y + sample.sirenStrike * 0.24;
    this.siren.rotation.z = this.sirenBaseRotation.z - sample.sirenStrike * 0.34;
    if (sample.fogCurtain > 0.015) {
      this.fogCurtain.visible = true;
      this.setFogOpacity(sample.fogCurtain * 0.64);
    }
  }

  private turnSirenHead(amount: number): void {
    if (this.sirenHead !== null) {
      this.sirenHead.rotation.copy(this.sirenHeadBaseRotation);
      this.sirenHead.rotation.y += amount * 0.62;
      return;
    }
    this.siren.rotation.copy(this.sirenBaseRotation);
    this.siren.rotation.y += amount * 0.36;
  }

  private showFlare(amount: number): void {
    this.flareFlash.visible = amount > 0.015;
    this.flareMaterial.opacity = Math.min(0.72, amount * 0.7);
    this.flareFlash.scale.setScalar(0.72 + amount * 0.42);
  }

  private setFogOpacity(amount: number): void {
    for (let index = 0; index < this.fogMaterials.length; index += 1) {
      this.fogMaterials[index]!.opacity = amount * FOG_OPACITY_WEIGHTS[index]!;
    }
  }

  private restoreStage(): void {
    this.hideAll();
    this.sirenTableau.position.set(SIREN_ROCK_X, SIREN_ROCK_Y, SIREN_ROCK_Z);
    this.sirenTableau.rotation.set(0, 0, 0);
    this.siren.position.copy(this.sirenBasePosition);
    this.siren.rotation.copy(this.sirenBaseRotation);
    if (this.sirenHead !== null) this.sirenHead.rotation.copy(this.sirenHeadBaseRotation);
    if (this.stagedEventId === 'ghosts') {
      this.ghostMaterial.opacity = 0.42;
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const target = GHOST_FLIGHT_PATHS[index]!.start;
        const ghost = this.ghosts[index]!;
        ghost.position.set(target[0], target[1], target[2]);
        ghost.visible = true;
      }
    } else if (this.stagedEventId === 'eerie-melody') {
      this.sirenTableau.visible = true;
      this.fogCurtain.visible = true;
      this.setFogOpacity(0.2);
    }
  }

  private hideAll(): void {
    this.hideGhosts();
    this.sirenTableau.visible = false;
    this.fogCurtain.visible = false;
    this.flareFlash.visible = false;
    this.ghostMaterial.emissiveIntensity = 0.34;
    this.setFogOpacity(0);
    this.flareMaterial.opacity = 0;
    this.flareFlash.scale.set(1, 1, 1);
  }

  private hideGhosts(): void {
    for (let index = 0; index < this.ghosts.length; index += 1) {
      this.ghosts[index]!.visible = false;
    }
  }

  private rememberCameraBase(): void {
    this.cameraLook?.capture();
  }

  private restoreCamera(): void {
    this.cameraLook?.restore();
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
    this.cameraLook?.apply(
      yaw - x * 0.45,
      pitch + y * 0.65 + z * 0.45,
    );
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    this.restoreCamera();
    switch (active.kind) {
      case 'reveal':
        if (active.eventId === 'ghosts') this.hideAll();
        else this.restoreStage();
        active.resolve();
        break;
      case 'item':
        this.supplyDisplay.clearEventPose();
        if (active.eventId === 'ghosts') this.hideAll();
        else this.restoreStage();
        active.resolve(true);
        break;
      case 'react':
        this.settleReaction(active.eventId, active.response);
        {
          const actor = active.response?.actors[0];
        if (
          actor?.condition === 'lost'
          || actor?.condition === 'consumed'
        ) {
          this.supplyDisplay.releaseEventActorOnNextSync();
        } else if (actor !== undefined) {
          this.supplyDisplay.clearEventPose();
          this.supplyDisplay.releaseEventActor();
        }
        }
        active.resolve();
        break;
    }
  }

  private settleReaction(
    eventId: string,
    response: EventPhysicalResponsePresentation | null,
  ): void {
    this.hideAll();
    if (eventId === 'ghosts' && response?.choiceId !== 'flareGun') {
      this.ghostMaterial.opacity = 0.32;
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const target = GHOST_ATTACK_TARGETS[index]!;
        const ghost = this.ghosts[index]!;
        ghost.position.set(target[0], target[1], target[2]);
        ghost.visible = true;
      }
    }
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active !== null) {
      this.restoreCamera();
      this.supplyDisplay.clearEventMotion();
    }
    this.hideAll();
    if (active?.kind === 'item') {
      active.resolve(false);
    } else if (active !== null) {
      active.resolve();
    }
  }
}
