import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import { setFlatShading } from '../../rendering/modelPresentation';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type {
  BorrowedSupplyActor,
  MutableSupplyPose,
  SupplyAdditivePose,
} from '../BoatSupplyDisplay';
import { borrowSupplyActor, releaseSupplyActor } from '../BoatSupplyDisplay';
import { resolveCancelledEventAnimation } from '../eventPresentationTypes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventAnimation,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { StationaryEventCamera } from '../StationaryEventCamera';
import {
  DEATH_STARE_ITEM_DURATION,
  DEATH_STARE_REACTION_DURATION,
  DEATH_STARE_REVEAL_DURATION,
  identityDeathStareSample,
  sampleDeathStareItemUse,
  sampleDeathStareReaction,
  sampleDeathStareReveal,
  type DeathStareSample,
} from './deathStareChoreography';

interface WaterStrand {
  readonly mesh: Mesh;
  readonly wave: WaveSample;
  readonly x: number;
  readonly z: number;
  readonly sourceOffset: number;
}

const FACE_X = 0;
const FACE_Y = 1.15;
const FACE_Z = -5.85;
const FACE_LONGEST_DIMENSION = 5.6;
const FACE_PRESENTATION_SCALE = 1;
const FACE_PLAYER_YAW = 0;
const FACE_PLAYER_PITCH = 0.04;
const WATERLINE = 0.02;
const WATER_STRAND_COUNT = 12;
const IDENTITY_ITEM_POSE: Readonly<SupplyAdditivePose> = {
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

function isSupportedChoice(choiceId: string): boolean {
  return choiceId === 'flashlight'
    || choiceId === 'umbrella'
    || choiceId === 'cannedFood'
    || choiceId === 'food'
    || choiceId === 'shotgun'
    || choiceId === 'fishingNet';
}

function sceneChoiceId(choiceId: string): string {
  return choiceId === 'food' ? 'cannedFood' : choiceId;
}

export class DeathStarePresentation implements DedicatedEventPresentation {
  readonly eventId = 'death-stare' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly modelInstance;
  private readonly angler = new Group();
  private readonly dominantEyeMaterial = new MeshStandardMaterial({
    color: 0xd8e5c8,
    emissive: 0xb4dfbf,
    emissiveIntensity: 1.35,
    roughness: 0.28,
    metalness: 0,
    flatShading: true,
  });
  private readonly recessedEyeMaterial = new MeshStandardMaterial({
    color: 0x718578,
    emissive: 0x2d4c40,
    emissiveIntensity: 0.32,
    roughness: 0.62,
    metalness: 0,
    flatShading: true,
  });
  private readonly jawMaterial = new MeshStandardMaterial({
    color: 0x120d0d,
    emissive: 0x080303,
    emissiveIntensity: 0.08,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly toothMaterial = new MeshStandardMaterial({
    color: 0xc9c0a1,
    emissive: 0x332d22,
    emissiveIntensity: 0.12,
    roughness: 0.76,
    metalness: 0,
    flatShading: true,
  });
  private readonly wetLureMaterial = new MeshStandardMaterial({
    color: 0x799e87,
    emissive: 0x5fbd83,
    emissiveIntensity: 0.72,
    roughness: 0.22,
    metalness: 0.04,
    flatShading: true,
  });
  private readonly waterMaterial = new MeshStandardMaterial({
    color: 0x4cabb8,
    emissive: 0x245f69,
    emissiveIntensity: 0.22,
    roughness: 0.24,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly dominantEye: Mesh;
  private readonly recessedEye: Mesh;
  private readonly jawInterior: Mesh;
  private readonly mouthTarget = new Group();
  private readonly lure: Mesh;
  private readonly lureStalk: Mesh;
  private readonly teeth: readonly Mesh[];
  private readonly waterStrands: readonly WaterStrand[];
  private readonly sample: DeathStareSample = identityDeathStareSample();
  private readonly itemPose: MutableSupplyPose = {
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
  private readonly reactionState = {
    attacked: false,
    lostItem: false,
    brokenItem: false,
  };
  private readonly borrowedBasePosition = new Vector3();
  private readonly mouthWorldPosition = new Vector3();
  private readonly mouthParentPosition = new Vector3();
  private readonly actorParentWorldInverse = new Matrix4();
  private active: DedicatedEventAnimation | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.cameraLook = environment.camera === undefined
      ? null
      : new StationaryEventCamera(environment.camera);
    this.worldRoot.name = 'death-stare-world';
    this.boatRoot.name = 'death-stare-boat';
    this.angler.name = 'death-stare-angler';
    this.angler.userData.faceLongestDimension = FACE_LONGEST_DIMENSION;
    this.angler.userData.presentationScale = FACE_PRESENTATION_SCALE;
    this.angler.userData.fixedPlayerFacingPose = true;
    this.angler.scale.setScalar(FACE_PRESENTATION_SCALE);

    this.modelInstance = environment.eventModels.create('deathStareBlob');
    this.modelInstance.root.name = 'death-stare-blob-model';
    this.modelInstance.root.scale.setScalar(FACE_LONGEST_DIMENSION);
    setFlatShading(this.modelInstance.root);
    this.angler.add(this.modelInstance.root);
    this.itemAimTarget.name = 'death-stare-item-aim-target';
    this.itemAimTarget.position.set(0, 0.2, 0.72);
    this.angler.add(this.itemAimTarget);

    this.ownedMaterials.add(this.dominantEyeMaterial);
    this.ownedMaterials.add(this.recessedEyeMaterial);
    this.ownedMaterials.add(this.jawMaterial);
    this.ownedMaterials.add(this.toothMaterial);
    this.ownedMaterials.add(this.wetLureMaterial);
    this.ownedMaterials.add(this.waterMaterial);

    const dominantEyeGeometry = new SphereGeometry(0.56, 9, 6);
    const recessedEyeGeometry = new SphereGeometry(0.27, 7, 5);
    const jawGeometry = new SphereGeometry(1.18, 10, 6);
    const toothGeometry = new ConeGeometry(0.12, 0.62, 5, 2);
    const lureGeometry = new SphereGeometry(0.18, 7, 5);
    const lureStalkGeometry = new CylinderGeometry(0.035, 0.055, 1.28, 5, 2);
    const strandGeometry = new CylinderGeometry(0.018, 0.045, 1, 5, 2, true);
    this.ownedGeometries.add(dominantEyeGeometry);
    this.ownedGeometries.add(recessedEyeGeometry);
    this.ownedGeometries.add(jawGeometry);
    this.ownedGeometries.add(toothGeometry);
    this.ownedGeometries.add(lureGeometry);
    this.ownedGeometries.add(lureStalkGeometry);
    this.ownedGeometries.add(strandGeometry);

    this.dominantEye = new Mesh(
      dominantEyeGeometry,
      this.dominantEyeMaterial,
    );
    this.dominantEye.name = 'death-stare-dominant-eye';
    this.dominantEye.position.set(-0.46, 0.56, 0.72);
    this.dominantEye.scale.set(1.08, 1.22, 0.66);
    this.dominantEye.rotation.z = -0.1;
    this.dominantEye.castShadow = true;
    this.angler.add(this.dominantEye);

    this.recessedEye = new Mesh(
      recessedEyeGeometry,
      this.recessedEyeMaterial,
    );
    this.recessedEye.name = 'death-stare-recessed-eye';
    this.recessedEye.position.set(0.58, 0.34, 0.62);
    this.recessedEye.scale.set(0.82, 1, 0.56);
    this.recessedEye.rotation.z = 0.18;
    this.recessedEye.castShadow = true;
    this.angler.add(this.recessedEye);

    this.jawInterior = new Mesh(jawGeometry, this.jawMaterial);
    this.jawInterior.name = 'death-stare-jaw-interior';
    this.jawInterior.position.set(0.02, -0.52, 0.5);
    this.jawInterior.scale.set(1.06, 0.44, 0.18);
    this.angler.add(this.jawInterior);

    this.mouthTarget.name = 'death-stare-mouth-target';
    this.mouthTarget.position.set(0.02, -0.52, 0.8);
    this.angler.add(this.mouthTarget);

    const teeth: Mesh[] = [];
    for (let index = 0; index < 13; index += 1) {
      const tooth = new Mesh(toothGeometry, this.toothMaterial);
      const top = index < 7;
      const rowIndex = top ? index : index - 7;
      const rowCount = top ? 7 : 6;
      const normalized = rowIndex / (rowCount - 1);
      const width = top ? 1.68 : 1.52;
      const x = -width * 0.5 + normalized * width;
      const irregular = ((index * 7) % 5) * 0.025;
      tooth.name = `death-stare-tooth-${index + 1}`;
      tooth.position.set(
        x,
        top ? -0.2 - irregular : -0.82 + irregular,
        0.72 + (index % 3) * 0.018,
      );
      tooth.rotation.set(
        0,
        (normalized - 0.5) * 0.2,
        top ? Math.PI + (normalized - 0.5) * 0.18 : (0.5 - normalized) * 0.16,
      );
      tooth.scale.set(
        0.78 + (index % 4) * 0.08,
        0.72 + ((index * 3) % 5) * 0.08,
        0.82,
      );
      tooth.castShadow = true;
      teeth.push(tooth);
      this.angler.add(tooth);
    }
    this.teeth = teeth;

    this.lureStalk = new Mesh(lureStalkGeometry, this.wetLureMaterial);
    this.lureStalk.name = 'death-stare-lure-stalk';
    this.lureStalk.position.set(-0.04, 1.13, 0.14);
    this.lureStalk.rotation.set(0.14, 0, -0.28);
    this.lureStalk.castShadow = true;
    this.angler.add(this.lureStalk);

    this.lure = new Mesh(lureGeometry, this.wetLureMaterial);
    this.lure.name = 'death-stare-lure';
    this.lure.position.set(-0.22, 1.73, 0.29);
    this.lure.scale.set(0.92, 1.18, 0.86);
    this.lure.castShadow = true;
    this.angler.add(this.lure);

    const waterStrands: WaterStrand[] = [];
    for (let index = 0; index < WATER_STRAND_COUNT; index += 1) {
      const strand = new Mesh(strandGeometry, this.waterMaterial);
      const column = index % 6;
      const row = Math.floor(index / 6);
      const x = FACE_X - 1.42 + column * 0.57 + row * 0.12;
      const z = FACE_Z + 0.28 + row * 0.34 + (column % 2) * 0.05;
      strand.name = `death-stare-water-strand-${index + 1}`;
      strand.renderOrder = 2;
      strand.visible = false;
      waterStrands.push({
        mesh: strand,
        wave: waveSample(),
        x,
        z,
        sourceOffset: 0.12 + (index % 4) * 0.13,
      });
      this.worldRoot.add(strand);
    }
    this.waterStrands = waterStrands;

    this.worldRoot.add(this.angler);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'death-stare') return;
    this.clear();
    this.cameraLook?.capture();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleDeathStareReveal(0, this.sample);
    this.applySample(0);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    sampleDeathStareReveal(0, this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: DEATH_STARE_REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || !isSupportedChoice(choiceId)
    ) {
      return Promise.resolve(false);
    }
    this.cancelActive();
    sampleDeathStareItemUse(sceneChoiceId(choiceId), 0, this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        elapsed: 0,
        duration: DEATH_STARE_ITEM_DURATION,
        resolve,
      };
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    this.resetBorrowedPose();

    const selectedId = result.selectedInstanceId;
    const selectedBroken = selectedId !== null
      && result.brokenInstanceIds.includes(selectedId);
    const lostId = result.lostInstanceIds[0] ?? null;
    if (lostId !== null && lostId !== selectedId) this.borrowActor(lostId);

    this.reactionState.attacked = (result.resourceDeltas.hull ?? 0) < 0
      || (result.resourceDeltas.health ?? 0) < 0;
    this.reactionState.lostItem = lostId !== null && this.borrowedActor?.instanceId === lostId;
    this.reactionState.brokenItem = selectedBroken
      && this.borrowedActor?.instanceId === selectedId;
    sampleDeathStareReaction(this.reactionState, 0, this.sample);
    this.applySample(0);
    this.applyReactionBorrowedPose();

    return new Promise((resolve) => {
      this.active = {
        kind: 'reaction',
        elapsed: 0,
        duration: DEATH_STARE_REACTION_DURATION,
        resolve,
      };
    });
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    if (active !== null) {
      const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
      active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
      if (active.duration - active.elapsed <= 1e-9) {
        active.elapsed = active.duration;
      }
      const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
      if (active.kind === 'reveal') {
        sampleDeathStareReveal(progress, this.sample);
      } else if (active.kind === 'item') {
        sampleDeathStareItemUse(sceneChoiceId(active.choiceId), progress, this.sample);
      } else {
        sampleDeathStareReaction(this.reactionState, progress, this.sample);
      }
      this.applySample(time);
      if (active.kind === 'reaction') this.applyReactionBorrowedPose();
      if (progress === 1) this.finishActive();
      return;
    }
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.active.elapsed = this.active.duration;
    if (this.active.kind === 'reveal') {
      sampleDeathStareReveal(1, this.sample);
    } else if (this.active.kind === 'item') {
      sampleDeathStareItemUse(sceneChoiceId(this.active.choiceId), 1, this.sample);
    } else {
      sampleDeathStareReaction(this.reactionState, 1, this.sample);
    }
    this.applySample(0);
    if (this.active.kind === 'reaction') this.applyReactionBorrowedPose();
    this.finishActive();
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.resetCameraEffect();
    this.releaseActor();
    this.staged = false;
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    const actor = this.borrowedActor;
    this.active = null;
    this.borrowedActor = null;
    resolveCancelledEventAnimation(active);

    runCleanupSteps([
      () => this.resetCameraEffect(),
      () => actor?.release(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.modelInstance.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private borrowActor(instanceId: ItemInstanceId): boolean {
    this.borrowedActor = borrowSupplyActor(
      this.borrowedActor,
      this.environment.supplies,
      instanceId,
      (actor) => this.borrowedBasePosition.copy(actor.root.position),
    );
    return this.borrowedActor !== null;
  }

  private releaseActor(): void {
    this.borrowedActor = releaseSupplyActor(this.borrowedActor);
  }

  private resetBorrowedPose(): void {
    this.borrowedActor?.applyPose(IDENTITY_ITEM_POSE);
  }

  private applyBorrowedPose(): void {
    const actor = this.borrowedActor;
    if (actor === null) return;
    this.itemPose.x = this.sample.itemX;
    this.itemPose.y = this.sample.itemY;
    this.itemPose.z = this.sample.itemZ;
    this.itemPose.yaw = this.sample.itemYaw;
    this.itemPose.pitch = this.sample.itemPitch;
    this.itemPose.roll = this.sample.itemRoll;
    this.itemPose.scaleX = this.sample.itemScaleX;
    this.itemPose.scaleY = this.sample.itemScaleY;
    this.itemPose.scaleZ = this.sample.itemScaleZ;
    actor.applyPose(this.itemPose);
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    if (active.kind === 'item') {
      sampleDeathStareItemUse(sceneChoiceId(active.choiceId), 1, this.sample);
      this.applySample(0);
      this.applySample(0);
      active.resolve(true);
      return;
    }
    if (active.kind === 'reaction' && this.reactionState.lostItem) {
      const actor = this.borrowedActor;
      this.borrowedActor = null;
      actor?.releaseOnNextSync();
    }
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    resolveCancelledEventAnimation(active);
  }

  private applySample(time: number): void {
    this.angler.visible = this.sample.fishVisibility > 0.008;
    this.angler.position.set(
      FACE_X + this.sample.fishX,
      FACE_Y + this.sample.fishY,
      FACE_Z + this.sample.fishZ,
    );
    this.angler.rotation.set(
      FACE_PLAYER_PITCH + this.sample.fishPitch,
      FACE_PLAYER_YAW + this.sample.fishYaw,
      this.sample.fishRoll,
    );

    const dominantBlinkScale = Math.max(0.06, 1 - this.sample.blink * 0.94);
    this.dominantEye.scale.set(1.08, 1.22 * dominantBlinkScale, 0.66);
    this.dominantEye.position.x = -0.46 + (1 - this.sample.eyeTarget) * 0.07;
    this.recessedEye.scale.set(0.82, Math.max(0.08, 1 - this.sample.blink * 0.82), 0.56);
    this.recessedEye.position.x = 0.58 - (1 - this.sample.eyeTarget) * 0.035;
    this.dominantEyeMaterial.emissiveIntensity = 0.72
      + this.sample.eyeTarget * 0.63;
    this.recessedEyeMaterial.emissiveIntensity = 0.16
      + this.sample.eyeTarget * 0.16;
    this.jawInterior.scale.set(
      1.06 + this.sample.jawOpen * 0.08,
      0.34 + this.sample.jawOpen * 0.56,
      0.18,
    );
    this.wetLureMaterial.emissiveIntensity = 0.28
      + this.sample.lureStrength * 0.62;
    const lureScale = 0.72 + this.sample.lureStrength * 0.28;
    this.lure.scale.set(
      0.92 * lureScale,
      1.18 * lureScale,
      0.86 * lureScale,
    );

    this.boatRoot.rotation.z = this.sample.hullRoll;
    this.applyCameraEffect();
    this.applyWaterStrands(time);
  }

  private applyWaterStrands(time: number): void {
    const strength = Math.max(0, this.sample.waterDrain);
    this.waterMaterial.opacity = Math.min(0.72, strength * 0.78);
    for (let index = 0; index < this.waterStrands.length; index += 1) {
      const strand = this.waterStrands[index]!;
      this.environment.sampleWorldWaveInto(
        strand.wave,
        time,
        strand.x,
        strand.z,
        1,
      );
      const stagger = (index % 4) * 0.035;
      strand.mesh.visible = strength > 0.025 + stagger
        && this.angler.visible;
      const surfaceY = WATERLINE + strand.wave.height;
      const sourceY = FACE_Y + this.sample.fishY + strand.sourceOffset;
      const height = Math.max(0.08, sourceY - surfaceY);
      strand.mesh.position.set(
        strand.x + strand.wave.displacementX,
        surfaceY + height * 0.5,
        strand.z + strand.wave.displacementZ,
      );
      strand.mesh.rotation.set(
        strand.wave.normal.z * 0.04,
        0,
        -strand.wave.normal.x * 0.04,
      );
      strand.mesh.scale.set(
        0.62 + (index % 3) * 0.13,
        height * strength,
        0.62 + (index % 2) * 0.16,
      );
    }
  }

  private applyCameraEffect(): void {
    const effectsRoot = this.environment.cameraEffectsRoot;
    if (this.cameraLook !== null) {
      effectsRoot?.rotation.set(0, 0, 0);
      this.cameraLook.apply(0, this.sample.cameraPitch);
      return;
    }
    if (effectsRoot === undefined) return;
    effectsRoot.rotation.x = this.sample.cameraPitch;
    effectsRoot.rotation.y = 0;
    effectsRoot.rotation.z = this.sample.cameraRoll;
  }

  private resetCameraEffect(): void {
    this.environment.cameraEffectsRoot?.rotation.set(0, 0, 0);
    this.cameraLook?.restore();
  }

  private applyReactionBorrowedPose(): void {
    const actor = this.borrowedActor;
    if (!this.reactionState.lostItem || actor === null) {
      this.applyBorrowedPose();
      return;
    }

    this.mouthTarget.getWorldPosition(this.mouthWorldPosition);
    this.mouthParentPosition.copy(this.mouthWorldPosition);
    const actorParent = actor.root.parent;
    if (actorParent !== null) {
      actorParent.updateWorldMatrix(true, false);
      this.actorParentWorldInverse.copy(actorParent.matrixWorld).invert();
      this.mouthParentPosition.applyMatrix4(this.actorParentWorldInverse);
    }

    const travel = this.sample.supplyTravel;
    this.itemPose.x = (
      this.mouthParentPosition.x - this.borrowedBasePosition.x
    ) * travel;
    this.itemPose.y = (
      this.mouthParentPosition.y - this.borrowedBasePosition.y
    ) * travel;
    this.itemPose.z = (
      this.mouthParentPosition.z - this.borrowedBasePosition.z
    ) * travel;
    this.itemPose.yaw = this.sample.itemYaw;
    this.itemPose.pitch = this.sample.itemPitch;
    this.itemPose.roll = this.sample.itemRoll;
    this.itemPose.scaleX = this.sample.itemScaleX;
    this.itemPose.scaleY = this.sample.itemScaleY;
    this.itemPose.scaleZ = this.sample.itemScaleZ;
    actor.applyPose(this.itemPose);
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.angler.visible = false;
    this.angler.position.set(FACE_X, FACE_Y, FACE_Z);
    this.angler.rotation.set(FACE_PLAYER_PITCH, FACE_PLAYER_YAW, 0);
    this.boatRoot.rotation.set(0, 0, 0);
    this.waterMaterial.opacity = 0;
    for (const strand of this.waterStrands) strand.mesh.visible = false;
  }
}
