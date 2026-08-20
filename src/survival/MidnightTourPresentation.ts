import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import { DEFAULT_WAVES } from '../ocean/WaveField';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import { EVENT_MODEL_SPECS } from '../world/eventModelManifest';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
} from './animationMath';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

type MidnightTourAnimationKind =
  | 'reveal'
  | 'choice-pass'
  | 'choice-visit'
  | 'result-chest'
  | 'result-attack'
  | 'result-pass';

const REVEAL_DURATION = 1.25;
const PASS_DURATION = 1.15;
const VISIT_DURATION = 1.5;
const RESULT_DURATION = 4.8;
const SEARCH_LEFT_END = 0.28;
const SEARCH_RIGHT_END = 0.56;
const RESULT_TURN_END = 0.76;
const ISLAND_DISTANCE = 11.8;
const ISLAND_Z = -28;
const ISLAND_TOP_WAVE_CLEARANCE = 0.18;
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
  private readonly islandBase = new Vector3();
  private readonly islandBehind = new Vector3();
  private readonly islandStart = new Vector3();
  private readonly chestEnd = new Vector3();
  private readonly creatureStart = new Vector3();
  private readonly creatureEnd = new Vector3();
  private cameraParent: Object3D | null = null;
  private readonly cameraPosition = new Vector3();
  private readonly cameraQuaternion = new Quaternion();
  private readonly cutsceneCameraPosition = new Vector3();
  private readonly cutsceneLookTarget = new Vector3();
  private readonly lookMatrix = new Matrix4();
  private readonly animation: TimedPresentationAnimation<MidnightTourAnimationKind>;
  private activeActor: Group | null = null;
  private side: EventSide = -1;
  private greenTopLocalY = 0;
  private cameraCaptured = false;
  private searchLeftMarked = false;
  private searchRightMarked = false;
  private resultRevealMarked = false;
  private cameraKickMarked = false;
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
        this.root.userData.approachBeats = 0;
        this.root.userData.state = 'approaching';
        const animation = this.animation.start('choice-visit', VISIT_DURATION);
        this.applyAnimation('choice-visit', 0);
        return animation;
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
    this.animation.settle();
    this.clearResultActors();
    switch (result.resultId) {
      case 'tour-chest': {
        this.prepareCutsceneCamera();
        this.resetResultCounters();
        this.activeActor = this.createChestReward();
        this.root.userData.state = 'chest-result';
        const animation = this.animation.start('result-chest', RESULT_DURATION);
        this.applyAnimation('result-chest', 0);
        return animation;
      }
      case 'tour-attack': {
        this.prepareCutsceneCamera();
        this.resetResultCounters();
        this.activeActor = this.createCreature();
        this.root.userData.state = 'attack-result';
        const animation = this.animation.start('result-attack', RESULT_DURATION);
        this.applyAnimation('result-attack', 0);
        return animation;
      }
      case 'tour-pass': {
        this.restoreCamera();
        this.islandStart.copy(this.island.position);
        this.root.userData.state = 'pass-result';
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
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
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
      case 'choice-visit':
        this.applyVisit(normalized);
        break;
      case 'result-chest':
        this.applyResult(normalized, false);
        break;
      case 'result-attack':
        this.applyResult(normalized, true);
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
      case 'choice-visit':
        this.root.userData.state = 'choice-visited';
        break;
      case 'result-chest':
        this.root.userData.state = 'held-chest';
        break;
      case 'result-attack':
        this.root.userData.state = 'held-attack';
        break;
      case 'result-pass':
        this.root.userData.state = 'held-pass';
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

  private applyVisit(progress: number): void {
    this.root.userData.approachBeats = progress >= 1 ? 1 : 0;
    this.applyCameraPose(
      this.islandBase.x + 0.65,
      this.islandBase.y + this.greenTopLocalY + 1,
      this.islandBase.z + 0.15,
      0,
    );
  }

  private applyResult(progress: number, attack: boolean): void {
    const actor = this.activeActor;
    if (actor === null) return;
    let targetX = this.islandBase.x + 0.65;
    let targetY = this.islandBase.y + this.greenTopLocalY + 1;
    let targetZ = this.islandBase.z + 0.15;
    let recoil = 0;

    if (progress < SEARCH_LEFT_END) {
      const turn = smoothstep(progress / SEARCH_LEFT_END);
      targetX -= 1.45 * turn;
      targetY -= Math.sin(turn * Math.PI) * 0.08;
    } else if (progress < SEARCH_RIGHT_END) {
      this.markSearchLeft();
      const turn = smoothstep(
        (progress - SEARCH_LEFT_END) / (SEARCH_RIGHT_END - SEARCH_LEFT_END),
      );
      targetX += -1.45 + 2.9 * turn;
      targetY -= Math.sin(turn * Math.PI) * 0.07;
    } else if (progress < RESULT_TURN_END) {
      this.markSearchLeft();
      this.markSearchRight();
      const turn = smoothstep(
        (progress - SEARCH_RIGHT_END) / (RESULT_TURN_END - SEARCH_RIGHT_END),
      );
      const resultX = attack ? this.creatureStart.x : this.chestEnd.x;
      const resultY = attack ? this.creatureStart.y : this.chestEnd.y + 0.25;
      const resultZ = attack ? this.creatureStart.z : this.chestEnd.z;
      targetX += (1 - turn) * 1.45;
      targetX += (resultX - targetX) * turn;
      targetY += (resultY - targetY) * turn;
      targetZ += (resultZ - targetZ) * turn;
    } else {
      this.markSearchLeft();
      this.markSearchRight();
      this.markResultReveal(actor);
      if (attack) {
        const lunge = smoothstep(
          (progress - RESULT_TURN_END) / (1 - RESULT_TURN_END),
        );
        actor.position.lerpVectors(this.creatureStart, this.creatureEnd, lunge);
        actor.rotation.x = -lunge * 0.24;
        actor.rotation.z = Math.sin(lunge * Math.PI) * 0.16;
        targetX = actor.position.x;
        targetY = actor.position.y;
        targetZ = actor.position.z;
        const kickWindow = clamp01((lunge - 0.5) / 0.5);
        recoil = Math.sin(kickWindow * Math.PI) * 0.18;
        if (lunge >= 0.5) this.markCameraKick();
      } else {
        targetX = this.chestEnd.x;
        targetY = this.chestEnd.y + 0.25;
        targetZ = this.chestEnd.z;
      }
    }
    this.applyCameraPose(targetX, targetY, targetZ, recoil);
  }

  private applyCameraPose(
    targetX: number,
    targetY: number,
    targetZ: number,
    recoil: number,
  ): void {
    if (!this.cameraCaptured) return;
    const camera = this.dependencies.camera;
    camera.position.copy(this.cutsceneCameraPosition);
    camera.position.z += recoil;
    this.cutsceneLookTarget.set(targetX, targetY, targetZ);
    this.lookMatrix.lookAt(camera.position, this.cutsceneLookTarget, camera.up);
    camera.quaternion.setFromRotationMatrix(this.lookMatrix);
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
      this.islandBase.z + 0.2,
    );
    this.creatureStart.set(
      this.islandBase.x - 0.45,
      this.islandBase.y + this.greenTopLocalY + 0.55,
      this.islandBase.z - 0.4,
    );
    this.creatureEnd.set(
      this.islandBase.x + 0.05,
      this.islandBase.y + this.greenTopLocalY + 1.15,
      this.islandBase.z + 1.95,
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
    this.root.userData.searchLeft = 0;
    this.root.userData.searchRight = 0;
    this.root.userData.resultReveals = 0;
    this.root.userData.cameraKicks = 0;
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

  private createChestReward(): Group {
    const actor = new Group();
    actor.name = 'midnight-tour-reward-chest';
    const selected = this.dependencies.propModels.createEventModel('chestClosed');
    if (selected === null) {
      const wood = createMaterial(0x5d422e, 0.96);
      const iron = createMaterial(0x505959, 0.72, 0.3);
      const body = new Mesh(new BoxGeometry(0.82, 0.42, 0.58), wood);
      body.name = 'midnight-tour-reward-chest-fallback-body';
      const lid = new Mesh(new BoxGeometry(0.86, 0.2, 0.62), wood);
      lid.name = 'midnight-tour-reward-chest-fallback-lid';
      lid.position.y = 0.31;
      const band = new Mesh(new BoxGeometry(0.12, 0.7, 0.66), iron);
      band.name = 'midnight-tour-reward-chest-fallback-band';
      band.position.y = 0.09;
      actor.add(body, lid, band);
      actor.userData.model = 'procedural';
    } else {
      selected.root.name = 'event-model:chestClosed';
      actor.add(selected.root);
      actor.userData.model = 'imported';
    }
    actor.position.copy(this.chestEnd);
    actor.scale.setScalar(0.9);
    actor.visible = false;
    this.addResultActor(actor);
    return actor;
  }

  private createCreature(): Group {
    const actor = new Group();
    actor.name = 'midnight-tour-creature';
    const hide = createMaterial(0x26383a, 0.94);
    const eye = createMaterial(0xc19454, 0.54);
    const body = new Mesh(new SphereGeometry(0.34, 7, 5), hide);
    body.name = 'midnight-tour-creature-body';
    body.scale.set(1.25, 0.68, 0.85);
    actor.add(body);
    for (let index = 0; index < 6; index += 1) {
      const leg = new Mesh(new CylinderGeometry(0.025, 0.04, 0.62, 5), hide);
      leg.name = `midnight-tour-creature-leg-${index + 1}`;
      leg.position.set(
        (index < 3 ? -1 : 1) * (0.25 + index % 3 * 0.08),
        -0.16,
        (index % 3 - 1) * 0.2,
      );
      leg.rotation.z = (index < 3 ? -1 : 1) * 0.78;
      actor.add(leg);
    }
    for (let index = 0; index < 2; index += 1) {
      const creatureEye = new Mesh(new SphereGeometry(0.045, 6, 4), eye);
      creatureEye.name = 'midnight-tour-creature-eye';
      creatureEye.position.set(index === 0 ? -0.12 : 0.12, 0.12, 0.27);
      actor.add(creatureEye);
    }
    actor.position.copy(this.creatureStart);
    actor.visible = false;
    this.addResultActor(actor);
    return actor;
  }

  private addResultActor(actor: Group): void {
    this.resultActors.add(actor);
    collectMeshResources(actor, this.resultGeometries, this.resultMaterials);
  }

  private clearResultActors(): void {
    this.activeActor = null;
    this.resultActors.clear();
    disposeResourceSets(this.resultGeometries, this.resultMaterials);
  }
}
