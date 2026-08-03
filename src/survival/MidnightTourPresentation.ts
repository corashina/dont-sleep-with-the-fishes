import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import { DEFAULT_WAVES } from '../ocean/WaveField';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import { EVENT_MODEL_SPECS } from '../world/eventModelManifest';
import {
  clamp01Unchecked as clamp01,
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
  FocusedEventPresentation,
  FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import type {
  ActionOutcome,
  EventResultPresentation,
} from './survivalTypes';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import { StationaryEventCamera } from './StationaryEventCamera';

type MidnightTourAnimationKind =
  | 'reveal'
  | 'choice-pass'
  | 'choice-visit'
  | 'result-chest'
  | 'result-bait'
  | 'result-attack'
  | 'result-pass'
  | 'result-food';

type ActiveAnimation = TimedAnimation<MidnightTourAnimationKind>;

const REVEAL_DURATION = 1.25;
const PASS_DURATION = 1.15;
const VISIT_DURATION = 1.5;
const RESULT_DURATION = 1.05;
const ISLAND_DISTANCE = 10.4;
const ISLAND_BASE_Y = -1.1;
const ISLAND_Z = -20;
const MAXIMUM_WAVE_CREST = DEFAULT_WAVES.reduce(
  (height, wave) => height + wave.amplitude,
  0,
);
const IMPORTED_GREEN_TOP_Y = EVENT_MODEL_SPECS.midnightIsland
  .normalizedBounds.max[1];
function keyedTravel(progress: number): number {
  if (progress < 0.16) return -0.045 * smoothstep(progress / 0.16);
  if (progress < 0.82) {
    return -0.045 + 1.09 * smoothstep((progress - 0.16) / 0.66);
  }
  return 1.045 + (1 - 1.045) * smoothstep((progress - 0.82) / 0.18);
}

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
  private readonly islandHidden = new Vector3();
  private readonly islandBehind = new Vector3();
  private readonly islandStart = new Vector3();
  private readonly actorStart = new Vector3();
  private readonly chestEnd = new Vector3(-0.72, 0.58, -1.18);
  private readonly baitEnd = new Vector3(0.38, 0.52, -1.3);
  private readonly foodEnd = new Vector3(0.18, 0.58, -1.22);
  private readonly creatureEnd = new Vector3();
  private readonly cameraLook: StationaryEventCamera;
  private activeAnimation: ActiveAnimation | null = null;
  private activeActor: Group | null = null;
  private side: EventSide = -1;
  private greenTopLocalY = 0;
  private staged = false;
  private disposed = false;

  constructor(
    private readonly dependencies: FocusedEventPresentationDependencies,
  ) {
    this.cameraLook = new StationaryEventCamera(dependencies.camera);
    this.root.name = 'focused-event:midnight-tour';
    this.root.visible = false;
    this.root.userData.motionSource = 'fixed';
    this.root.userData.approachBeats = 0;
    this.root.userData.cameraKicks = 0;
    this.root.userData.rewardLandings = 0;

    this.setSidePositions();
    this.island.name = 'midnight-tour-island';
    this.island.position.copy(this.islandBase);
    this.island.userData.motionSource = 'fixed';
    this.buildIsland();
    this.root.add(this.island);

    this.buildForegroundWave();
    this.resultActors.name = 'midnight-tour-result-actors';
    this.root.add(this.resultActors);
    collectMeshResources(this.root, this.staticGeometries, this.staticMaterials);
  }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.side = eventSideFromSeed(variantSeed);
    this.setSidePositions();
    this.cancelActiveAnimation(false);
    this.clearResultActors();
    this.captureCamera();
    this.restoreCameraPose();
    this.staged = true;
    this.root.visible = true;
    this.island.visible = true;
    this.island.position.copy(this.islandHidden);
    this.island.rotation.set(0, 0.08 * this.side, 0);
    this.updateGreenTopClearance();
    this.root.userData.state = 'staged';
    this.root.userData.approachBeats = 0;
    this.root.userData.approachDistance = 0;
    this.root.userData.cameraKicks = 0;
    this.root.userData.rewardLandings = 0;
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    switch (choice.choiceId) {
      case 'sleep':
        this.islandStart.copy(this.island.position);
        this.root.userData.state = 'sailing-on';
        return this.startAnimation('choice-pass', PASS_DURATION);
      case 'visit':
        this.island.position.copy(this.islandBase);
        this.root.userData.approachBeats = 0;
        this.root.userData.state = 'approaching';
        return this.startAnimation('choice-visit', VISIT_DURATION);
      default:
        throw new Error(`Unsupported Midnight Tour choice: ${choice.choiceId}`);
    }
  }

  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'midnight-tour') {
      throw new Error(`Midnight Tour received result for ${result.eventId}.`);
    }
    void outcome;
    this.clearResultActors();
    switch (result.resultId) {
      case 'tour-chest':
        this.activeActor = this.createChestReward();
        this.root.userData.state = 'chest-result';
        return this.startAnimation('result-chest', RESULT_DURATION);
      case 'tour-bait':
        this.activeActor = this.createBaitReward();
        this.root.userData.state = 'bait-result';
        return this.startAnimation('result-bait', RESULT_DURATION);
      case 'tour-attack':
        this.activeActor = this.createCreature();
        this.root.userData.state = 'attack-result';
        return this.startAnimation('result-attack', RESULT_DURATION);
      case 'tour-pass':
        this.islandStart.copy(this.island.position);
        this.root.userData.state = 'pass-result';
        return this.startAnimation('result-pass', PASS_DURATION * 0.55);
      case 'tour-food-fallback':
        this.activeActor = this.createFoodReward();
        this.root.userData.state = 'food-result';
        return this.startAnimation('result-food', RESULT_DURATION);
      default:
        throw new Error(`Unsupported Midnight Tour result: ${result.resultId}`);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(false);
    this.clearResultActors();
    this.restoreCamera();
    this.island.position.copy(this.islandBase);
    this.island.rotation.set(0, 0.08 * this.side, 0);
    this.island.visible = false;
    this.root.visible = false;
    this.root.userData.state = 'idle';
    this.staged = false;
  }

  update(_time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const animation = this.activeAnimation;
    if (animation === null) return;
    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, delta),
    );
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeAnimation = null;
    this.finishAnimation(animation.kind);
    animation.resolve();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation(true);
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
    this.cancelActiveAnimation(false);
    this.restoreCamera();
    this.clearResultActors();
    this.disposed = true;
    this.staged = false;
    this.root.removeFromParent();
    disposeResourceSets(this.staticGeometries, this.staticMaterials);
  }

  private startAnimation(
    kind: MidnightTourAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation(true);
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, elapsed: 0, duration, resolve };
      this.applyAnimation(kind, 0);
    });
  }

  private applyAnimation(kind: MidnightTourAnimationKind, progress: number): void {
    const normalized = clamp01(progress);
    switch (kind) {
      case 'reveal':
        this.applyReveal(normalized);
        break;
      case 'choice-pass':
        this.applyPass(normalized);
        break;
      case 'choice-visit':
        this.applyVisit(normalized);
        break;
      case 'result-chest':
        this.applyChestResult(normalized);
        break;
      case 'result-bait':
        this.applyBaitResult(normalized);
        break;
      case 'result-attack':
        this.applyAttackResult(normalized);
        break;
      case 'result-pass':
        this.applyPass(normalized);
        break;
      case 'result-food':
        this.applyFoodResult(normalized);
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
      case 'result-bait':
        this.root.userData.state = 'held-bait';
        break;
      case 'result-attack':
        this.root.userData.state = 'held-attack';
        break;
      case 'result-pass':
        this.root.userData.state = 'held-pass';
        break;
      case 'result-food':
        this.root.userData.state = 'held-food';
        break;
    }
  }

  private applyReveal(progress: number): void {
    const travel = keyedTravel(progress);
    this.island.position.lerpVectors(this.islandHidden, this.islandBase, travel);
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
    const scaled = progress * 3;
    const completed = Math.min(3, Math.floor(scaled + 1e-6));
    const local = scaled - Math.floor(scaled);
    const beat = Math.sin(Math.PI * local) * (1 - progress * 0.45);
    const approach = progress >= 1
      ? 1
      : (Math.floor(scaled) + smoothstep(local)) / 3;
    this.root.userData.approachBeats = progress >= 1 ? 3 : Math.max(
      this.root.userData.approachBeats as number,
      completed,
    );
    this.root.userData.approachDistance = approach * 3.6;
    this.applyCameraVisitPose(
      0.22 * this.side * smoothstep(progress),
      -0.12 * smoothstep(progress) - beat * 0.045,
      -approach * 3.6 + beat * 0.045,
    );
  }

  private applyChestResult(progress: number): void {
    const actor = this.activeActor;
    if (actor === null) return;
    const travel = smoothstep(progress);
    actor.position.lerpVectors(this.actorStart, this.chestEnd, travel);
    actor.position.y += Math.sin(travel * Math.PI) * 1.2;
    actor.rotation.x = travel * Math.PI * 0.18;
    actor.rotation.z = -0.12 + Math.sin(travel * Math.PI) * 0.16;
    if (progress >= 1) this.root.userData.rewardLandings = 1;
  }

  private applyBaitResult(progress: number): void {
    const actor = this.activeActor;
    if (actor === null) return;
    const travel = smoothstep(progress);
    actor.position.lerpVectors(this.actorStart, this.baitEnd, travel);
    actor.position.y += Math.sin(travel * Math.PI) * 0.72;
    for (let index = 0; index < actor.children.length; index += 1) {
      const token = actor.children[index]!;
      const spread = travel * travel;
      token.position.x = (index - 1.5) * 0.19 * spread;
      token.position.y = Math.sin((travel + index * 0.13) * Math.PI) * 0.12 * (1 - travel);
      token.position.z = ((index % 2) * 2 - 1) * 0.12 * spread;
      token.rotation.x = travel * (index + 1) * 1.4;
      token.rotation.z = travel * (index % 2 === 0 ? -1 : 1) * 1.8;
    }
    actor.userData.scatterCount = actor.children.length;
    if (progress >= 1) this.root.userData.rewardLandings = 1;
  }

  private applyAttackResult(progress: number): void {
    const actor = this.activeActor;
    if (actor === null) return;
    const drop = smoothstep(progress / 0.7);
    actor.position.lerpVectors(this.actorStart, this.creatureEnd, drop);
    actor.rotation.y = progress * Math.PI * 1.5;
    actor.rotation.z = Math.sin(progress * Math.PI) * 0.18;
    const kickWindow = clamp01((progress - 0.48) / 0.34);
    const kick = Math.sin(kickWindow * Math.PI);
    this.applyCameraVisitPose(-0.22, -0.12 - kick * 0.16, -3.6 + kick * 0.12);
    if (progress >= 0.5) this.root.userData.cameraKicks = 1;
  }

  private applyFoodResult(progress: number): void {
    const actor = this.activeActor;
    if (actor === null) return;
    const travel = smoothstep(progress);
    actor.position.lerpVectors(this.actorStart, this.foodEnd, travel);
    actor.position.y += Math.sin(travel * Math.PI) * 0.82;
    actor.rotation.y = travel * Math.PI * 0.7;
    if (progress >= 1) this.root.userData.rewardLandings = 1;
  }

  private applyCameraVisitPose(
    yaw: number,
    pitch: number,
    _z: number,
  ): void {
    this.cameraLook.apply(yaw, pitch);
  }

  private captureCamera(): void {
    this.cameraLook.capture();
  }

  private restoreCameraPose(): void {
    this.cameraLook.apply(0, 0);
  }

  private restoreCamera(): void {
    this.cameraLook.restore();
  }

  private buildIsland(): void {
    const islandModel = this.dependencies.propModels.createEventModel('midnightIsland');
    if (islandModel === null) {
      const earth = createMaterial(0x343b38, 1);
      const fallback = new Mesh(new ConeGeometry(5.2, 3.4, 7), earth);
      fallback.name = 'midnight-tour-island-fallback';
      fallback.position.y = 0.45;
      fallback.scale.z = 0.72;
      this.island.add(fallback);
      this.greenTopLocalY = 2.15;
      this.updateGreenTopClearance();
      this.island.userData.islandModel = 'procedural';
    } else {
      islandModel.root.name = 'event-model:midnightIsland';
      islandModel.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (!(material instanceof MeshStandardMaterial)) continue;
          material.color.offsetHSL(0, -0.08, 0.08);
        }
      });
      this.island.add(islandModel.root);
      this.greenTopLocalY = IMPORTED_GREEN_TOP_Y;
      this.updateGreenTopClearance();
      this.island.userData.islandModel = 'imported';
    }

    const rock = createMaterial(0x293130, 1);
    const shelfData = [
      [-3.35, 0.12, 0.8, 2.1, 0.48, 1.2, -0.16],
      [2.65, -0.08, -0.65, 2.6, 0.55, 1.35, 0.21],
      [0.6, 0.18, 1.75, 3.1, 0.42, 1.0, -0.08],
    ] as const;
    shelfData.forEach(([x, y, z, sx, sy, sz, yaw], index) => {
      const shelf = new Mesh(new DodecahedronGeometry(0.8, 0), rock);
      shelf.name = `midnight-tour-rock-shelf-${index + 1}`;
      shelf.position.set(x, y, z);
      shelf.scale.set(sx, sy, sz);
      shelf.rotation.y = yaw;
      this.island.add(shelf);
    });

    const treeModel = this.dependencies.propModels.createEventModel('deadTree');
    const treeRest = new Group();
    treeRest.name = 'midnight-tour-dead-tree';
    treeRest.position.set(-1.65, 0.1, 0.15);
    treeRest.rotation.z = -0.055;
    if (treeModel === null) {
      this.buildFallbackTree(treeRest);
      treeRest.userData.treeModel = 'procedural';
    } else {
      treeModel.root.name = 'event-model:deadTree';
      treeRest.add(treeModel.root);
      treeRest.userData.treeModel = 'imported';
    }
    this.island.add(treeRest);

    const shoreLight = new PointLight(0xe2a45e, 2.2, 24, 1.1);
    shoreLight.name = 'midnight-tour-shore-light';
    shoreLight.position.set(-1, 3, 6);
    this.island.add(shoreLight);
    const moonFill = new PointLight(0x91b5c1, 1.4, 30, 1.05);
    moonFill.name = 'midnight-tour-moon-fill';
    moonFill.position.set(1, 5, 7);
    this.island.add(moonFill);
    const emberMaterial = createMaterial(0xc38243, 0.72);
    emberMaterial.emissive.setHex(0xc38243);
    emberMaterial.emissiveIntensity = 1.3;
    const ember = new Mesh(
      new SphereGeometry(0.16, 6, 4),
      emberMaterial,
    );
    ember.name = 'midnight-tour-shore-ember';
    ember.position.set(-1.4, 1.8, 3.8);
    this.island.add(ember);
  }

  private setSidePositions(): void {
    const islandX = ISLAND_DISTANCE * this.side;
    this.islandBase.set(islandX, ISLAND_BASE_Y, ISLAND_Z);
    this.islandHidden.set(islandX, ISLAND_BASE_Y - 3.2, ISLAND_Z);
    this.islandBehind.set(-4.6 * this.side, -0.72, 10.5);
    this.actorStart.set(islandX + 1.3 * this.side, 4.35, -19.5);
    this.creatureEnd.set(islandX + 0.4 * this.side, -0.1, -19.25);
  }

  private updateGreenTopClearance(): void {
    this.island.userData.greenTopWaveClearance = ISLAND_BASE_Y
      + this.greenTopLocalY
      - MAXIMUM_WAVE_CREST;
  }

  private buildFallbackTree(parent: Group): void {
    const bark = createMaterial(0x3d3028, 1);
    const trunk = new Mesh(new CylinderGeometry(0.24, 0.38, 4.6, 6), bark);
    trunk.name = 'midnight-tour-tree-fallback-trunk';
    trunk.position.y = 2.2;
    trunk.rotation.z = -0.12;
    parent.add(trunk);
    for (let index = 0; index < 4; index += 1) {
      const branch = new Mesh(
        new CylinderGeometry(0.07, 0.14, 2.2 - index * 0.18, 5),
        bark,
      );
      branch.name = `midnight-tour-tree-fallback-branch-${index + 1}`;
      branch.position.set(
        (index % 2 === 0 ? -1 : 1) * (0.45 + index * 0.08),
        3.15 + index * 0.24,
        (index - 1.5) * 0.12,
      );
      branch.rotation.z = (index % 2 === 0 ? 1 : -1) * (0.68 + index * 0.05);
      parent.add(branch);
    }
  }

  private buildForegroundWave(): void {
    const wave = new Group();
    wave.name = 'midnight-tour-horizon-wave';
    wave.position.set(-6.4, -0.38, -15.3);
    const water = createMaterial(0x203e49, 0.72);
    for (let index = 0; index < 5; index += 1) {
      const crest = new Mesh(
        new TorusGeometry(1.55 + index * 0.17, 0.13, 5, 12, Math.PI),
        water,
      );
      crest.name = `midnight-tour-wave-crest-${index + 1}`;
      crest.position.set((index - 2) * 2.35, index % 2 * 0.12, 0);
      crest.rotation.set(Math.PI / 2, 0, Math.PI);
      wave.add(crest);
    }
    this.root.add(wave);
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
    actor.position.copy(this.actorStart);
    actor.scale.setScalar(0.9);
    this.addResultActor(actor);
    return actor;
  }

  private createBaitReward(): Group {
    const actor = new Group();
    actor.name = 'midnight-tour-reward-bait';
    const bait = createMaterial(0x7a4938, 0.96);
    const rim = createMaterial(0x6b7370, 0.72, 0.24);
    const tokenGeometry = new CylinderGeometry(0.1, 0.12, 0.055, 7);
    const rimGeometry = new TorusGeometry(0.105, 0.012, 5, 8);
    for (let index = 0; index < 4; index += 1) {
      const token = new Group();
      token.name = `midnight-tour-bait-token-${index + 1}`;
      const body = new Mesh(tokenGeometry, bait);
      body.rotation.x = Math.PI / 2;
      const tokenRim = new Mesh(rimGeometry, rim);
      tokenRim.rotation.x = Math.PI / 2;
      token.add(body, tokenRim);
      actor.add(token);
    }
    actor.position.copy(this.actorStart);
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
      const leg = new Mesh(
        new CylinderGeometry(0.025, 0.04, 0.62, 5),
        hide,
      );
      leg.name = `midnight-tour-creature-leg-${index + 1}`;
      leg.position.set(
        (index < 3 ? -1 : 1) * (0.25 + index % 3 * 0.08),
        -0.16,
        (index % 3 - 1) * 0.2,
      );
      leg.rotation.z = (index < 3 ? -1 : 1) * 0.78;
      actor.add(leg);
    }
    for (const x of [-0.12, 0.12]) {
      const creatureEye = new Mesh(new SphereGeometry(0.045, 6, 4), eye);
      creatureEye.name = 'midnight-tour-creature-eye';
      creatureEye.position.set(x, 0.12, 0.27);
      actor.add(creatureEye);
    }
    actor.position.copy(this.actorStart);
    this.addResultActor(actor);
    return actor;
  }

  private createFoodReward(): Group {
    const actor = new Group();
    actor.name = 'midnight-tour-reward-food';
    try {
      const food = this.dependencies.propModels.create({
        instanceId: 'midnight-tour-food-reward' as ItemInstanceId,
        type: 'cannedFood',
      });
      food.name = 'midnight-tour-food-model';
      actor.add(food);
      actor.userData.model = 'imported';
    } catch {
      const tin = createMaterial(0x687271, 0.72, 0.28);
      const label = createMaterial(0x876b4a, 0.94);
      const body = new Mesh(new CylinderGeometry(0.17, 0.17, 0.28, 8), tin);
      body.name = 'midnight-tour-food-fallback-tin';
      const band = new Mesh(new CylinderGeometry(0.174, 0.174, 0.14, 8), label);
      band.name = 'midnight-tour-food-fallback-label';
      actor.add(body, band);
      actor.userData.model = 'procedural';
    }
    actor.position.copy(this.actorStart);
    actor.scale.setScalar(1.1);
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

  private cancelActiveAnimation(settle: boolean): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation === null) return;
    if (settle) this.finishAnimation(animation.kind);
    animation.resolve();
  }
}
