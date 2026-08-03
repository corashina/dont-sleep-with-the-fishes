import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
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
const SIREN_ROCK_Z = -9.2;
const SIREN_WATERLINE_Y = 0;
const SIREN_ROCK_SUBMERGENCE = 0.28;
const SIREN_ROCK_VERTICAL_SCALE = 2.2;
const SIREN_MODEL_FORWARD_YAW = Math.PI / 2;
const SIREN_HEAD_PLAYER_TURN = 0.82;
const FOG_OPACITY_WEIGHTS = [0.72, 0.9, 0.64, 0.78, 0.58] as const;
const SEA_MIST_LAYERS = Object.freeze([
  Object.freeze({ x: -4.4, y: 0.38, z: -7.5, width: 8.6, height: 0.9, rotation: -0.08 }),
  Object.freeze({ x: -0.8, y: 0.46, z: -9.9, width: 11.4, height: 1.1, rotation: 0.12 }),
  Object.freeze({ x: -8.1, y: 0.5, z: -12.2, width: 12.8, height: 1.2, rotation: -0.16 }),
  Object.freeze({ x: 2.2, y: 0.42, z: -14.4, width: 10.8, height: 1, rotation: 0.07 }),
  Object.freeze({ x: -9.4, y: 0.55, z: -17, width: 14.6, height: 1.3, rotation: 0.18 }),
] as const);
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

function createSeaMistMaterial(color: number, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float sideFade = smoothstep(0.0, 0.18, vUv.x)
          * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float broadNoise = sin((vUv.x + uSeed) * 13.0)
          * sin((vUv.y - uSeed) * 9.0);
        float fineNoise = sin((vUv.x * 31.0 + vUv.y * 23.0) + uSeed * 17.0);
        float upperEdge = 0.58 + broadNoise * 0.12 + fineNoise * 0.04;
        float lowerFade = smoothstep(0.0, 0.16, vUv.y);
        float upperFade = 1.0 - smoothstep(upperEdge - 0.12, upperEdge + 0.2, vUv.y);
        float density = clamp(
          sideFade * lowerFade * upperFade * (0.82 + broadNoise * 0.1),
          0.0,
          1.0
        );
        gl_FragColor = vec4(uColor, density * uOpacity);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
  });
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

function createSeaMist(materials: readonly ShaderMaterial[]): Group {
  const root = new Group();
  root.name = 'supernatural-sea-mist';
  for (let index = 0; index < SEA_MIST_LAYERS.length; index += 1) {
    const layer = SEA_MIST_LAYERS[index]!;
    const strip = new Mesh(
      new PlaneGeometry(layer.width, layer.height),
      materials[index]!,
    );
    strip.name = `supernatural-sea-mist-layer-${index + 1}`;
    strip.position.set(layer.x, layer.y, layer.z);
    strip.rotation.set(0, layer.rotation, 0);
    strip.renderOrder = 2 + index;
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
  private readonly fogMaterials = [
    createSeaMistMaterial(0x789298, 0.17),
    createSeaMistMaterial(0x68868d, 0.39),
    createSeaMistMaterial(0x56777f, 0.61),
    createSeaMistMaterial(0x6f8b91, 0.83),
    createSeaMistMaterial(0x496b73, 1.07),
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
  private readonly sirenFacingAnchor = new Group();
  private readonly sirenKeyLight = new PointLight(0xf2c78f, 4.8, 20, 1.3);
  private readonly sirenFillLight = new PointLight(0x82b8c4, 3.2, 24, 1.15);
  private readonly fogCurtain: Group;
  private readonly flareFlash: Mesh;
  private readonly sirenBaseRotation: Euler;
  private readonly sirenBasePosition: Vector3;
  private readonly sirenTableauBaseY: number;
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
      this.poseGhost(ghost, index, path.start[0], path.start[1], path.start[2]);
      ghost.scale.multiplyScalar(0.88 + index * 0.045);
      ghost.visible = false;
      return ghost;
    });
    this.siren = eventModels.create('siren');
    this.siren.name = 'event-siren';
    tuneReadableMaterials(this.siren, 0.2);
    this.siren.position.set(0, 0, 0);
    this.siren.rotation.set(0, 0, 0);
    this.sirenBasePosition = this.siren.position.clone();
    this.sirenBaseRotation = this.siren.rotation.clone();
    this.sirenHead = this.siren.getObjectByName('Formad_Head') ?? null;
    if (this.sirenHead !== null) this.sirenHeadBaseRotation.copy(this.sirenHead.rotation);

    this.sirenRock = eventModels.create('sirenRock');
    this.sirenRock.name = 'event-siren-rock';
    tuneReadableMaterials(this.sirenRock, 0.08);
    this.sirenRock.position.set(0, 0, 0);
    this.sirenRock.scale.y *= SIREN_ROCK_VERTICAL_SCALE;
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
      rockMaximumY - sirenMinimumY + 0.03,
      0.02,
    );
    this.sirenFacingAnchor.rotation.y = Math.atan2(-SIREN_ROCK_X, -SIREN_ROCK_Z)
      - SIREN_MODEL_FORWARD_YAW;
    this.sirenFacingAnchor.userData.modelForwardAxis = 'positive-x';
    this.sirenFacingAnchor.userData.facesPlayer = true;
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
    this.sirenTableau.userData.fogLayerCount = SEA_MIST_LAYERS.length;
    this.sirenTableau.userData.subjectValueSeparation = 2;
    this.sirenTableau.add(
      this.sirenRock,
      this.sirenFacingAnchor,
      this.sirenKeyLight,
      this.sirenFillLight,
    );
    this.sirenTableau.visible = false;
    this.fogCurtain = createSeaMist(this.fogMaterials);
    this.flareFlash = createFlareFlash(this.flareMaterial);
    this.worldRoot.add(
      ...this.ghosts,
      this.sirenTableau,
      this.fogCurtain,
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
    disposeResourceSets(this.ownedGeometries, this.ownedMaterials, this.ownedTextures);
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
        ghost.visible = sample.ghostVisibilities[index]! > 0.015;
        this.poseGhost(
          ghost,
          index,
          sample.ghostSideOffsets[index]!,
          GHOST_FLIGHT_PATHS[index]!.start[1]
            + (GHOST_FLIGHT_PATHS[index]!.end[1]
              - GHOST_FLIGHT_PATHS[index]!.start[1]) * progress,
          -sample.ghostDistances[index]!,
        );
      }
      return;
    }

    for (let index = 0; index < this.ghosts.length; index += 1) {
      this.ghosts[index]!.visible = false;
    }
    this.sirenTableau.visible = sample.melodyClarity > 0.015;
    this.fogCurtain.visible = sample.fogCurtain > 0.015;
    this.setFogOpacity(Math.min(
      0.42,
      sample.fogCurtain * (0.3 + sample.melodyClarity * 0.12),
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
        this.poseGhost(ghost, index, pathEnd[0], pathEnd[1], pathEnd[2]);
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
      this.sirenHead.rotation.y += SIREN_HEAD_PLAYER_TURN + amount * 0.18;
      return;
    }
    this.siren.rotation.copy(this.sirenBaseRotation);
    this.siren.rotation.y += amount * 0.36;
  }

  private poseGhost(
    ghost: Group,
    index: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const path = GHOST_FLIGHT_PATHS[index]!;
    ghost.position.set(x, y, z);
    ghost.rotation.y = Math.atan2(
      path.end[0] - path.start[0],
      path.end[2] - path.start[2],
    );
    ghost.userData.facingPath = true;
  }

  private showFlare(amount: number): void {
    this.flareFlash.visible = amount > 0.015;
    this.flareMaterial.opacity = Math.min(0.72, amount * 0.7);
    this.flareFlash.scale.setScalar(0.72 + amount * 0.42);
  }

  private setFogOpacity(amount: number): void {
    for (let index = 0; index < this.fogMaterials.length; index += 1) {
      const opacity = amount * FOG_OPACITY_WEIGHTS[index]!;
      this.fogMaterials[index]!.uniforms.uOpacity!.value = opacity;
      this.fogMaterials[index]!.opacity = opacity;
    }
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
    if (this.sirenHead !== null) this.sirenHead.rotation.copy(this.sirenHeadBaseRotation);
    if (this.stagedEventId === 'ghosts') {
      this.ghostMaterial.opacity = 0.42;
      for (let index = 0; index < this.ghosts.length; index += 1) {
        const target = GHOST_FLIGHT_PATHS[index]!.start;
        const ghost = this.ghosts[index]!;
        this.poseGhost(ghost, index, target[0], target[1], target[2]);
        ghost.visible = false;
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
        const target = GHOST_FLIGHT_PATHS[index]!.end;
        const ghost = this.ghosts[index]!;
        this.poseGhost(ghost, index, target[0], target[1], target[2]);
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
