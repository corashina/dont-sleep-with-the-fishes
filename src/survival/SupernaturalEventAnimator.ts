import { GHOST_COUNT, ghostFlashlightCycle, ghostFlashlightFade } from './ghostFlashlightChoreography';
import {
  GHOST_BAIT_PASS_OFFSETS,
  GHOST_BAIT_REACTION_DURATION,
  GHOST_BAIT_TURN_CUE,
  ghostBaitDriftRate,
  ghostBaitPassProgress,
  ghostBaitRushProgress,
  ghostBaitTurn,
  sampleGhostBaitCamera,
  sampleGhostBaitRush,
  type GhostBaitCamera,
  type GhostBaitRush,
} from './ghostBaitChoreography';
import type { EventPresentationCue } from './eventPresentationCue';
import { ItemAimTarget } from './ItemAimTarget';
import { smoothstep } from './animationMath';
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Texture,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { collectMeshResources, disposeResourceSets, runCleanupSteps } from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import {
  eventItemUseDuration,
} from './eventItemUseChoreography';
import type { EventModelLibrary } from './EventModelLibrary';
import {
  sampleEventPhysicalResponsePose,
  type EventPhysicalResponsePose,
} from './eventPhysicalResponseChoreography';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import { SeaMistCurtain } from './SeaMistCurtain';
import { SIREN_SCENE_OFFSET_Z, styleSiren } from './SirenAppearance';
import { createSirenReef, createSirenRock } from './SirenReef';
import type { ActionOutcome } from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';
import {
  SIREN_ATTACK_DURATION,
  createGhostFloatPaths,
  createGhostFloatPose,
  sampleGhostFloatPathInto,
  sampleSupernaturalItemUse,
  sampleSupernaturalReaction,
  sampleSupernaturalReveal,
  sirenAttacks,
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

type ActiveSupernaturalReveal = Extract<ActiveSupernaturalAnimation, { kind: 'reveal' }>;
type ActiveSupernaturalItem = Extract<ActiveSupernaturalAnimation, { kind: 'item' }>;
type ActiveSupernaturalReaction = Extract<ActiveSupernaturalAnimation, { kind: 'react' }>;

const REACTION_DURATION = 0.84;
const GHOST_OPACITY = 0.56;
const GHOST_EMISSIVE = 0.34;
const FALLBACK_PLAYER_POSITION = [0, 1.5, 0] as const;

function isGhostBait(eventId: string, response: EventPhysicalResponsePresentation | null): boolean {
  return eventId === 'ghosts' && response?.choiceId === 'baitTin';
}

function isSirenAttack(eventId: string, outcome: ActionOutcome): boolean {
  return eventId === 'eerie-melody' && sirenAttacks(outcome);
}

function reactionDuration(ghostBait: boolean, sirenAttack: boolean): number {
  if (ghostBait) return GHOST_BAIT_REACTION_DURATION;
  return sirenAttack ? SIREN_ATTACK_DURATION : REACTION_DURATION;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function itemDuration(eventId: string, choiceId: string): number | null {
  const sceneDuration = supernaturalItemUseDuration(eventId, choiceId);
  if (sceneDuration !== null) return sceneDuration;
  if (eventId !== 'face-on-the-moon') return null;
  if (choiceId === 'umbrella') return eventItemUseDuration('umbrella-shield');
  if (choiceId === 'spyglass') return eventItemUseDuration('binocular-look');
  return null;
}
const SIREN_ROCK_X = -5.8;
const SIREN_ROCK_Z = -12.2 + SIREN_SCENE_OFFSET_Z;
const SIREN_WATERLINE_Y = 0;
const SIREN_ROCK_SUBMERGENCE = 0.28;
const SIREN_BODY_SETTLE = 0.7;
// The face's place inside the siren asset's bounds, per axis. The asset faces positive x.
const SIREN_FACE_BOUNDS = [0.9, 0.93, 0.27] as const;
const SIREN_STRIKE_GAP = 1.6;
const SIREN_DIVE_REACH = 3.2;
const SIREN_DIVE_ARC = 1.4;
const SIREN_EMERGE_GAP = 4.5;
const SIREN_BURST_ARC = 0.5;
const SIREN_FALL_REACH = 5;
const SIREN_FALL_ARC = 1.2;
const SIREN_SUBMERGE_CLEARANCE = 0.3;
const SIREN_LOOK_DROP = 0.5;
const GHOST_FOG_OPACITY = 0.18;
const GHOST_FOG_SCALE = [4.5, 5.2, 1.8] as const;
const GHOST_FOG_X = 18;
const FLARE_RADII = [
  1, 0.68, 0.94, 0.62, 1.08, 0.7,
  0.88, 0.6, 1.02, 0.66, 0.9, 0.64,
] as const;
function replaceGhostMaterials(root: Group, body: MeshStandardMaterial, eyes: MeshStandardMaterial): void {
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
    const replacements = materials.map(material => material instanceof MeshStandardMaterial
      && Math.max(material.color.r, material.color.g, material.color.b) < 0.05 ? eyes : body);
    object.material = Array.isArray(object.material) ? replacements : replacements[0]!;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  disposeResourceSets(replacedTextures, replacedMaterials);
}

function collectMaterialTextures(
  materials: Iterable<Material>,
  textures: Set<Texture>,
): void {
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
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
      Math.cos(angle) * radius * 0.62,
      Math.sin(angle) * radius * 0.78,
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

function createFlareFlash(material: Material): Mesh {
  const flash = new Mesh(createFlareBurstGeometry(), material);
  flash.name = 'supernatural-flare-flash';
  flash.position.set(2.2, 2.4, -7.2);
  flash.visible = false;
  return flash;
}

export class SupernaturalEventAnimator {
  readonly worldRoot = new Group();

  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
  private readonly ownedInstances = new Set<InstancedMesh>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly revealSample: SupernaturalRevealSample = {
    cameraX: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    ghostVisibility: 0,
    ghostVisibilities: [0, 0, 0, 0, 0],
    flareFlash: 0,
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
    sirenRear: 0,
    sirenDive: 0,
    sirenSwim: 0,
    sirenBurst: 0,
    sirenStrike: 0,
    sirenFall: 0,
    sirenFocus: 0,
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
  private readonly ghostMaterials: MeshStandardMaterial[] = [];
  private readonly ghostEyeMaterials: MeshStandardMaterial[] = [];
  private readonly flareMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly ghosts: readonly Group[];
  private readonly ghostFloatPose = createGhostFloatPose();
  private readonly ghostRoot = new Group();
  private readonly ghostAimTarget = new ItemAimTarget(this.ghostRoot);
  private readonly ghostAimFrom = new Vector3();
  private readonly ghostAimTo = new Vector3();
  private ghostsRepelled = false;
  private ghostFloatPaths = createGhostFloatPaths(0);
  private readonly ghostCenterHeights: number[] = [];
  private readonly ghostBaitRush: GhostBaitRush = { travel: 0, opacity: 0 };
  private readonly ghostBaitCamera: GhostBaitCamera = { yaw: 0, pitch: 0 };
  private readonly ghostBaitPlayer = new Vector3();
  private readonly ghostBaitTarget = new Vector3();
  private ghostBaitCues = 0;
  private readonly siren: Group;
  private readonly sirenRock: Group;
  private readonly sirenTableau = new Group();
  private readonly sirenFacingAnchor = new Group();
  // The face while she sits; during the attack, the camera's view point.
  private readonly sirenLookTarget = new Group();
  private readonly sirenFace = new Vector3();
  private readonly sirenFaceOffset = new Vector3();
  private readonly sirenFaceStart = new Vector3();
  private readonly sirenPlayer = new Vector3();
  private readonly sirenDiveEntry = new Vector3();
  private readonly sirenEmerge = new Vector3();
  private readonly sirenStrikePoint = new Vector3();
  private readonly sirenFallPoint = new Vector3();
  private readonly sirenAttackDirection = new Vector3();
  private sirenAttackYaw = 0;
  private sirenModelSpan = 0;
  private sirenGone = false;
  private readonly sirenKeyLight = new PointLight(0xe1e9d2, 18, 30, 1.3);
  private readonly sirenFillLight = new PointLight(0x94bbcf, 12, 35, 1.15);
  private readonly fogCurtain = new SeaMistCurtain('supernatural-sea-mist');
  private readonly flareFlash: Mesh;
  private readonly sirenBaseRotation: Euler;
  private readonly sirenBasePosition: Vector3;
  private readonly sirenTableauBaseY: number;
  private active: ActiveSupernaturalAnimation | null = null;
  private stagedEventId: string | null = null;
  private ghostFloatTime = 0;
  private ghostLoopVisible = false;
  private disposed = false;

  constructor(
    _cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
    eventModels: EventModelLibrary,
    private readonly viewCamera?: Object3D,
    onlyEventId?: string,
    private readonly emitCue: (cue: EventPresentationCue) => void = () => undefined,
  ) {
    this.cameraLook = viewCamera === undefined
      ? null
      : new StationaryEventCamera(viewCamera);
    this.worldRoot.name = 'supernatural-event-world';
    this.ghostAimTarget.name = 'ghost-flashlight-target';
    this.worldRoot.add(this.ghostAimTarget);
    const includeGhosts = onlyEventId === undefined || onlyEventId === 'ghosts';
    const includeSiren = onlyEventId === undefined || onlyEventId === 'eerie-melody';
    this.ghosts = includeGhosts ? Array.from({ length: GHOST_COUNT }, (_, index) => {
      const ghost = eventModels.create('ghost');
      ghost.name = `ghost-${index + 1}`;
      const material = new MeshStandardMaterial({
        color: 0xb4c9c7,
        emissive: 0x526b72,
        emissiveIntensity: GHOST_EMISSIVE,
        roughness: 0.92,
        flatShading: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      this.ghostMaterials.push(material);
      const eyes = material.clone();
      eyes.color.set(0x101719);
      eyes.emissiveIntensity = 0;
      this.ghostEyeMaterials.push(eyes);
      replaceGhostMaterials(ghost, material, eyes);
      ghost.scale.multiplyScalar(0.88 + index * 0.045);
      ghost.updateWorldMatrix(false, true);
      const bounds = new Box3().setFromObject(ghost);
      this.ghostCenterHeights.push(bounds.isEmpty() ? 0 : (bounds.min.y + bounds.max.y) / 2 - ghost.position.y);
      this.poseFloatingGhost(ghost, index);
      ghost.visible = false;
      return ghost;
    }) : [];
    this.siren = includeSiren ? eventModels.create('siren') : new Group();
    this.siren.name = 'event-siren';
    styleSiren(this.siren);
    this.siren.scale.multiplyScalar(1.55);
    this.siren.position.set(0, 0, 0);
    this.siren.rotation.set(0, 0, 0);
    this.sirenBasePosition = this.siren.position.clone();
    this.sirenBaseRotation = this.siren.rotation.clone();
    this.sirenRock = createSirenRock();
    const rockBounds = new Box3().setFromObject(this.sirenRock);
    const rockMinimumY = Number.isFinite(rockBounds.min.y) ? rockBounds.min.y : 0;
    const rockMaximumY = Number.isFinite(rockBounds.max.y) ? rockBounds.max.y : 0;
    this.sirenTableauBaseY = SIREN_WATERLINE_Y
      - rockMinimumY
      - SIREN_ROCK_SUBMERGENCE;

    this.sirenFacingAnchor.name = 'siren-facing-anchor';
    const sirenBounds = new Box3().setFromObject(this.siren);
    const sirenMinimumY = Number.isFinite(sirenBounds.min.y) ? sirenBounds.min.y : 0;
    if (!sirenBounds.isEmpty()) {
      sirenBounds.getSize(this.sirenFace)
        .multiply(this.sirenFaceOffset.fromArray(SIREN_FACE_BOUNDS))
        .add(sirenBounds.min);
      this.sirenModelSpan = sirenBounds.getSize(this.sirenFaceOffset).length();
    }
    this.sirenFacingAnchor.position.set(
      -0.12,
      rockMaximumY - sirenMinimumY - SIREN_BODY_SETTLE,
      0.02,
    );
    this.sirenFacingAnchor.rotation.set(
      0,
      Math.atan2(SIREN_ROCK_Z, -SIREN_ROCK_X),
      0,
    );
    this.sirenFacingAnchor.userData.modelForwardAxis = 'positive-x';
    this.sirenFacingAnchor.userData.facesPlayer = true;
    this.sirenFacingAnchor.userData.pose = 'seated';
    this.sirenLookTarget.name = 'siren-item-aim-target';
    this.sirenLookTarget.position.copy(this.sirenFace);
    this.sirenFacingAnchor.add(this.siren, this.sirenLookTarget);
    this.sirenKeyLight.name = 'siren-tableau-key-light';
    this.sirenKeyLight.position.set(1.8, 6, 3.2);
    this.sirenKeyLight.castShadow = false;
    this.sirenFillLight.name = 'siren-tableau-fill-light';
    this.sirenFillLight.position.set(-4, 5, -2.2);
    this.sirenFillLight.castShadow = false;

    this.sirenTableau.name = 'siren-tableau';
    this.sirenTableau.position.set(
      SIREN_ROCK_X,
      this.sirenTableauBaseY,
      SIREN_ROCK_Z,
    );
    this.sirenTableau.userData.waterlineY = SIREN_WATERLINE_Y;
    this.sirenTableau.userData.followsWaves = false;
    this.sirenTableau.userData.subjectValueSeparation = 2;
    this.sirenTableau.add(
      this.sirenRock,
      createSirenReef(this.sirenRock, SIREN_WATERLINE_Y - this.sirenTableauBaseY),
      this.sirenFacingAnchor,
      this.sirenKeyLight,
      this.sirenFillLight,
    );
    this.sirenTableau.visible = false;
    this.flareFlash = createFlareFlash(this.flareMaterial);
    for (const ghost of this.ghosts) this.ghostRoot.add(ghost);
    this.worldRoot.add(
      this.ghostRoot,
      this.sirenTableau,
      this.fogCurtain.root,
      this.flareFlash,
    );
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    this.worldRoot.traverse(object => {
      if (object instanceof InstancedMesh) this.ownedInstances.add(object);
    });
    collectMaterialTextures(this.ownedMaterials, this.ownedTextures);
    this.rememberCameraBase();
  }

  stage(eventId: string, variantSeed = 0): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = supernaturalRevealDuration(eventId) === null ? null : eventId;
    if (eventId === 'ghosts') this.ghostFloatPaths = createGhostFloatPaths(variantSeed);
    this.ghostsRepelled = false;
    this.sirenGone = false;
    this.ghostFloatTime = 0;
    this.ghostLoopVisible = eventId === 'ghosts';
    this.rememberCameraBase();
    this.restoreStage();
    this.updateGhostAim(0);
  }

  supportsItemUse(eventId: string, choiceId: string): boolean {
    return itemDuration(eventId, choiceId) !== null;
  }

  itemAimTarget(eventId: string): Object3D | null {
    if (this.disposed || this.stagedEventId !== eventId) return null;
    if (eventId === 'ghosts') return this.ghostAimTarget;
    if (eventId === 'eerie-melody') return this.sirenLookTarget;
    return null;
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
    _instanceId: ItemInstanceId,
  ): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const duration = itemDuration(eventId, choiceId);
    if (duration === null) return Promise.resolve(false);
    this.cancelActive();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.restoreStage();
    if (eventId === 'ghosts') {
      this.ghostLoopVisible = false;
      this.hideGhosts();
    }
    if (eventId === 'ghosts' && choiceId === 'flashlight') {
      this.ghostsRepelled = true;
      this.updateGhostFlashlight(0);
    }
    sampleSupernaturalItemUse(eventId, choiceId, 0, this.itemSample);
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
    if (supernaturalRevealDuration(eventId) === null) return Promise.resolve();
    this.cancelActive();
    this.stagedEventId = eventId;
    this.rememberCameraBase();
    this.restoreStage();
    if (eventId === 'ghosts') {
      this.ghostLoopVisible = false;
      this.hideGhosts();
    }
    const sceneResponse = response === null
      ? null
      : {
          choiceId: response.choiceId,
          actors: response.actors.filter(({ instanceId }) => instanceId !== selectedInstanceId),
        } satisfies EventPhysicalResponsePresentation;
    const actor = sceneResponse?.actors[0];
    if (actor !== undefined) {
      this.supplyDisplay.pinEventActor(actor.instanceId);
    }
    const ghostBait = isGhostBait(eventId, sceneResponse);
    if (ghostBait) this.startGhostBait();
    const sirenAttack = isSirenAttack(eventId, outcome);
    if (sirenAttack) this.planSirenAttack();
    const duration = reactionDuration(ghostBait, sirenAttack);
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        outcome,
        response: sceneResponse,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  update(_time: number, delta: number, _amplitudeScale = 1): void {
    if (this.disposed) return;
    const frameDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    const active = this.active;
    this.advanceGhostFloat(frameDelta);
    if (active === null) {
      if (this.stagedEventId === 'ghosts' && this.ghostLoopVisible) {
        this.showGhostLoop(GHOST_OPACITY);
        this.updateGhostAim(0);
      }
      return;
    }

    this.restoreCamera();
    this.supplyDisplay.resetEventPoseForFrame();
    this.restoreStage();
    active.elapsed = Math.min(
      active.duration,
      active.elapsed + frameDelta,
    );
    const progress = active.elapsed / active.duration;
    switch (active.kind) {
      case 'reveal':
        this.updateReveal(active.eventId, progress);
        break;
      case 'item':
        this.updateItem(active, progress);
        break;
      case 'react':
        this.updateActiveReaction(active, progress);
        break;
    }
    if (progress >= 1) this.finishActive();
  }

  // The ghosts slow to a halt while they notice the bait.
  private advanceGhostFloat(frameDelta: number): void {
    if (this.stagedEventId !== 'ghosts') return;
    const active = this.active;
    const drift = active?.kind === 'react' && isGhostBait(active.eventId, active.response)
      ? ghostBaitDriftRate(active.elapsed / active.duration)
      : 1;
    this.ghostFloatTime += frameDelta * drift;
  }

  private updateActiveReaction(active: ActiveSupernaturalReaction, progress: number): void {
    if (isGhostBait(active.eventId, active.response)) {
      this.updateGhostBait(active.eventId, active.response, progress, active.elapsed);
    } else {
      this.updateReaction(active.eventId, active.outcome, active.response, progress);
    }
  }

  clear(): void {
    if (!this.disposed) this.clearPresentation();
  }

  private clearPresentation(): void {
    this.cancelActive();
    this.stagedEventId = null;
    this.ghostLoopVisible = false;
    this.hideAll();
    this.supplyDisplay.clearEventPose();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActive();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.clearPresentation(),
      () => this.worldRoot.removeFromParent(),
      () => disposeResourceSets(this.ownedInstances),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials, this.ownedTextures),
    ]);
  }

  private updateReveal(eventId: string, progress: number): void {
    if (!sampleSupernaturalReveal(eventId, progress, this.revealSample)) return;
    const sample = this.revealSample;
    if (eventId === 'ghosts') {
      this.sirenTableau.visible = false;
      this.showGhostFog();
      this.showGhostLoop(Math.max(0.42, sample.ghostVisibility * GHOST_OPACITY));
      return;
    }

    this.applyCameraPose(
      sample.cameraX,
      sample.cameraY,
      sample.cameraZ,
      sample.cameraYaw,
      sample.cameraPitch,
      sample.cameraRoll,
    );

    for (let index = 0; index < this.ghosts.length; index += 1) {
      this.ghosts[index]!.visible = false;
    }
    this.sirenTableau.visible = true;
  }

  private updateItem(
    active: Extract<ActiveSupernaturalAnimation, { readonly kind: 'item' }>,
    progress: number,
  ): void {
    if (!sampleSupernaturalItemUse(
      active.eventId,
      active.choiceId,
      progress,
      this.itemSample,
    )) return;
    if (active.eventId === 'ghosts') {
      if (active.choiceId === 'flashlight') {
        this.updateGhostFlashlight(progress);
        return;
      }
      this.hideGhosts();
      return;
    }
    if (active.eventId === 'eerie-melody' && active.choiceId === 'radio') {
      this.siren.rotation.z = this.sirenBaseRotation.z - this.itemSample.effect * 0.12;
    }
  }

  private updateGhostFlashlight(progress: number): void {
    this.updateGhostAim(progress);
    for (let index = 0; index < this.ghosts.length; index += 1) {
      const ghost = this.ghosts[index]!;
      const fade = ghostFlashlightFade(progress, index);
      this.poseFloatingGhost(ghost, index);
      this.setGhostOpacity(index, GHOST_OPACITY * (1 - fade));
      ghost.visible = fade < 1;
    }
  }

  private updateGhostAim(progress: number): void {
    if (this.ghosts.length === 0) return;
    const cycle = ghostFlashlightCycle(progress);
    const index = Math.min(GHOST_COUNT - 1, Math.floor(cycle));
    this.ghostAimTarget.activeModel = this.ghosts[index]!;
    sampleGhostFloatPathInto(this.ghostFloatPose, this.ghostFloatPaths[Math.max(0, index - 1)]!, this.ghostFloatTime);
    this.ghostAimFrom.fromArray(this.ghostFloatPose.position);
    sampleGhostFloatPathInto(this.ghostFloatPose, this.ghostFloatPaths[index]!, this.ghostFloatTime);
    this.ghostAimTo.fromArray(this.ghostFloatPose.position);
    this.ghostAimTarget.position.copy(this.ghostAimFrom).lerp(this.ghostAimTo, smoothstep((cycle - index) / 0.2));
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
    this.applyPhysicalResponse(eventId, response, progress);
    if (isSirenAttack(eventId, outcome)) {
      this.sirenTableau.visible = true;
      this.poseSirenAttack(sample);
      this.lookAtSirenAttack(sample);
      return;
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
      if (this.ghostsRepelled) { this.hideGhosts(); return; }
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const ghost = this.ghosts[index]!;
        this.setGhostOpacity(index, Math.min(0.62, sample.ghostVisibility * 0.52));
        this.poseFloatingGhost(ghost, index);
        ghost.visible = sample.ghostVisibility > 0.015;
      }
      this.showFlare(sample.flareFlash);
      return;
    }

    this.sirenTableau.visible = true;
  }

  // Plan the face's path in the facing anchor's space, toward the player's current view.
  private planSirenAttack(): void {
    const player = this.sirenPlayer;
    if (this.viewCamera === undefined) {
      this.worldRoot.updateWorldMatrix(true, false);
      this.worldRoot.localToWorld(player.fromArray(FALLBACK_PLAYER_POSITION));
    } else {
      this.viewCamera.updateWorldMatrix(true, false);
      this.viewCamera.getWorldPosition(player);
    }
    this.sirenFacingAnchor.updateWorldMatrix(true, false);
    this.sirenFacingAnchor.worldToLocal(player);
    this.sirenFaceStart.copy(this.sirenBasePosition).add(this.sirenFace);
    const direction = this.sirenAttackDirection;
    direction.set(player.x - this.sirenFaceStart.x, 0, player.z - this.sirenFaceStart.z);
    if (direction.lengthSq() < 1e-6) direction.set(1, 0, 0);
    direction.normalize();
    this.sirenAttackYaw = Math.atan2(-direction.z, direction.x);
    const waterY = SIREN_WATERLINE_Y - this.sirenTableauBaseY - this.sirenFacingAnchor.position.y;
    // Deep enough to hide the whole body in any pose.
    const submergedY = waterY - this.sirenModelSpan - SIREN_SUBMERGE_CLEARANCE;
    this.sirenStrikePoint.copy(player).addScaledVector(direction, -SIREN_STRIKE_GAP);
    this.sirenDiveEntry.copy(this.sirenFaceStart).addScaledVector(direction, SIREN_DIVE_REACH);
    this.sirenDiveEntry.y = submergedY;
    this.sirenEmerge.copy(this.sirenStrikePoint).addScaledVector(direction, -SIREN_EMERGE_GAP);
    this.sirenEmerge.y = submergedY;
    this.sirenFallPoint.copy(this.sirenStrikePoint).addScaledVector(direction, -SIREN_FALL_REACH);
    this.sirenFallPoint.y = submergedY;
  }

  // Move the face along its path and turn the body around it.
  private poseSirenAttack(sample: SupernaturalReactionSample): void {
    const face = this.sirenLookTarget.position;
    const lean = this.placeSirenFace(sample, face);
    this.siren.rotation.set(
      this.sirenBaseRotation.x,
      this.sirenBaseRotation.y + this.sirenAttackYaw * sample.sirenRear,
      this.sirenBaseRotation.z + lean,
    );
    this.sirenFaceOffset.copy(this.sirenFace).applyEuler(this.siren.rotation);
    this.siren.position.copy(face).sub(this.sirenFaceOffset);
    // Under the surface, the camera watches the water ahead near eye level.
    face.y = Math.max(face.y, this.sirenPlayer.y - SIREN_LOOK_DROP);
    // Stay hidden under the surface between the dive and the burst.
    this.siren.visible = sample.sirenFall < 1
      && (sample.sirenSwim === 0 || sample.sirenBurst > 0);
  }

  // Place the face for the current phase and return the body's lean.
  private placeSirenFace(sample: SupernaturalReactionSample, face: Vector3): number {
    if (sample.sirenFall > 0) {
      // Clear the bow before dropping, so she never sinks through the deck.
      const fall = sample.sirenFall;
      face.lerpVectors(this.sirenStrikePoint, this.sirenFallPoint, 1 - (1 - fall) ** 2);
      face.y = this.sirenStrikePoint.y + (this.sirenFallPoint.y - this.sirenStrikePoint.y) * fall ** 3
        + Math.sin(Math.PI * fall) * SIREN_FALL_ARC;
      return 0.3 + 1.5 * fall;
    }
    if (sample.sirenBurst > 0) {
      const rise = 1 - (1 - sample.sirenBurst) ** 2;
      face.lerpVectors(this.sirenEmerge, this.sirenStrikePoint, sample.sirenBurst);
      face.y = this.sirenEmerge.y + (this.sirenStrikePoint.y - this.sirenEmerge.y) * rise
        + Math.sin(Math.PI * sample.sirenBurst) * SIREN_BURST_ARC;
      return 0.5 * (1 - sample.sirenBurst) - 0.45 * sample.sirenStrike;
    }
    if (sample.sirenSwim > 0) {
      face.lerpVectors(this.sirenDiveEntry, this.sirenEmerge, sample.sirenSwim);
      return -1.3;
    }
    face.lerpVectors(this.sirenFaceStart, this.sirenDiveEntry, sample.sirenDive);
    face.y += Math.sin(Math.PI * sample.sirenDive) * SIREN_DIVE_ARC;
    return 0.3 * sample.sirenRear - 1.6 * sample.sirenDive;
  }

  private lookAtSirenAttack(sample: SupernaturalReactionSample): void {
    const camera = this.viewCamera;
    if (this.cameraLook === null || camera === undefined) return;
    this.cameraLook.applyLookAt(this.sirenLookTarget, sample.sirenFocus);
    camera.rotateX(sample.cameraPitch);
    camera.rotateZ(sample.cameraRoll);
  }

  private applyPhysicalResponse(
    eventId: string,
    response: EventPhysicalResponsePresentation | null,
    progress: number,
  ): void {
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
  }

  private startGhostBait(): void {
    this.ghostBaitCues = 0;
    const player = this.ghostBaitPlayer;
    if (this.viewCamera === undefined) {
      player.fromArray(FALLBACK_PLAYER_POSITION);
      return;
    }
    this.viewCamera.updateWorldMatrix(true, false);
    this.worldRoot.updateWorldMatrix(true, false);
    this.viewCamera.getWorldPosition(player);
    this.worldRoot.worldToLocal(player);
  }

  // The ghosts halt, turn, stare, then rush at the player and disappear on contact.
  private updateGhostBait(
    eventId: string,
    response: EventPhysicalResponsePresentation | null,
    progress: number,
    elapsed: number,
  ): void {
    this.applyPhysicalResponse(eventId, response, progress);
    if (this.ghostBaitCues === 0 && progress >= GHOST_BAIT_TURN_CUE) {
      this.ghostBaitCues = 1;
      this.emitCue({ eventId: 'ghosts', cue: 'turn' });
    }
    if (this.ghostBaitCues === 1 && progress >= ghostBaitPassProgress(0)) {
      this.ghostBaitCues = 2;
      this.emitCue({ eventId: 'ghosts', cue: 'contact' });
    }
    const camera = sampleGhostBaitCamera(this.ghostBaitCamera, progress, this.ghosts.length);
    this.cameraLook?.apply(camera.yaw, camera.pitch, camera.yaw * 0.6);
    const player = this.ghostBaitPlayer;
    const target = this.ghostBaitTarget;
    for (let index = 0; index < this.ghosts.length; index += 1) {
      const ghost = this.ghosts[index]!;
      const material = this.ghostMaterials[index]!;
      const offset = GHOST_BAIT_PASS_OFFSETS[index]!;
      this.poseFloatingGhost(ghost, index);
      target.set(
        player.x + offset[0],
        player.y + offset[1] - this.ghostCenterHeights[index]!,
        player.z,
      );
      const pathYaw = ghost.rotation.y;
      const faceYaw = Math.atan2(ghost.position.x - target.x, ghost.position.z - target.z);
      const turn = ghostBaitTurn(progress, index);
      ghost.rotation.y = pathYaw + wrapAngle(faceYaw - pathYaw) * turn;
      const rushing = ghostBaitRushProgress(progress, index) > 0;
      ghost.rotation.z = rushing ? 0 : Math.sin(elapsed * 23 + index * 1.7) * 0.035 * turn;
      const rush = sampleGhostBaitRush(this.ghostBaitRush, progress, index);
      if (rushing) {
        target.sub(ghost.position);
        ghost.position.addScaledVector(target, rush.travel);
      }
      this.setGhostOpacity(index, (GHOST_OPACITY + 0.24 * turn) * rush.opacity);
      material.emissiveIntensity = GHOST_EMISSIVE + 0.7 * turn;
      ghost.visible = material.opacity > 0.01;
    }
  }

  private poseFloatingGhost(
    ghost: Group,
    index: number,
  ): void {
    sampleGhostFloatPathInto(
      this.ghostFloatPose,
      this.ghostFloatPaths[index]!,
      this.ghostFloatTime,
    );
    ghost.position.set(...this.ghostFloatPose.position);
    ghost.rotation.y = Math.atan2(
      -this.ghostFloatPose.tangent[0],
      -this.ghostFloatPose.tangent[2],
    );
    ghost.rotation.z = 0;
    ghost.userData.modelForwardAxis = 'negative-z';
    ghost.userData.facingPath = true;
  }

  private showGhostLoop(opacity: number): void {
    for (let index = 0; index < this.ghosts.length; index += 1) {
      const ghost = this.ghosts[index]!;
      this.setGhostOpacity(index, opacity);
      this.ghostMaterials[index]!.emissiveIntensity = GHOST_EMISSIVE;
      this.poseFloatingGhost(ghost, index);
      ghost.visible = true;
    }
  }

  private setGhostOpacity(index: number, opacity: number): void {
    this.ghostMaterials[index]!.opacity = opacity;
    this.ghostEyeMaterials[index]!.opacity = opacity;
  }

  private showFlare(amount: number): void {
    this.flareFlash.visible = amount > 0.015;
    this.flareMaterial.opacity = Math.min(0.72, amount * 0.7);
    this.flareFlash.scale.setScalar(0.72 + amount * 0.36);
  }

  private setFogOpacity(amount: number): void {
    this.fogCurtain.setOpacity(amount);
  }

  private showGhostFog(): void {
    this.fogCurtain.root.scale.set(...GHOST_FOG_SCALE);
    this.fogCurtain.root.position.set(GHOST_FOG_X, 0, 0);
    this.fogCurtain.root.visible = true;
    this.setFogOpacity(GHOST_FOG_OPACITY);
  }

  private restoreStage(): void {
    this.hideAll();
    this.sirenTableau.position.set(
      SIREN_ROCK_X,
      this.sirenTableauBaseY,
      SIREN_ROCK_Z,
    );
    this.sirenTableau.rotation.set(0, 0, 0);
    this.siren.position.copy(this.sirenBasePosition);
    this.siren.rotation.copy(this.sirenBaseRotation);
    this.sirenLookTarget.position.copy(this.sirenBasePosition).add(this.sirenFace);
    this.siren.visible = !this.sirenGone;
    if (this.stagedEventId === 'ghosts') {
      if (!this.ghostsRepelled) this.showGhostLoop(0.42);
      this.showGhostFog();
    } else if (this.stagedEventId === 'eerie-melody') {
      this.sirenTableau.visible = true;
    }
  }

  private hideAll(): void {
    this.hideGhosts();
    this.sirenTableau.visible = false;
    this.fogCurtain.root.visible = false;
    this.flareFlash.visible = false;
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
        this.finishReveal(active);
        break;
      case 'item':
        this.finishItem(active);
        break;
      case 'react':
        this.finishReaction(active);
        break;
    }
  }

  private finishReveal(active: ActiveSupernaturalReveal): void {
    if (active.eventId === 'ghosts') {
      this.ghostLoopVisible = true;
      this.showGhostFog();
      this.showGhostLoop(GHOST_OPACITY);
    } else this.restoreStage();
    active.resolve();
  }

  private finishItem(active: ActiveSupernaturalItem): void {
    this.restoreStage();
    active.resolve(true);
  }

  private finishReaction(active: ActiveSupernaturalReaction): void {
    this.settleReaction(active.eventId, active.outcome, active.response);
    const actor = active.response?.actors[0];
    if (actor?.condition === 'lost' || actor?.condition === 'consumed') {
      this.supplyDisplay.releaseEventActorOnNextSync();
    } else if (actor !== undefined) {
      this.supplyDisplay.clearEventPose();
      this.supplyDisplay.releaseEventActor();
    }
    active.resolve();
  }

  private settleReaction(
    eventId: string,
    outcome: ActionOutcome,
    response: EventPhysicalResponsePresentation | null,
  ): void {
    this.hideAll();
    // The rock stays in view; the siren stays in the sea after her attack.
    if (eventId === 'eerie-melody') {
      this.sirenGone = sirenAttacks(outcome);
      this.restoreStage();
      return;
    }
    // The ghosts stay gone after contact with the player.
    if (isGhostBait(eventId, response)) this.ghostsRepelled = true;
    if (eventId === 'ghosts' && !this.ghostsRepelled && response?.choiceId !== 'flareGun') {
      this.ghostLoopVisible = true;
      this.showGhostFog();
      this.showGhostLoop(0.32);
    } else if (eventId === 'ghosts') {
      this.ghostLoopVisible = false;
    }
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active !== null) {
      this.restoreCamera();
    }
    this.hideAll();
    if (active?.kind === 'item') {
      active.resolve(false);
    } else if (active !== null) {
      active.resolve();
    }
  }

}
