import {
  AnimationMixer,
  Box3,
  BufferGeometry,
  ConeGeometry,
  Group,
  LoopOnce,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { DEFAULT_WAVES } from '../ocean/WaveField';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import { EVENT_MODEL_SPECS } from '../world/eventModelManifest';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
} from './animationMath';
import { CHEST_DISPLAY_SCALE } from './ChestDisplay';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';
import {
  CHEST_DIG_END_SECONDS,
  CHEST_RESULT_DURATION_SECONDS,
  CHEST_SEARCH_END_SECONDS,
  MONSTER_ATTACK_END_SECONDS,
  MONSTER_IMPACT_SECONDS,
  MONSTER_RESULT_DURATION_SECONDS,
  MONSTER_SCAN_LEFT_END_SECONDS,
  MONSTER_SCAN_RIGHT_END_SECONDS,
  MONSTER_TURN_BACK_END_SECONDS,
  chestCompletedStrokes,
  chestStrokeProgress,
  monsterAttackProgress,
  monsterScanLeftProgress,
  monsterScanRightProgress,
  monsterTurnBackProgress,
} from './midnightTourChoreography';

type MidnightTourAnimationKind =
  | 'reveal'
  | 'choice-pass'
  | 'result-chest'
  | 'result-attack'
  | 'result-pass';

const REVEAL_DURATION = 1.25;
const PASS_DURATION = 1.15;
const CHEST_BURIED_CLEARANCE = 0.08;
const CHEST_CONTACT_PHASE = 0.55;
const CHEST_CAMERA_HEIGHT = 1.35;
const CHEST_CAMERA_DEPTH = 0.8;
const CHEST_LOCAL_DEPTH = -0.15;
const FPS_SHOVEL_X = 0.52;
const FPS_SHOVEL_Y = -0.42;
const FPS_SHOVEL_Z = -0.85;
const ISLAND_DISTANCE = 11.8;
const ISLAND_Z = -28;
const ISLAND_TOP_WAVE_CLEARANCE = 0.18;
const MONSTER_IDLE_CLIP = 'CharacterArmature|Idle';
const MONSTER_ATTACK_CLIP = 'CharacterArmature|Idle_Attack';
const MONSTER_LOOK_HEIGHT = EVENT_MODEL_SPECS.midnightMonster.normalizedBounds.min[1]
  + EVENT_MODEL_SPECS.midnightMonster.normalizedSize[1] * 0.92;
const MAXIMUM_WAVE_CREST = DEFAULT_WAVES.reduce(
  (height, wave) => height + wave.amplitude,
  0,
);
const IMPORTED_GREEN_TOP_Y = EVENT_MODEL_SPECS.midnightIsland.normalizedBounds.max[1];
const PALM_PLACEMENTS = [
  { nodeName: 'PalmTree_1', x: -2.6, z: -0.8, height: 3.9, rotationY: -0.35 },
  { nodeName: 'PalmTree_2', x: -1.25, z: 0.95, height: 3.2, rotationY: 0.22 },
  { nodeName: 'PalmTree_3', x: 0, z: -1.15, height: 4.1, rotationY: -0.12 },
  { nodeName: 'PalmTree_4', x: 1.65, z: 1.1, height: 3.4, rotationY: 0.42 },
  { nodeName: 'PalmTree_5', x: 2.85, z: -0.65, height: 3.8, rotationY: -0.28 },
] as const;

function createMaterial(
  color: number,
  roughness: number,
  metalness = 0,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
}

export class MidnightTourPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly island = new Group();
  private readonly resultActors = new Group();
  private readonly staticGeometries = new Set<BufferGeometry>();
  private readonly staticMaterials = new Set<Material>();
  private readonly resultGeometries = new Set<BufferGeometry>();
  private readonly resultMaterials = new Set<Material>();
  private readonly shovelGeometries = new Set<BufferGeometry>();
  private readonly shovelMaterials = new Set<Material>();
  private readonly islandBase = new Vector3();
  private readonly islandBehind = new Vector3();
  private readonly islandStart = new Vector3();
  private readonly chestEnd = new Vector3();
  private readonly monsterAttackStart = new Vector3();
  private readonly monsterAttackEnd = new Vector3();
  private cameraParent: Object3D | null = null;
  private readonly cameraPosition = new Vector3();
  private readonly cameraQuaternion = new Quaternion();
  private readonly cutsceneCameraPosition = new Vector3();
  private readonly cutsceneLookTarget = new Vector3();
  private readonly lookMatrix = new Matrix4();
  private readonly chestBounds = new Box3();
  private readonly animation: TimedPresentationAnimation<MidnightTourAnimationKind>;
  private activeActor: Group | null = null;
  private monsterMixer: AnimationMixer | null = null;
  private monsterIdleAction: AnimationAction | null = null;
  private monsterAttackAction: AnimationAction | null = null;
  private monsterIdleClip: AnimationClip | null = null;
  private monsterAttackClip: AnimationClip | null = null;
  private shovelHolder: Group | null = null;
  private shovelModel: Group | null = null;
  private side: EventSide = -1;
  private greenTopLocalY = 0;
  private cameraCaptured = false;
  private searchLeftMarked = false;
  private searchRightMarked = false;
  private resultRevealMarked = false;
  private cameraKickMarked = false;
  private monsterIdleStopped = false;
  private monsterAttackStarted = false;
  private activeResultTimeline = false;
  private heldResultKind: 'result-chest' | 'result-attack' | null = null;
  private digCueEmitted = false;
  private digContacts = 0;
  private chestBuriedY = 0;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.animation = new TimedPresentationAnimation<MidnightTourAnimationKind>(
      (kind, _time, progress) => this.applyAnimation(kind, progress),
      (kind) => this.finishAnimation(kind),
    );
    this.root.name = 'focused-event:midnight-tour';
    this.root.visible = false;
    this.root.userData.motionSource = 'fixed';
    this.root.userData.approachBeats = 0;
    this.root.userData.searchLeft = 0;
    this.root.userData.searchRight = 0;
    this.root.userData.resultReveals = 0;
    this.root.userData.cameraKicks = 0;
    this.root.userData.digContacts = 0;

    this.validateRequiredResultModels();
    this.island.name = 'midnight-tour-island';
    this.island.userData.motionSource = 'fixed';
    this.buildIsland();
    this.setSidePositions();
    this.island.position.copy(this.islandBase);
    this.updateGreenTopClearance();
    this.root.add(this.island);

    this.resultActors.name = 'midnight-tour-result-actors';
    this.root.add(this.resultActors);
    collectMeshResources(this.root, this.staticGeometries, this.staticMaterials);
  }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.restoreCamera();
    this.clearResultActors();
    this.activeResultTimeline = false;
    this.side = eventSideFromSeed(variantSeed);
    this.setSidePositions();
    this.staged = true;
    this.root.visible = true;
    this.island.visible = true;
    this.island.position.copy(this.islandBase);
    this.island.rotation.set(0, 0.08 * this.side, 0);
    this.updateGreenTopClearance();
    this.root.userData.state = 'staged';
    this.root.userData.approachBeats = 0;
    this.resetResultCounters();
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    this.animation.settle();
    const animation = this.animation.start('reveal', REVEAL_DURATION);
    this.applyAnimation('reveal', 0);
    return animation;
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.activeResultTimeline = false;
    switch (choice.choiceId) {
      case 'sleep': {
        this.animation.settle();
        this.restoreCamera();
        this.islandStart.copy(this.island.position);
        this.root.userData.state = 'sailing-on';
        const animation = this.animation.start('choice-pass', PASS_DURATION);
        this.applyAnimation('choice-pass', 0);
        return animation;
      }
      case 'visit': {
        this.animation.settle();
        this.prepareCutsceneCamera();
        this.root.userData.approachBeats = 1;
        this.root.userData.state = 'choice-visited';
        return Promise.resolve();
      }
      default:
        throw new Error(`Unsupported Midnight Tour choice: ${choice.choiceId}`);
    }
  }

  react(result: EventResultPresentation, outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'midnight-tour') {
      throw new Error(`Midnight Tour received result for ${result.eventId}.`);
    }
    void outcome;
    if (this.activeResultTimeline) this.animation.cancel();
    else this.animation.settle();
    this.clearResultActors();
    this.activeResultTimeline = false;
    switch (result.resultId) {
      case 'tour-chest': {
        this.prepareCutsceneCamera();
        this.resetResultCounters();
        this.activeActor = this.createChestReward();
        this.prepareChestCamera();
        this.createShovel();
        this.root.userData.state = 'chest-result';
        this.activeResultTimeline = true;
        const animation = this.animation.start(
          'result-chest',
          CHEST_RESULT_DURATION_SECONDS,
        );
        this.applyAnimation('result-chest', 0);
        return animation;
      }
      case 'tour-attack': {
        this.prepareCutsceneCamera();
        this.resetResultCounters();
        this.activeActor = this.createMonster();
        this.root.userData.state = 'attack-result';
        this.activeResultTimeline = true;
        const animation = this.animation.start(
          'result-attack',
          MONSTER_RESULT_DURATION_SECONDS,
        );
        this.applyAnimation('result-attack', 0);
        return animation;
      }
      case 'tour-pass': {
        this.restoreCamera();
        this.islandStart.copy(this.island.position);
        this.root.userData.state = 'pass-result';
        this.activeResultTimeline = true;
        const animation = this.animation.start('result-pass', PASS_DURATION * 0.55);
        this.applyAnimation('result-pass', 0);
        return animation;
      }
      default:
        throw new Error(`Unsupported Midnight Tour result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeResultTimeline = false;
    this.clearResultActors();
    this.restoreCamera();
    this.island.position.copy(this.islandBase);
    this.island.rotation.set(0, 0.08 * this.side, 0);
    this.island.visible = false;
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    if (this.activeActor !== null && this.monsterMixer !== null) {
      this.monsterMixer.update(delta);
    }
    this.animation.update(time, delta);
    if (this.heldResultKind !== null) {
      this.applyAnimation(this.heldResultKind, 1);
    } else if (this.cameraCaptured && !this.activeResultTimeline) {
      this.applyCameraPose(
        this.cutsceneLookTarget.x,
        this.cutsceneLookTarget.y,
        this.cutsceneLookTarget.z,
        0,
      );
    }
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    if (this.activeResultTimeline || this.heldResultKind !== null) return;
    this.animation.settle();
    this.restoreCamera();
  }

  interactionTargets(): readonly FocusedEventInteractionTarget[] {
    return [{
      id: 'midnight-tour:island',
      label: 'ISLAND',
      description: 'Turn the boat toward the small island.',
      choiceId: 'visit',
      root: this.island,
      minimumHitWidth: 96,
      minimumHitHeight: 78,
    }];
  }

  dispose(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeResultTimeline = false;
    this.restoreCamera();
    this.clearResultActors();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeResourceSets(this.staticGeometries, this.staticMaterials);
  }

  private applyAnimation(kind: MidnightTourAnimationKind, progress: number): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-pass':
      case 'result-pass':
        this.applyPass(normalized);
        break;
      case 'result-chest':
        this.applyChestResult(normalized * CHEST_RESULT_DURATION_SECONDS);
        break;
      case 'result-attack':
        this.applyAttackResult(normalized * MONSTER_RESULT_DURATION_SECONDS);
        break;
    }
  }

  private finishAnimation(kind: MidnightTourAnimationKind): void {
    this.applyAnimation(kind, 1);
    switch (kind) {
      case 'reveal':
        this.root.userData.state = 'revealed';
        break;
      case 'choice-pass':
        this.root.userData.state = 'choice-passed';
        break;
      case 'result-chest':
        this.root.userData.state = 'held-chest';
        this.activeResultTimeline = false;
        this.heldResultKind = 'result-chest';
        break;
      case 'result-attack':
        this.root.userData.state = 'held-attack';
        this.activeResultTimeline = false;
        this.heldResultKind = 'result-attack';
        break;
      case 'result-pass':
        this.root.userData.state = 'held-pass';
        this.activeResultTimeline = false;
        break;
    }
  }

  private applyReveal(progress: number): void {
    this.island.rotation.y = 0.08 * this.side
      - this.side * Math.sin(progress * Math.PI) * 0.035;
    this.island.userData.revealProgress = progress;
  }

  private applyPass(progress: number): void {
    const travel = smoothstep(progress);
    this.island.position.lerpVectors(this.islandStart, this.islandBehind, travel);
    this.island.rotation.y = 0.08 * this.side - this.side * travel * 0.2;
  }

  private applyChestResult(elapsedSeconds: number): void {
    const chest = this.activeActor;
    if (chest === null) return;
    this.markResultReveal(chest);

    let targetX = this.chestEnd.x;
    let targetY = this.chestEnd.y + 0.25;
    const targetZ = this.chestEnd.z;

    if (elapsedSeconds < CHEST_SEARCH_END_SECONDS) {
      const searchProgress = elapsedSeconds / CHEST_SEARCH_END_SECONDS;
      if (searchProgress < 0.4) {
        const turn = smoothstep(searchProgress / 0.4);
        targetX = this.islandBase.x + 0.65 - 1.45 * turn;
        targetY = this.islandBase.y + this.greenTopLocalY + 1
          - Math.sin(turn * Math.PI) * 0.08;
      } else if (searchProgress < 0.8) {
        this.markSearchLeft();
        const turn = smoothstep((searchProgress - 0.4) / 0.4);
        targetX = this.islandBase.x + 0.65 - 1.45 + 2.9 * turn;
        targetY = this.islandBase.y + this.greenTopLocalY + 1
          - Math.sin(turn * Math.PI) * 0.07;
      } else {
        this.markSearchLeft();
        this.markSearchRight();
        const turn = smoothstep((searchProgress - 0.8) / 0.2);
        const searchX = this.islandBase.x + 2.1;
        const searchY = this.islandBase.y + this.greenTopLocalY + 1;
        targetX = searchX + (this.chestEnd.x - searchX) * turn;
        targetY = searchY + (this.chestEnd.y + 0.25 - searchY) * turn;
      }
    } else {
      this.markSearchLeft();
      this.markSearchRight();
      this.markDigStart();
      this.applyChestExcavation(elapsedSeconds, chest);
      if (elapsedSeconds < CHEST_DIG_END_SECONDS) {
        this.attachAndAnimateShovel(elapsedSeconds);
      } else {
        this.disposeShovel();
      }
    }
    this.applyCameraPose(targetX, targetY, targetZ, 0);
  }

  private applyChestExcavation(elapsedSeconds: number, chest: Group): void {
    const completed = chestCompletedStrokes(elapsedSeconds);
    this.markDigContacts(completed);
    let raisedStrokes = completed;
    if (completed < 3) {
      const stroke = chestStrokeProgress(elapsedSeconds);
      raisedStrokes += smoothstep(
        clamp01((stroke - CHEST_CONTACT_PHASE) / (1 - CHEST_CONTACT_PHASE)),
      );
    }
    const raised = raisedStrokes / 3;
    chest.position.y = this.chestBuriedY
      + (this.chestEnd.y - this.chestBuriedY) * raised;
  }

  private attachAndAnimateShovel(elapsedSeconds: number): void {
    const holder = this.shovelHolder;
    const shovel = this.shovelModel;
    if (holder === null || shovel === null) return;
    const camera = this.dependencies.camera;
    if (holder.parent !== camera) camera.add(holder);
    const stroke = chestStrokeProgress(elapsedSeconds);
    const strike = stroke < CHEST_CONTACT_PHASE
      ? smoothstep(stroke / CHEST_CONTACT_PHASE)
      : 1 - smoothstep(
        (stroke - CHEST_CONTACT_PHASE) / (1 - CHEST_CONTACT_PHASE),
      );
    shovel.position.y = -0.18 * strike;
    shovel.rotation.x = -0.2 + 0.85 * strike;
    shovel.rotation.z = -0.36 - 0.12 * strike;
  }

  private applyAttackResult(elapsedSeconds: number): void {
    const actor = this.activeActor;
    if (actor === null) return;
    const centerX = this.islandBase.x + 0.65;
    const leftX = this.islandBase.x - 2.1;
    const rightX = this.islandBase.x + 2.1;
    let targetX = centerX;
    let targetY = this.islandBase.y + this.greenTopLocalY + 1;
    let targetZ = this.islandBase.z + 0.15;
    let recoil = 0;

    if (elapsedSeconds < MONSTER_SCAN_LEFT_END_SECONDS) {
      const scan = smoothstep(monsterScanLeftProgress(elapsedSeconds));
      actor.position.copy(this.monsterAttackStart);
      targetX = centerX + (leftX - centerX) * scan;
    } else if (elapsedSeconds < MONSTER_SCAN_RIGHT_END_SECONDS) {
      this.markSearchLeft();
      const scan = smoothstep(monsterScanRightProgress(elapsedSeconds));
      actor.position.copy(this.monsterAttackStart);
      targetX = leftX + (rightX - leftX) * scan;
    } else if (elapsedSeconds < MONSTER_TURN_BACK_END_SECONDS) {
      this.markSearchLeft();
      this.markSearchRight();
      const turn = smoothstep(monsterTurnBackProgress(elapsedSeconds));
      actor.position.copy(this.monsterAttackStart);
      targetX = rightX + (actor.position.x - rightX) * turn;
      targetY = actor.position.y + MONSTER_LOOK_HEIGHT;
      targetZ += (actor.position.z - targetZ) * turn;
      if (turn > 0.5) this.markResultReveal(actor);
    } else if (elapsedSeconds < MONSTER_ATTACK_END_SECONDS) {
      this.prepareMonsterAttack();
      this.markSearchLeft();
      this.markSearchRight();
      this.markResultReveal(actor);
      const attack = smoothstep(monsterAttackProgress(elapsedSeconds));
      actor.position.lerpVectors(
        this.monsterAttackStart,
        this.monsterAttackEnd,
        attack,
      );
      actor.rotation.x = -0.16 * attack;
      actor.rotation.z = this.side * Math.sin(attack * Math.PI) * 0.08;
      targetX = actor.position.x;
      targetY = actor.position.y + MONSTER_LOOK_HEIGHT;
      targetZ = actor.position.z;
      recoil = -Math.sin(attack * Math.PI) * 0.18;
      if (elapsedSeconds >= MONSTER_IMPACT_SECONDS) this.markCameraKick();
    } else {
      this.prepareMonsterAttack();
      this.markSearchLeft();
      this.markSearchRight();
      this.markResultReveal(actor);
      actor.position.copy(this.monsterAttackEnd);
      actor.rotation.x = -0.16;
      actor.rotation.z = 0;
      targetX = actor.position.x;
      targetY = actor.position.y + MONSTER_LOOK_HEIGHT;
      targetZ = actor.position.z;
      this.markCameraKick();
    }
    this.faceMonsterAlongPath(actor);
    this.applyCameraPose(
      targetX,
      targetY,
      targetZ,
      recoil,
    );
  }

  private faceMonsterAlongPath(actor: Group): void {
    actor.rotation.y = Math.atan2(
      this.monsterAttackEnd.x - this.monsterAttackStart.x,
      this.monsterAttackEnd.z - this.monsterAttackStart.z,
    );
  }

  private applyCameraPose(
    targetX: number,
    targetY: number,
    targetZ: number,
    recoil: number,
    drop = 0,
    roll = 0,
    pitch = 0,
  ): void {
    if (!this.cameraCaptured) return;
    const camera = this.dependencies.camera;
    camera.position.copy(this.cutsceneCameraPosition);
    camera.position.z += recoil;
    camera.position.y -= drop;
    this.cutsceneLookTarget.set(targetX, targetY, targetZ);
    this.lookMatrix.lookAt(camera.position, this.cutsceneLookTarget, camera.up);
    camera.quaternion.setFromRotationMatrix(this.lookMatrix);
    camera.rotateX(pitch);
    camera.rotateZ(roll);
  }

  private prepareCutsceneCamera(): void {
    this.restoreCamera();
    const camera = this.dependencies.camera;
    this.cameraParent = camera.parent;
    this.cameraPosition.copy(camera.position);
    this.cameraQuaternion.copy(camera.quaternion);
    this.cameraCaptured = true;
    this.root.add(camera);
    this.cutsceneCameraPosition.set(
      this.islandBase.x,
      this.islandBase.y + this.greenTopLocalY + 1.45,
      this.islandBase.z + 2.4,
    );
    this.cutsceneLookTarget.set(
      this.islandBase.x + 0.65,
      this.islandBase.y + this.greenTopLocalY + 1.0,
      this.islandBase.z + 0.15,
    );
    this.applyCameraPose(
      this.cutsceneLookTarget.x,
      this.cutsceneLookTarget.y,
      this.cutsceneLookTarget.z,
      0,
    );
  }

  private restoreCamera(): void {
    if (!this.cameraCaptured) return;
    const camera = this.dependencies.camera;
    if (this.cameraParent === null) camera.removeFromParent();
    else this.cameraParent.add(camera);
    camera.position.copy(this.cameraPosition);
    camera.quaternion.copy(this.cameraQuaternion);
    this.cameraParent = null;
    this.cameraCaptured = false;
  }

  private validateRequiredResultModels(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    try {
      const chest = this.dependencies.propModels.createEventModel('chestClosed');
      if (chest === null) {
        throw new Error('Missing required Midnight Tour chest model.');
      }
      collectMeshResources(chest.root, geometries, materials);

      const shovel = this.dependencies.propModels.createEventModel('midnightShovel');
      if (shovel === null) {
        throw new Error('Missing required Midnight Tour shovel model.');
      }
      collectMeshResources(shovel.root, geometries, materials);

      const monster = this.dependencies.propModels.createEventModel('midnightMonster');
      if (monster === null) {
        throw new Error('Missing required Midnight Tour monster model.');
      }
      collectMeshResources(monster.root, geometries, materials);
      if (!monster.animations.some(({ name }) => name === MONSTER_IDLE_CLIP)) {
        throw new Error(`Missing required Midnight Tour monster clip: ${MONSTER_IDLE_CLIP}.`);
      }
      if (!monster.animations.some(({ name }) => name === MONSTER_ATTACK_CLIP)) {
        throw new Error(`Missing required Midnight Tour monster clip: ${MONSTER_ATTACK_CLIP}.`);
      }
    } finally {
      disposeResourceSets(geometries, materials);
    }
  }

  private buildIsland(): void {
    const palms = this.dependencies.propModels.createEventModel('midnightPalmTrees');
    if (palms === null) throw new Error('Missing required Midnight Tour palm model.');
    const islandModel = this.dependencies.propModels.createEventModel('midnightIsland');
    if (islandModel === null) {
      const earth = createMaterial(0x343b38, 1);
      const fallback = new Mesh(new ConeGeometry(5.2, 3.4, 7), earth);
      fallback.name = 'midnight-tour-island-fallback';
      fallback.position.y = 0.45;
      fallback.scale.z = 0.72;
      this.island.add(fallback);
      this.greenTopLocalY = 2.15;
      this.island.userData.islandModel = 'procedural';
    } else {
      islandModel.root.name = 'event-model:midnightIsland';
      islandModel.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (material instanceof MeshStandardMaterial) {
            material.color.offsetHSL(0, -0.08, 0.08);
          }
        }
      });
      this.island.add(islandModel.root);
      this.greenTopLocalY = IMPORTED_GREEN_TOP_Y;
      this.island.userData.islandModel = 'imported';
    }
    this.island.userData.greenTopLocalY = this.greenTopLocalY;

    this.placePalms(palms.root);

    const shoreLight = new PointLight(0xe2a45e, 2.2, 24, 1.1);
    shoreLight.name = 'midnight-tour-shore-light';
    shoreLight.position.set(-1, 3, 6);
    this.island.add(shoreLight);
    const moonFill = new PointLight(0x91b5c1, 1.4, 30, 1.05);
    moonFill.name = 'midnight-tour-moon-fill';
    moonFill.position.set(1, 5, 7);
    this.island.add(moonFill);
  }

  private placePalms(sourceRoot: Object3D): void {
    const palmNodes = PALM_PLACEMENTS.map((placement) => {
      const palm = sourceRoot.getObjectByName(placement.nodeName);
      if (palm === undefined) {
        throw new Error(`Missing required Midnight Tour palm tree: ${placement.nodeName}.`);
      }
      return palm;
    });
    const bounds = new Box3();
    const center = new Vector3();

    this.island.add(sourceRoot);
    sourceRoot.updateMatrixWorld(true);
    PALM_PLACEMENTS.forEach((placement, index) => {
      const sourcePalm = palmNodes[index];
      if (sourcePalm === undefined) {
        throw new Error(`Missing required Midnight Tour palm tree: ${placement.nodeName}.`);
      }
      const palm = new Group();
      const content = new Group();
      palm.name = `midnight-tour-palm-${index + 1}`;
      palm.add(content);
      this.island.add(palm);
      content.attach(sourcePalm);

      bounds.setFromObject(content);
      bounds.getCenter(center);
      const sourceHeight = bounds.max.y - bounds.min.y;
      if (sourceHeight <= 0) {
        throw new Error(`Invalid Midnight Tour palm tree: ${placement.nodeName}.`);
      }
      content.position.set(-center.x, -bounds.min.y, -center.z);
      palm.position.set(placement.x, this.greenTopLocalY, placement.z);
      palm.rotation.y = placement.rotationY;
      palm.scale.setScalar(placement.height / sourceHeight);
    });
    sourceRoot.removeFromParent();
  }

  private setSidePositions(): void {
    const islandX = ISLAND_DISTANCE * this.side;
    const islandY = MAXIMUM_WAVE_CREST + ISLAND_TOP_WAVE_CLEARANCE
      - this.greenTopLocalY;
    this.islandBase.set(islandX, islandY, ISLAND_Z);
    this.islandBehind.set(-4.6 * this.side, islandY, 10.5);
    this.chestEnd.set(
      this.islandBase.x + 0.75,
      this.islandBase.y + this.greenTopLocalY + 0.2,
      this.islandBase.z + CHEST_LOCAL_DEPTH,
    );
    const islandTop = this.islandBase.y + this.greenTopLocalY;
    this.monsterAttackStart.set(
      this.islandBase.x + 0.05,
      islandTop,
      this.islandBase.z + 3.55,
    );
    this.monsterAttackEnd.set(
      this.islandBase.x + 0.05,
      islandTop + 0.08,
      this.islandBase.z + 3.25,
    );
  }

  private updateGreenTopClearance(): void {
    this.island.userData.greenTopWaveClearance = this.islandBase.y
      + this.greenTopLocalY - MAXIMUM_WAVE_CREST;
  }

  private resetResultCounters(): void {
    this.searchLeftMarked = false;
    this.searchRightMarked = false;
    this.resultRevealMarked = false;
    this.cameraKickMarked = false;
    this.monsterIdleStopped = false;
    this.monsterAttackStarted = false;
    this.digCueEmitted = false;
    this.digContacts = 0;
    this.root.userData.searchLeft = 0;
    this.root.userData.searchRight = 0;
    this.root.userData.resultReveals = 0;
    this.root.userData.cameraKicks = 0;
    this.root.userData.digContacts = 0;
  }

  private markSearchLeft(): void {
    if (this.searchLeftMarked) return;
    this.searchLeftMarked = true;
    this.root.userData.searchLeft += 1;
  }

  private markSearchRight(): void {
    if (this.searchRightMarked) return;
    this.searchRightMarked = true;
    this.root.userData.searchRight += 1;
  }

  private markResultReveal(actor: Group): void {
    if (this.resultRevealMarked) return;
    this.resultRevealMarked = true;
    actor.visible = true;
    this.root.userData.resultReveals += 1;
  }

  private markCameraKick(): void {
    if (this.cameraKickMarked) return;
    this.cameraKickMarked = true;
    this.root.userData.cameraKicks += 1;
  }

  private prepareMonsterAttack(): void {
    if (!this.monsterIdleStopped) {
      this.monsterIdleStopped = true;
      this.monsterIdleAction?.stop();
    }
    if (this.monsterAttackStarted) return;
    this.monsterAttackStarted = true;
    this.monsterAttackAction?.reset().play();
    this.dependencies.emitCue({
      eventId: 'midnight-tour',
      cue: 'attack',
    });
  }

  private markDigStart(): void {
    if (this.digCueEmitted) return;
    this.digCueEmitted = true;
    this.dependencies.emitCue({
      eventId: 'midnight-tour',
      cue: 'dig-start',
    });
  }

  private markDigContacts(completed: number): void {
    if (completed <= this.digContacts) return;
    this.digContacts = completed;
    this.root.userData.digContacts = completed;
  }

  private createChestReward(): Group {
    const actor = new Group();
    actor.name = 'midnight-tour-reward-chest';
    const selected = this.dependencies.propModels.createEventModel('chestClosed');
    if (selected === null) {
      throw new Error('Missing required Midnight Tour chest model.');
    }
    selected.root.name = 'event-model:chestClosed';
    actor.add(selected.root);
    actor.userData.model = 'imported';
    actor.scale.setScalar(0.9 * CHEST_DISPLAY_SCALE);
    actor.visible = true;
    actor.position.set(0, 0, 0);
    actor.updateMatrixWorld(true);
    this.chestBounds.setFromObject(actor);
    const islandTop = this.islandBase.y + this.greenTopLocalY;
    this.chestEnd.y = islandTop - this.chestBounds.min.y;
    this.chestBuriedY = islandTop - this.chestBounds.max.y
      - CHEST_BURIED_CLEARANCE;
    actor.position.copy(this.chestEnd);
    actor.position.y = this.chestBuriedY;
    this.addResultActor(actor);
    return actor;
  }

  private prepareChestCamera(): void {
    this.cutsceneCameraPosition.set(
      this.islandBase.x,
      this.islandBase.y + this.greenTopLocalY + CHEST_CAMERA_HEIGHT,
      this.islandBase.z + CHEST_CAMERA_DEPTH,
    );
    this.applyCameraPose(
      this.chestEnd.x,
      this.chestEnd.y + 0.25,
      this.chestEnd.z,
      0,
    );
  }

  private createShovel(): void {
    const selected = this.dependencies.propModels.createEventModel('midnightShovel');
    if (selected === null) {
      throw new Error('Missing required Midnight Tour shovel model.');
    }
    const holder = new Group();
    holder.name = 'midnight-tour-fps-shovel';
    holder.position.set(FPS_SHOVEL_X, FPS_SHOVEL_Y, FPS_SHOVEL_Z);
    selected.root.name = 'event-model:midnightShovel';
    selected.root.rotation.set(-0.2, 0, -0.36);
    holder.add(selected.root);
    collectMeshResources(
      holder,
      this.shovelGeometries,
      this.shovelMaterials,
    );
    this.shovelHolder = holder;
    this.shovelModel = selected.root;
  }

  private disposeShovel(): void {
    const holder = this.shovelHolder;
    if (holder === null) return;
    holder.removeFromParent();
    this.shovelHolder = null;
    this.shovelModel = null;
    disposeResourceSets(this.shovelGeometries, this.shovelMaterials);
  }

  private createMonster(): Group {
    const selected = this.dependencies.propModels.createEventModel('midnightMonster');
    if (selected === null) {
      throw new Error('Missing required Midnight Tour monster model.');
    }
    const idleClip = selected.animations.find(
      ({ name }) => name === MONSTER_IDLE_CLIP,
    );
    const attackClip = selected.animations.find(
      ({ name }) => name === MONSTER_ATTACK_CLIP,
    );
    if (idleClip === undefined) {
      collectMeshResources(
        selected.root,
        this.resultGeometries,
        this.resultMaterials,
      );
      disposeResourceSets(this.resultGeometries, this.resultMaterials);
      throw new Error(`Missing required Midnight Tour monster clip: ${MONSTER_IDLE_CLIP}.`);
    }
    if (attackClip === undefined) {
      collectMeshResources(
        selected.root,
        this.resultGeometries,
        this.resultMaterials,
      );
      disposeResourceSets(this.resultGeometries, this.resultMaterials);
      throw new Error(`Missing required Midnight Tour monster clip: ${MONSTER_ATTACK_CLIP}.`);
    }

    const actor = selected.root;
    actor.name = 'midnight-tour-monster';
    actor.userData.model = 'imported';
    actor.position.copy(this.monsterAttackStart);
    actor.visible = true;
    this.addResultActor(actor);

    const mixer = new AnimationMixer(actor);
    const idleAction = mixer.clipAction(idleClip);
    const attackAction = mixer.clipAction(attackClip);
    attackAction.setLoop(LoopOnce, 1);
    attackAction.clampWhenFinished = true;
    this.monsterMixer = mixer;
    this.monsterIdleAction = idleAction;
    this.monsterAttackAction = attackAction;
    this.monsterIdleClip = idleClip;
    this.monsterAttackClip = attackClip;
    idleAction.reset().play();
    return actor;
  }

  private addResultActor(actor: Group): void {
    this.resultActors.add(actor);
    collectMeshResources(actor, this.resultGeometries, this.resultMaterials);
  }

  private clearResultActors(): void {
    this.heldResultKind = null;
    this.disposeShovel();
    this.disposeMonsterAnimation();
    this.activeActor = null;
    this.resultActors.clear();
    disposeResourceSets(this.resultGeometries, this.resultMaterials);
  }

  private disposeMonsterAnimation(): void {
    const mixer = this.monsterMixer;
    if (mixer === null) return;
    if (!this.monsterIdleStopped) {
      this.monsterIdleStopped = true;
      this.monsterIdleAction?.stop();
    }
    this.monsterAttackAction?.stop();
    const actor = this.activeActor;
    if (actor !== null) {
      if (this.monsterIdleClip !== null) {
        mixer.uncacheAction(this.monsterIdleClip, actor);
      }
      if (this.monsterAttackClip !== null) {
        mixer.uncacheAction(this.monsterAttackClip, actor);
      }
      mixer.uncacheRoot(actor);
    }
    this.monsterMixer = null;
    this.monsterIdleAction = null;
    this.monsterAttackAction = null;
    this.monsterIdleClip = null;
    this.monsterAttackClip = null;
    this.monsterAttackStarted = false;
  }
}
