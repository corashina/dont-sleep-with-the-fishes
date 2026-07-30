import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type {
  BorrowedSupplyActor,
} from '../BoatSupplyDisplay';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  identitySnatcherSample,
  sampleSnatcherItemUse,
  sampleSnatcherReaction,
  sampleSnatcherReveal,
  SNATCHER_ITEM_DURATION,
  SNATCHER_REACTION_DURATION,
  SNATCHER_REVEAL_DURATION,
  type SnatcherSample,
} from './snatcherChoreography';

type ActiveSnatcherAnimation =
  | {
      readonly kind: 'reveal';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'item';
      readonly choiceId: string;
      elapsed: number;
      readonly duration: number;
      readonly resolve: (played: boolean) => void;
    }
  | {
      readonly kind: 'reaction';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

const CREATURE_X = 1.88;
const CREATURE_Y = 1.02;
const CREATURE_Z = -0.72;

interface MutableSupplyPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

function setCreatureMaterial(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.multiplyScalar(0.46);
      material.roughness = 0.88;
      material.metalness = 0.04;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

export class SnatcherTargetOutline {
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1.08, 0.72, 0.92, 2, 2, 2);
  private readonly warningGeometry = new OctahedronGeometry(0.075, 0);
  private readonly material = new MeshStandardMaterial({
    color: 0xd89b4a,
    emissive: 0x9e3b1f,
    emissiveIntensity: 1.15,
    roughness: 0.62,
    metalness: 0.08,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    wireframe: true,
  });
  private readonly warningMaterial = new MeshStandardMaterial({
    color: 0xf1bd62,
    emissive: 0xa83e20,
    emissiveIntensity: 1.3,
    roughness: 0.56,
    metalness: 0.06,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    flatShading: true,
  });
  private readonly warnings: readonly Mesh[];
  private targetId: ItemInstanceId | null = null;
  private disposed = false;

  constructor() {
    this.root.name = 'snatcher-target-outline';
    this.root.userData.warningValue = 'threatened-supply';

    const cage = new Mesh(this.geometry, this.material);
    cage.name = 'snatcher-warning-cage';
    cage.renderOrder = 4;
    this.root.add(cage);

    const warnings: Mesh[] = [];
    for (let index = 0; index < 4; index += 1) {
      const warning = new Mesh(this.warningGeometry, this.warningMaterial);
      warning.name = `snatcher-warning-mark-${index + 1}`;
      warning.position.set(
        index < 2 ? -0.58 : 0.58,
        index % 2 === 0 ? -0.42 : 0.42,
        0.48,
      );
      warning.rotation.z = Math.PI / 4 + index * 0.11;
      warning.renderOrder = 5;
      warnings.push(warning);
      this.root.add(warning);
    }
    this.warnings = warnings;
    this.root.visible = false;
  }

  setTarget(targetId: ItemInstanceId, target: Group): void {
    if (this.disposed) return;
    this.root.removeFromParent();
    this.targetId = targetId;
    this.root.userData.targetInstanceId = targetId;
    this.root.visible = true;
    target.add(this.root);
  }

  applyStrength(strength: number): void {
    if (this.disposed) return;
    const safeStrength = Math.max(0, Math.min(1, strength));
    this.root.visible = this.targetId !== null && safeStrength > 0.008;
    this.material.opacity = 0.34 + safeStrength * 0.48;
    this.warningMaterial.opacity = 0.42 + safeStrength * 0.44;
    const cageScale = 0.96 + safeStrength * 0.08;
    this.root.scale.set(cageScale, cageScale, cageScale);
    for (let index = 0; index < this.warnings.length; index += 1) {
      const scale = 0.72 + safeStrength * (0.35 + index * 0.035);
      this.warnings[index]!.scale.set(scale, scale, scale);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.root.removeFromParent();
    this.root.visible = false;
    this.targetId = null;
    delete this.root.userData.targetInstanceId;
  }

  targetIdForTest(): ItemInstanceId | null {
    return this.targetId;
  }

  visibleForTest(): boolean {
    return this.root.visible && this.root.parent !== null;
  }

  objectForTest(): Group {
    return this.root;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.clear();
    disposeResourceSets(
      new Set([this.geometry, this.warningGeometry]),
      new Set([this.material, this.warningMaterial]),
    );
  }
}

export class SnatcherPresentation implements DedicatedEventPresentation {
  readonly eventId = 'snatcher' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly targetOutline = new SnatcherTargetOutline();

  private readonly modelInstance;
  private readonly creature = new Group();
  private readonly fingerMaterial = new MeshStandardMaterial({
    color: 0x172724,
    emissive: 0x07110f,
    emissiveIntensity: 0.08,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
  });
  private readonly eyeMaterial = new MeshStandardMaterial({
    color: 0xd8d0a8,
    emissive: 0x756c42,
    emissiveIntensity: 0.34,
    roughness: 0.48,
    metalness: 0,
    flatShading: true,
  });
  private readonly pupilMaterial = new MeshStandardMaterial({
    color: 0x121715,
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
  });
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly fingers: readonly Mesh[];
  private readonly eyes: readonly Mesh[];
  private readonly pupils: readonly Mesh[];
  private readonly sample: SnatcherSample = identitySnatcherSample();
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
  private readonly reactionState = { targetLost: false };
  private active: ActiveSnatcherAnimation | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private targetInstanceId: ItemInstanceId | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'snatcher-world';
    this.boatRoot.name = 'snatcher-boat';
    this.creature.name = 'snatcher-creature';
    this.creature.position.set(CREATURE_X, CREATURE_Y, CREATURE_Z);

    this.modelInstance = environment.eventModels.create('snatcher');
    this.modelInstance.root.name = 'snatcher-model';
    setCreatureMaterial(this.modelInstance.root);
    this.creature.add(this.modelInstance.root);

    this.ownedMaterials.add(this.fingerMaterial);
    this.ownedMaterials.add(this.eyeMaterial);
    this.ownedMaterials.add(this.pupilMaterial);

    const fingerGeometry = new CylinderGeometry(0.035, 0.082, 0.98, 5, 3);
    this.ownedGeometries.add(fingerGeometry);
    const fingers: Mesh[] = [];
    for (let index = 0; index < 2; index += 1) {
      const finger = new Mesh(fingerGeometry, this.fingerMaterial);
      finger.name = index === 0 ? 'snatcher-finger-left' : 'snatcher-finger-right';
      finger.position.set(
        index === 0 ? -0.38 : 0.44,
        -0.08 + index * 0.06,
        0.14 - index * 0.09,
      );
      finger.rotation.set(
        -0.36 + index * 0.12,
        0.06 - index * 0.17,
        index === 0 ? -0.76 : 0.68,
      );
      finger.castShadow = true;
      fingers.push(finger);
      this.creature.add(finger);
    }
    this.fingers = fingers;

    const eyeGeometry = new SphereGeometry(0.13, 7, 5);
    const pupilGeometry = new SphereGeometry(0.052, 6, 4);
    this.ownedGeometries.add(eyeGeometry);
    this.ownedGeometries.add(pupilGeometry);
    const eyes: Mesh[] = [];
    const pupils: Mesh[] = [];
    for (let index = 0; index < 2; index += 1) {
      const eye = new Mesh(eyeGeometry, this.eyeMaterial);
      eye.name = index === 0 ? 'snatcher-eye-left' : 'snatcher-eye-right';
      eye.position.set(index === 0 ? -0.14 : 0.18, 0.39, 0.45);
      eye.scale.set(
        index === 0 ? 1.14 : 0.9,
        index === 0 ? 1.28 : 1.04,
        index === 0 ? 0.92 : 1.08,
      );
      eye.rotation.z = index === 0 ? -0.12 : 0.17;
      eye.castShadow = true;
      eyes.push(eye);
      this.creature.add(eye);

      const pupil = new Mesh(pupilGeometry, this.pupilMaterial);
      pupil.name = `snatcher-pupil-${index + 1}`;
      pupil.position.set(
        eye.position.x + (index === 0 ? 0.012 : -0.014),
        eye.position.y + (index === 0 ? -0.012 : 0.008),
        eye.position.z + 0.11,
      );
      pupil.scale.copy(eye.scale);
      pupils.push(pupil);
      this.creature.add(pupil);
    }
    this.eyes = eyes;
    this.pupils = pupils;

    this.boatRoot.add(this.creature);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'snatcher') return;
    this.clear();
    this.staged = true;
    this.targetInstanceId = context.targetInstanceId;
    this.boatRoot.visible = true;
    this.creature.visible = false;
    if (this.targetInstanceId !== null && this.borrowActor(this.targetInstanceId)) {
      this.targetOutline.setTarget(this.targetInstanceId, this.borrowedActor!.root);
      this.targetOutline.applyStrength(1);
    }
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    sampleSnatcherReveal(0, this.sample);
    this.applySample();
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: SNATCHER_REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || (
        choiceId !== 'spyglass'
        && choiceId !== 'swimRing'
        && choiceId !== 'fishingNet'
        && choiceId !== 'harpoonGun'
      )
    ) {
      return Promise.resolve(false);
    }
    this.cancelActive();
    if (!this.borrowActor(instanceId)) return Promise.resolve(false);
    sampleSnatcherItemUse(choiceId, 0, this.sample);
    this.applyBorrowedPose();
    this.applySample();
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        elapsed: 0,
        duration: SNATCHER_ITEM_DURATION,
        resolve,
      };
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    const targetId = this.targetInstanceId;
    this.reactionState.targetLost = targetId !== null
      && result.lostInstanceIds.includes(targetId);
    if (targetId !== null && this.borrowActor(targetId)) {
      this.targetOutline.setTarget(targetId, this.borrowedActor!.root);
    }
    sampleSnatcherReaction(this.reactionState, 0, this.sample);
    this.applyBorrowedPose();
    this.applySample();
    return new Promise((resolve) => {
      this.active = {
        kind: 'reaction',
        elapsed: 0,
        duration: SNATCHER_REACTION_DURATION,
        resolve,
      };
    });
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged || this.active === null) return;
    const active = this.active;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    if (active.kind === 'reveal') {
      sampleSnatcherReveal(progress, this.sample);
    } else if (active.kind === 'item') {
      sampleSnatcherItemUse(active.choiceId, progress, this.sample);
      this.applyBorrowedPose();
    } else {
      sampleSnatcherReaction(this.reactionState, progress, this.sample);
      this.applyBorrowedPose();
    }
    this.applySample();
    if (progress === 1) this.finishActive();
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.active.elapsed = this.active.duration;
    if (this.active.kind === 'reveal') {
      sampleSnatcherReveal(1, this.sample);
    } else if (this.active.kind === 'item') {
      sampleSnatcherItemUse(this.active.choiceId, 1, this.sample);
      this.applyBorrowedPose();
    } else {
      sampleSnatcherReaction(this.reactionState, 1, this.sample);
      this.applyBorrowedPose();
    }
    this.applySample();
    this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.targetOutline.clear();
    this.releaseActor();
    this.targetInstanceId = null;
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
    this.resolveCancelled(active);

    runCleanupSteps([
      () => this.targetOutline.dispose(),
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
    if (this.borrowedActor?.instanceId === instanceId) return true;
    this.releaseActor();
    const actor = this.environment.supplies.borrowEventActor(instanceId);
    if (actor === null) return false;
    this.borrowedActor = actor;
    return true;
  }

  private releaseActor(): void {
    const actor = this.borrowedActor;
    this.borrowedActor = null;
    actor?.release();
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
      sampleSnatcherItemUse(active.choiceId, 1, this.sample);
      this.applyBorrowedPose();
      this.applySample();
      active.resolve(true);
      return;
    }
    if (active.kind === 'reaction' && this.reactionState.targetLost) {
      this.borrowedActor?.releaseOnNextSync();
    }
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    this.resolveCancelled(active);
  }

  private resolveCancelled(active: ActiveSnatcherAnimation | null): void {
    if (active?.kind === 'item') active.resolve(false);
    else active?.resolve();
  }

  private applySample(): void {
    this.creature.visible = this.sample.headVisibility > 0.008
      || this.sample.fingerVisibility > 0.008;
    this.creature.position.set(
      CREATURE_X + this.sample.creatureX,
      CREATURE_Y + this.sample.creatureY,
      CREATURE_Z + this.sample.creatureZ,
    );
    this.creature.rotation.set(
      this.sample.creaturePitch,
      this.sample.creatureYaw,
      this.sample.creatureRoll,
    );
    const crouchScale = 1 - this.sample.crouchStrength * 0.05;
    this.creature.scale.set(1.02, crouchScale, 0.98);

    for (let index = 0; index < this.fingers.length; index += 1) {
      const finger = this.fingers[index]!;
      finger.visible = this.sample.fingerVisibility > 0.008;
      const extension = this.sample.fingerVisibility
        * (0.82 + this.sample.pointStrength * (index === 0 ? 0.3 : 0.2));
      finger.scale.set(
        0.82 + extension * 0.18,
        Math.max(0.01, extension),
        0.82 + extension * 0.18,
      );
    }
    for (const eye of this.eyes) {
      eye.visible = this.sample.headVisibility > 0.008;
    }
    for (const pupil of this.pupils) {
      pupil.visible = this.sample.headVisibility > 0.008;
    }
    this.targetOutline.applyStrength(this.sample.warningStrength);
  }

  private hideScene(): void {
    this.boatRoot.visible = false;
    this.worldRoot.visible = false;
    this.creature.visible = false;
    this.creature.position.set(CREATURE_X, CREATURE_Y, CREATURE_Z);
    this.creature.rotation.set(0, 0, 0);
    this.creature.scale.set(1, 1, 1);
    for (const finger of this.fingers) finger.visible = false;
    for (const eye of this.eyes) eye.visible = false;
    for (const pupil of this.pupils) pupil.visible = false;
  }
}
