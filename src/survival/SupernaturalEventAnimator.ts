import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
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
import { addTransformedMesh as addMesh } from '../rendering/addTransformedMesh';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
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
import type { ActionOutcome } from './survivalTypes';
import { StationaryEventCamera } from './StationaryEventCamera';
import {
  createGhostFloatPose,
  GHOST_FLOAT_PATHS,
  sampleGhostFloatPathInto,
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
const GHOST_MODEL_FORWARD_YAW_OFFSET = Math.PI / 2;

function itemDuration(eventId: string, choiceId: string): number | null {
  const sceneDuration = supernaturalItemUseDuration(eventId, choiceId);
  if (sceneDuration !== null) return sceneDuration;
  if (eventId !== 'face-on-the-moon') return null;
  if (choiceId === 'umbrella') return eventItemUseDuration('umbrella-shield');
  if (choiceId === 'spyglass') return eventItemUseDuration('binocular-look');
  return null;
}
const SIREN_ROCK_X = -6.3;
const SIREN_ROCK_Z = -14.8;
const SIREN_WATERLINE_Y = 0;
const SIREN_ROCK_SUBMERGENCE = 0.28;
const SIREN_BODY_SETTLE = 1.05;
const GHOST_FOG_OPACITY = 0.11;
const GHOST_FOG_SCALE = [4, 5, 1.8] as const;
const FLARE_RADII = [
  1, 0.68, 0.94, 0.62, 1.08, 0.7,
  0.88, 0.6, 1.02, 0.66, 0.9, 0.64,
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

function tuneReadableMaterials(root: Group, emissiveScale: number): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial)) return;
      material.emissive.copy(material.color).multiplyScalar(emissiveScale);
      material.emissiveIntensity = 0.72;
      material.roughness = Math.max(0.68, material.roughness);
      material.needsUpdate = true;
    });
  });
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

function createSirenRock(): Group {
  const root = new Group();
  root.name = 'event-siren-rock';
  const stone = new MeshStandardMaterial({
    color: 0x3f4b4a,
    roughness: 0.98,
    flatShading: true,
  });
  const stoneLight = new MeshStandardMaterial({
    color: 0x59625c,
    roughness: 0.96,
    flatShading: true,
  });
  const barnacle = new MeshStandardMaterial({
    color: 0xa49b7f,
    roughness: 1,
    flatShading: true,
  });

  addMesh(
    root,
    'event-siren-rock:mass',
    new DodecahedronGeometry(1, 0),
    stone,
    [0, 0.22, 0],
    [0.06, 0.1, -0.03],
    [2.65, 0.72, 1.75],
  );
  addMesh(
    root,
    'event-siren-rock:shelf:upper',
    new BoxGeometry(1.25, 0.22, 0.82),
    stoneLight,
    [-0.28, 0.74, 0.08],
    [0.06, -0.22, 0.08],
    [1.42, 1, 1.46],
  );
  addMesh(
    root,
    'event-siren-rock:shelf:side',
    new BoxGeometry(0.88, 0.18, 1.05),
    stoneLight,
    [1.02, 0.42, -0.12],
    [-0.03, 0.3, -0.04],
    [1.3, 1, 1.18],
  );
  for (let index = 0; index < 3; index += 1) {
    addMesh(
      root,
      `event-siren-rock:barnacle:${index}`,
      new ConeGeometry(0.11 + index * 0.015, 0.22, 6),
      barnacle,
      [-0.9 + index * 0.65, -0.08 + index * 0.08, 1.42],
      [Math.PI / 2, index * 0.6, 0],
    );
  }
  return root;
}

export class SupernaturalEventAnimator {
  readonly worldRoot = new Group();

  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
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
    fogCurtain: 0,
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
  private readonly siren: Group;
  private readonly sirenRock: Group;
  private readonly sirenTableau = new Group();
  private readonly sirenFacingAnchor = new Group();
  private readonly sirenKeyLight = new PointLight(0xf2c78f, 4.8, 20, 1.3);
  private readonly sirenFillLight = new PointLight(0x82b8c4, 3.2, 24, 1.15);
  private readonly fogCurtain = new SeaMistCurtain('supernatural-sea-mist');
  private readonly flareFlash: Mesh;
  private readonly sirenBaseRotation: Euler;
  private readonly sirenBasePosition: Vector3;
  private readonly sirenTableauBaseY: number;
  private active: ActiveSupernaturalAnimation | null = null;
  private stagedEventId: string | null = null;
  private fogSizeEventId: 'ghosts' | 'eerie-melody' | null = null;
  private ghostFloatTime = 0;
  private ghostLoopVisible = false;
  private disposed = false;

  constructor(
    _cameraRig: Group,
    private readonly supplyDisplay: BoatSupplyDisplay,
    eventModels: EventModelLibrary,
    viewCamera?: Object3D,
    onlyEventId?: string,
  ) {
    this.cameraLook = viewCamera === undefined
      ? null
      : new StationaryEventCamera(viewCamera);
    this.worldRoot.name = 'supernatural-event-world';
    const includeGhosts = onlyEventId === undefined || onlyEventId === 'ghosts';
    const includeSiren = onlyEventId === undefined || onlyEventId === 'eerie-melody';
    this.ghosts = includeGhosts ? Array.from({ length: 5 }, (_, index) => {
      const ghost = eventModels.create('ghost');
      ghost.name = `ghost-${index + 1}`;
      replaceMaterials(ghost, this.ghostMaterial);
      this.poseFloatingGhost(ghost, index);
      ghost.scale.multiplyScalar(0.88 + index * 0.045);
      ghost.visible = false;
      return ghost;
    }) : [];
    this.siren = includeSiren ? eventModels.create('siren') : new Group();
    this.siren.name = 'event-siren';
    tuneReadableMaterials(this.siren, 0.2);
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
    this.sirenFacingAnchor.add(this.siren);
    this.sirenKeyLight.name = 'siren-tableau-key-light';
    this.sirenKeyLight.position.set(2.8, 4.2, 4.6);
    this.sirenKeyLight.castShadow = false;
    this.sirenFillLight.name = 'siren-tableau-fill-light';
    this.sirenFillLight.position.set(-4.4, 2.6, 1.8);
    this.sirenFillLight.castShadow = false;

    this.sirenTableau.name = 'siren-tableau';
    this.sirenTableau.position.set(
      SIREN_ROCK_X,
      this.sirenTableauBaseY,
      SIREN_ROCK_Z,
    );
    this.sirenTableau.userData.waterlineY = SIREN_WATERLINE_Y;
    this.sirenTableau.userData.followsWaves = false;
    this.sirenTableau.userData.fogLayerCount = this.fogCurtain.layerCount;
    this.sirenTableau.userData.subjectValueSeparation = 2;
    this.sirenTableau.add(
      this.sirenRock,
      this.sirenFacingAnchor,
      this.sirenKeyLight,
      this.sirenFillLight,
    );
    this.sirenTableau.visible = false;
    this.flareFlash = createFlareFlash(this.flareMaterial);
    this.worldRoot.add(
      ...this.ghosts,
      this.sirenTableau,
      this.fogCurtain.root,
      this.flareFlash,
    );
    collectMeshResources(this.worldRoot, this.ownedGeometries, this.ownedMaterials);
    collectMaterialTextures(this.ownedMaterials, this.ownedTextures);
    this.rememberCameraBase();
  }

  stage(eventId: string): void {
    if (this.disposed) return;
    this.cancelActive();
    this.stagedEventId = supernaturalRevealDuration(eventId) === null ? null : eventId;
    this.ghostFloatTime = 0;
    this.ghostLoopVisible = eventId === 'ghosts';
    this.rememberCameraBase();
    this.restoreStage();
  }

  supportsItemUse(eventId: string, choiceId: string): boolean {
    return itemDuration(eventId, choiceId) !== null;
  }

  itemAimTarget(eventId: string): Object3D | null {
    if (this.disposed || this.stagedEventId !== eventId) return null;
    if (eventId === 'ghosts') return this.ghosts[0] ?? null;
    if (eventId === 'eerie-melody') return this.sirenTableau;
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
    return new Promise((resolve) => {
      this.active = {
        kind: 'react',
        eventId,
        outcome,
        response: sceneResponse,
        elapsed: 0,
        duration: REACTION_DURATION,
        resolve,
      };
    });
  }

  update(_time: number, delta: number, _amplitudeScale = 1): void {
    if (this.disposed) return;
    const frameDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    if (this.stagedEventId === 'ghosts') this.ghostFloatTime += frameDelta;
    const active = this.active;
    if (active === null) {
      if (this.stagedEventId === 'ghosts' && this.ghostLoopVisible) {
        this.showGhostLoop(0.56);
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
        this.updateReaction(active.eventId, active.outcome, active.response, progress);
        break;
    }
    if (progress >= 1) this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
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
    this.clear();
    this.disposed = true;
    this.worldRoot.removeFromParent();
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials, this.ownedTextures);
  }

  private updateReveal(eventId: string, progress: number): void {
    if (!sampleSupernaturalReveal(eventId, progress, this.revealSample)) return;
    const sample = this.revealSample;
    if (eventId === 'ghosts') {
      this.sirenTableau.visible = false;
      this.showGhostFog();
      this.showGhostLoop(Math.max(0.42, sample.ghostVisibility * 0.56));
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
    this.showSirenFog(Math.max(
      0.2,
      Math.min(
        0.42,
        sample.fogCurtain * (0.3 + sample.melodyClarity * 0.12),
      ),
    ));
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
      this.hideGhosts();
      return;
    }
    if (this.itemSample.effect > 0.015) {
      this.showSirenFog(0.16 + this.itemSample.effect * 0.1);
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
        this.poseFloatingGhost(ghost, index);
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
      this.showSirenFog(sample.fogCurtain * 0.64);
    }
  }

  private poseFloatingGhost(
    ghost: Group,
    index: number,
  ): void {
    sampleGhostFloatPathInto(
      this.ghostFloatPose,
      GHOST_FLOAT_PATHS[index]!,
      this.ghostFloatTime,
    );
    ghost.position.set(...this.ghostFloatPose.position);
    ghost.rotation.y = Math.atan2(
      this.ghostFloatPose.tangent[0],
      this.ghostFloatPose.tangent[2],
    ) + GHOST_MODEL_FORWARD_YAW_OFFSET;
    ghost.userData.modelForwardAxis = 'negative-x';
    ghost.userData.facingPath = true;
  }

  private showGhostLoop(opacity: number): void {
    this.ghostMaterial.opacity = opacity;
    for (let index = 0; index < this.ghosts.length; index += 1) {
      const ghost = this.ghosts[index]!;
      this.poseFloatingGhost(ghost, index);
      ghost.visible = true;
    }
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
    this.setFogSize('ghosts');
    this.fogCurtain.root.visible = true;
    this.setFogOpacity(GHOST_FOG_OPACITY);
  }

  private showSirenFog(opacity: number): void {
    this.setFogSize('eerie-melody');
    this.fogCurtain.root.visible = true;
    this.setFogOpacity(opacity);
  }

  private setFogSize(eventId: 'ghosts' | 'eerie-melody'): void {
    if (this.fogSizeEventId === eventId) return;
    this.fogSizeEventId = eventId;
    if (eventId === 'ghosts') {
      this.fogCurtain.root.scale.set(...GHOST_FOG_SCALE);
      return;
    }
    this.fogCurtain.root.scale.set(1, 1, 1);
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
    if (this.stagedEventId === 'ghosts') {
      this.showGhostLoop(0.42);
      this.showGhostFog();
    } else if (this.stagedEventId === 'eerie-melody') {
      this.sirenTableau.visible = true;
      this.showSirenFog(0.2);
    }
  }

  private hideAll(): void {
    this.hideGhosts();
    this.sirenTableau.visible = false;
    this.fogCurtain.root.visible = false;
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
      this.showGhostLoop(0.56);
    } else this.restoreStage();
    active.resolve();
  }

  private finishItem(active: ActiveSupernaturalItem): void {
    this.restoreStage();
    active.resolve(true);
  }

  private finishReaction(active: ActiveSupernaturalReaction): void {
    this.settleReaction(active.eventId, active.response);
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
    response: EventPhysicalResponsePresentation | null,
  ): void {
    this.hideAll();
    if (eventId === 'ghosts' && response?.choiceId !== 'flareGun') {
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
