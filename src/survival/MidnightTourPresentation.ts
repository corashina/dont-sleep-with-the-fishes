import { presentationUiText } from '../i18n/presentationUiMessages';
import {
  AnimationMixer,
  Box3,
  BufferGeometry,
  CylinderGeometry,
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
import { MidnightShovelAnimation } from './MidnightShovelAnimation';
import { CAMP_RESULT_DURATION_SECONDS, MidnightCampPresentation } from './MidnightCampPresentation';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';
import {
  CHEST_RESULT_DURATION_SECONDS,
  CHEST_SEARCH_END_SECONDS,
  MONSTER_BITE_START_SECONDS,
  MONSTER_HIT_CLIP_PHASE,
  MONSTER_IMPACT_SECONDS,
  MONSTER_RESULT_DURATION_SECONDS,
  MONSTER_SCAN_LEFT_END_SECONDS,
  MONSTER_SCAN_RIGHT_END_SECONDS,
  MONSTER_TURN_BACK_END_SECONDS,
  monsterScanLeftProgress,
  monsterScanRightProgress,
  monsterTurnBackProgress,
} from './midnightTourChoreography';

type MidnightTourAnimationKind =
  | 'reveal'
  | 'choice-pass'
  | 'result-chest'
  | 'result-camp'
  | 'result-attack'
  | 'result-pass';

const REVEAL_DURATION = 1.25;
const PASS_DURATION = 1.15;
const CHEST_BURIED_CLEARANCE = 0.08;
const CHEST_CAMERA_HEIGHT = 1.35;
const CHEST_CAMERA_DEPTH = 0.8;
const CHEST_LOCAL_DEPTH = -0.15;
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
  private readonly islandLookTarget = new Group();
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
  private readonly monsterPosition = new Vector3();
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
  private shovelAnimation: MidnightShovelAnimation | null = null;
  private camp: MidnightCampPresentation | null = null;
  private readonly digOrigin = new Vector3();
  private readonly scanQuaternion = new Quaternion();
  private readonly attackQuaternion = new Quaternion();
  private dirtPile: Group | null = null;
  private side: EventSide = -1;
  private greenTopLocalY = 0;
  private cameraCaptured = false;
  private searchLeftMarked = false;
  private searchRightMarked = false;
  private resultRevealMarked = false;
  private cameraKickMarked = false;
  private activeResultTimeline = false;
  private heldResultKind: 'result-chest' | 'result-camp' | 'result-attack' | null = null;
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
      case 'tour-camp-backpack':
      case 'tour-camp': {
        this.prepareCutsceneCamera();
        this.resetResultCounters();
        this.camp = new MidnightCampPresentation(this.dependencies.propModels);
        this.camp.root.position.set(
          this.islandBase.x - 0.95,
          this.islandBase.y + this.greenTopLocalY,
          this.islandBase.z + 1.8,
        );
        this.activeActor = this.camp.root;
        this.addResultActor(this.camp.root);
        this.root.userData.state = 'camp-result';
        this.activeResultTimeline = true;
        const animation = this.animation.start('result-camp', CAMP_RESULT_DURATION_SECONDS);
        this.applyAnimation('result-camp', 0);
        return animation;
      }
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
    this.animation.update(time, delta);
    this.camp?.update(time);
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
      get label() { return presentationUiText('island'); },
      get description() { return presentationUiText('islandDescription'); },
      choiceId: 'visit',
      root: this.island,
      minimumHitWidth: 96,
      minimumHitHeight: 78,
    }];
  }

  itemAimTarget(): Object3D {
    return this.islandLookTarget;
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
      case 'result-camp':
        this.applyCampResult(normalized);
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
      case 'result-camp':
        this.root.userData.state = 'held-camp';
        this.activeResultTimeline = false;
        this.heldResultKind = 'result-camp';
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
    this.shovelAnimation?.update(elapsedSeconds);

    let targetX = this.chestEnd.x;
    let targetY = this.chestEnd.y + 0.25;
    let targetZ = this.chestEnd.z;
    const approach = smoothstep(clamp01(elapsedSeconds / CHEST_SEARCH_END_SECONDS));
    this.cutsceneCameraPosition.y = this.islandBase.y + this.greenTopLocalY
      + 1.45 + (CHEST_CAMERA_HEIGHT - 1.45) * approach;
    this.cutsceneCameraPosition.z = this.islandBase.z
      + 2.4 + (CHEST_CAMERA_DEPTH - 2.4) * approach;

    if (elapsedSeconds < CHEST_SEARCH_END_SECONDS) {
      const searchProgress = elapsedSeconds / CHEST_SEARCH_END_SECONDS;
      targetZ = this.islandBase.z + 0.15;
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
        targetZ += (this.chestEnd.z - targetZ) * turn;
      }
    } else {
      this.markSearchLeft();
      this.markSearchRight();
      this.markDigStart();
      this.applyChestExcavation(chest);
    }
    const impact = this.shovelAnimation?.pose.impact ?? 0;
    this.applyCameraPose(targetX, targetY, targetZ, 0, impact * 0.018, 0, impact * 0.009);
  }

  private applyChestExcavation(chest: Group): void {
    const pose = this.shovelAnimation?.pose;
    if (pose === undefined) return;
    this.markDigContacts(pose.contacts);
    chest.position.y = this.chestBuriedY
      + (this.chestEnd.y - this.chestBuriedY) * pose.excavation;
    this.dirtPile?.scale.set(1, 0.25 + 0.75 * pose.deposit, 1);
  }

  private applyCampResult(progress: number): void {
    if (this.camp === null) return;
    this.markResultReveal(this.camp.root);
    const approach = smoothstep(clamp01(progress / 0.45));
    this.cutsceneCameraPosition.x = this.islandBase.x - approach * 0.95;
    this.cutsceneCameraPosition.z = this.islandBase.z + 2.4 + approach * 2;
    this.applyCameraPose(
      this.islandBase.x + 0.65 - approach * 1.6,
      this.camp.root.position.y + 1 - approach * 0.75,
      this.islandBase.z + 0.15 + approach * 1.65,
      0,
    );
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
    this.sampleMonsterPose(elapsedSeconds);
    actor.position.copy(this.monsterPosition);
    actor.rotation.y = Math.PI;

    if (elapsedSeconds < MONSTER_SCAN_LEFT_END_SECONDS) {
      const scan = smoothstep(monsterScanLeftProgress(elapsedSeconds));
      targetX = centerX + (leftX - centerX) * scan;
    } else if (elapsedSeconds < MONSTER_SCAN_RIGHT_END_SECONDS) {
      this.markSearchLeft();
      const scan = smoothstep(monsterScanRightProgress(elapsedSeconds));
      targetX = leftX + (rightX - leftX) * scan;
    } else if (elapsedSeconds < MONSTER_TURN_BACK_END_SECONDS) {
      this.markSearchLeft();
      this.markSearchRight();
      const turn = smoothstep(monsterTurnBackProgress(elapsedSeconds));
      if (turn > 0.5) this.markResultReveal(actor);
      this.applyMonsterTurn(actor, turn);
      return;
    } else {
      this.markSearchLeft();
      this.markSearchRight();
      this.markResultReveal(actor);
      targetX = actor.position.x;
      targetY = actor.position.y + MONSTER_LOOK_HEIGHT;
      targetZ = actor.position.z;
      if (elapsedSeconds >= MONSTER_IMPACT_SECONDS) this.markCameraKick();
    }
    const recoil = smoothstep(clamp01((elapsedSeconds - MONSTER_IMPACT_SECONDS) / 0.14));
    this.applyCameraPose(targetX, targetY, targetZ, -0.12 * recoil,
      0.045 * recoil, this.side * 0.035 * recoil, -0.035 * recoil);
  }

  private applyMonsterTurn(actor: Group, progress: number): void {
    this.applyCameraPose(this.islandBase.x + 2.1,
      this.islandBase.y + this.greenTopLocalY + 1, this.islandBase.z + 0.15, 0);
    this.scanQuaternion.copy(this.dependencies.camera.quaternion);
    this.applyCameraPose(actor.position.x, actor.position.y + MONSTER_LOOK_HEIGHT, actor.position.z, 0);
    this.attackQuaternion.copy(this.dependencies.camera.quaternion);
    this.dependencies.camera.quaternion.slerpQuaternions(this.scanQuaternion, this.attackQuaternion, progress);
  }

  private sampleMonsterPose(elapsedSeconds: number): void {
    const idle = this.monsterIdleAction;
    const attack = this.monsterAttackAction;
    if (idle === null || attack === null) return;
    const attacking = smoothstep(clamp01((elapsedSeconds - MONSTER_BITE_START_SECONDS) / 0.04));
    idle.time = elapsedSeconds % idle.getClip().duration;
    attack.time = clamp01((elapsedSeconds - MONSTER_BITE_START_SECONDS)
      / (MONSTER_IMPACT_SECONDS - MONSTER_BITE_START_SECONDS))
      * attack.getClip().duration * MONSTER_HIT_CLIP_PHASE;
    idle.setEffectiveWeight(1 - attacking);
    attack.setEffectiveWeight(attacking);
    this.monsterMixer?.update(0);
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
      for (const [id, label] of [
        ['midnightCampfire', 'campfire'], ['midnightWoodLog', 'wood log'],
      ] as const) {
        const model = this.dependencies.propModels.createEventModel(id);
        if (model === null) throw new Error(`Missing required Midnight Tour ${label} model.`);
        collectMeshResources(model.root, geometries, materials);
      }
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
      for (const required of [MONSTER_IDLE_CLIP, MONSTER_ATTACK_CLIP]) {
        if (!monster.animations.some(({ name }) => name === required)) {
          throw new Error(`Missing required Midnight Tour monster clip: ${required}.`);
        }
      }
    } finally {
      disposeResourceSets(geometries, materials);
    }
  }

  private buildIsland(): void {
    const palms = this.dependencies.propModels.createEventModel('midnightPalmTrees');
    if (palms === null) throw new Error('Missing required Midnight Tour palm model.');
    const islandModel = this.dependencies.propModels.createEventModel('midnightIsland');
    if (islandModel === null) throw new Error('Missing required Midnight Tour island model.');
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
    this.island.userData.greenTopLocalY = this.greenTopLocalY;

    this.placePalms(palms.root);
    this.placeBushes();
    this.islandLookTarget.position.set(0, this.greenTopLocalY + 0.65, 0);
    this.island.add(this.islandLookTarget);

    const shoreLight = new PointLight(0xe2a45e, 2.2, 24, 1.1);
    shoreLight.name = 'midnight-tour-shore-light';
    shoreLight.position.set(-1, this.greenTopLocalY + 3, 6);
    this.island.add(shoreLight);
    const moonFill = new PointLight(0x91b5c1, 1.4, 30, 1.05);
    moonFill.name = 'midnight-tour-moon-fill';
    moonFill.position.set(1, this.greenTopLocalY + 5, 7);
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

  private placeBushes(): void {
    const placements = [
      [-2.5, -0.15, 1.05, 0.3], [-1.8, -0.65, 0.75, -0.6],
      [-0.65, -1.4, 0.9, 1.4], [1.8, 0.6, 0.8, -0.4],
      [2.65, -0.3, 1.1, 0.8], [2.25, -1.05, 0.7, 2.1],
    ] as const;
    for (const [index, [x, z, scale, yaw]] of placements.entries()) {
      const selected = this.dependencies.propModels.createEventModel('midnightBush');
      if (selected === null) throw new Error('Missing required Midnight Tour bush model.');
      const bush = selected.root;
      bush.name = `midnight-tour-bush-${index + 1}`;
      bush.position.set(x, this.greenTopLocalY
        - EVENT_MODEL_SPECS.midnightBush.normalizedBounds.min[1] * scale, z);
      bush.scale.setScalar(scale);
      bush.rotation.y = yaw;
      this.island.add(bush);
    }
  }

  private createDigSite(): void {
    const site = new Group();
    site.name = 'midnight-tour-dig-site';
    this.digOrigin.set(this.chestEnd.x, this.islandBase.y + this.greenTopLocalY, this.chestEnd.z);
    site.position.copy(this.digOrigin);
    site.position.y += 0.015;
    const soil = createMaterial(0x594232, 1);
    const freshSoil = createMaterial(0x74553a, 1);
    const patch = new Mesh(new CylinderGeometry(0.64, 0.68, 0.025, 11), soil);
    patch.scale.z = 0.75;
    patch.rotation.y = 0.35;
    site.add(patch);
    const pile = new Group();
    pile.name = 'midnight-tour-dirt-pile';
    pile.position.set(-0.52, 0, -0.05);
    const geometry = new CylinderGeometry(0.12, 0.48, 0.3, 9, 2);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const wear = 1 + Math.sin(x * 17 + z * 11) * 0.12;
      positions.setXYZ(index, x * wear, (y + 0.15) * (1 + x * 0.3), z * wear);
    }
    geometry.computeVertexNormals();
    const mound = new Mesh(geometry, freshSoil);
    mound.scale.z = 0.75;
    pile.add(mound);
    for (let index = 0; index < 4; index += 1) {
      const clod = new Mesh(geometry, index % 2 === 0 ? soil : freshSoil);
      clod.position.set(-0.3 + index * 0.19, 0.01, 0.2 + Math.sin(index * 2) * 0.1);
      clod.scale.set(0.3, 0.35 + index * 0.04, 0.3);
      clod.rotation.y = index * 1.4;
      pile.add(clod);
    }
    pile.scale.y = 0.25;
    site.add(pile);
    this.dirtPile = pile;
    this.addResultActor(site);
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
    this.monsterPosition.set(
      this.islandBase.x,
      islandTop - EVENT_MODEL_SPECS.midnightMonster.normalizedBounds.min[1],
      // The animated jaw and tongue extend beyond the resting model bounds.
      this.islandBase.z + 3.83,
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
    this.dependencies.emitCue({ eventId: 'midnight-tour', cue: 'attack' });
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
    this.createDigSite();
    return actor;
  }

  private prepareChestCamera(): void {
    this.applyChestResult(0);
  }

  private createShovel(): void {
    const selected = this.dependencies.propModels.createEventModel('midnightShovel');
    if (selected === null) {
      throw new Error('Missing required Midnight Tour shovel model.');
    }
    this.shovelAnimation = new MidnightShovelAnimation(selected.root,
      EVENT_MODEL_SPECS.midnightShovel.normalizedBounds.min[1], this.digOrigin);
    this.resultActors.add(this.shovelAnimation.root);
    collectMeshResources(this.shovelAnimation.root, this.shovelGeometries, this.shovelMaterials);
  }

  private disposeShovel(): void {
    this.shovelAnimation?.root.removeFromParent();
    this.shovelAnimation = null;
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
    if (idleClip === undefined || attackClip === undefined) {
      collectMeshResources(
        selected.root,
        this.resultGeometries,
        this.resultMaterials,
      );
      disposeResourceSets(this.resultGeometries, this.resultMaterials);
      const missing = idleClip === undefined ? MONSTER_IDLE_CLIP : MONSTER_ATTACK_CLIP;
      throw new Error(`Missing required Midnight Tour monster clip: ${missing}.`);
    }

    const actor = selected.root;
    actor.name = 'midnight-tour-monster';
    actor.userData.model = 'imported';
    actor.position.copy(this.monsterPosition);
    actor.rotation.y = Math.PI;
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
    for (const action of [idleAction, attackAction]) {
      action.reset().play();
      action.paused = true;
    }
    this.sampleMonsterPose(0);
    return actor;
  }

  private addResultActor(actor: Group): void {
    this.resultActors.add(actor);
    collectMeshResources(actor, this.resultGeometries, this.resultMaterials);
  }

  private clearResultActors(): void {
    this.heldResultKind = null;
    this.camp = null;
    this.disposeShovel();
    this.disposeMonsterAnimation();
    this.activeActor = null;
    this.dirtPile = null;
    this.resultActors.clear();
    disposeResourceSets(this.resultGeometries, this.resultMaterials);
  }

  private disposeMonsterAnimation(): void {
    const mixer = this.monsterMixer;
    if (mixer === null) return;
    this.monsterIdleAction?.stop();
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
  }
}
