import {
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { BorrowedSupplyActor } from '../BoatSupplyDisplay';
import type { EventModelInstance } from '../EventModelLibrary';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  createSchoolVariants,
  identitySchoolFishPose,
  identitySchoolSample,
  sampleSchoolFishPose,
  sampleSchoolItemUse,
  sampleSchoolReaction,
  sampleSchoolReveal,
  SCHOOL_ITEM_DURATION,
  SCHOOL_REACTION_DURATION,
  SCHOOL_REVEAL_DURATION,
  type SchoolFishPose,
  type SchoolSample,
  type SchoolVariant,
} from './schoolOfFishChoreography';

type ActiveSchoolAnimation =
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

interface FishActor {
  readonly model: EventModelInstance;
  readonly root: Group;
  readonly wave: WaveSample;
  readonly pose: SchoolFishPose;
  variant: SchoolVariant;
}

const MAX_FISH = 24;
const MIN_FISH = 18;
const WATERLINE = 0.08;
const SURFACE_BODY_LIFT = 0.82;
const SURFACE_EFFECT_LIFT = 0.68;

const DEFAULT_VARIANT: SchoolVariant = {
  scale: 1,
  orbitAngle: 0,
  orbitRadiusX: 1,
  orbitRadiusZ: 1,
  depth: 0.3,
  scatterX: 4,
  scatterZ: 0,
  speed: 1,
  bank: 0,
  flashOffset: 0,
};

function waveSample(): WaveSample {
  return {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
}

function setFlatShading(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

function activeFishCount(seed: number): number {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return MIN_FISH + ((safeSeed % (MAX_FISH - MIN_FISH + 1))
    + (MAX_FISH - MIN_FISH + 1)) % (MAX_FISH - MIN_FISH + 1);
}

export class SchoolOfFishPresentation implements DedicatedEventPresentation {
  readonly eventId = 'school-of-fish' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly fishActors: FishActor[] = [];
  private readonly surfaceFlashes: Mesh[] = [];
  private readonly splashes: Mesh[] = [];
  private readonly catchModel: EventModelInstance;
  private readonly catchActor: Group;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly silverMaterial = new MeshStandardMaterial({
    color: 0xb9cbd0,
    emissive: 0x6d9099,
    emissiveIntensity: 0.26,
    roughness: 0.34,
    metalness: 0.48,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly splashMaterial = new MeshStandardMaterial({
    color: 0x69bdc9,
    emissive: 0x2c737d,
    emissiveIntensity: 0.22,
    roughness: 0.28,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly sample: SchoolSample = identitySchoolSample();
  private readonly reactionState: {
    foodDelta: number;
    brokenItem: boolean;
  } = {
    foodDelta: 0,
    brokenItem: false,
  };
  private activeFish = MAX_FISH;
  private active: ActiveSchoolAnimation | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'school-of-fish-world';
    this.boatRoot.name = 'school-of-fish-boat';
    this.ownedMaterials.add(this.silverMaterial);
    this.ownedMaterials.add(this.splashMaterial);

    for (let index = 0; index < MAX_FISH; index += 1) {
      const model = environment.eventModels.create('schoolFish');
      const root = model.root;
      root.name = `school-fish-${index + 1}`;
      setFlatShading(root);
      this.worldRoot.add(root);
      this.fishActors.push({
        model,
        root,
        wave: waveSample(),
        pose: identitySchoolFishPose(),
        variant: DEFAULT_VARIANT,
      });
    }

    const flashGeometry = new RingGeometry(0.07, 0.2, 8, 1);
    this.ownedGeometries.add(flashGeometry);
    for (let index = 0; index < 8; index += 1) {
      const flash = new Mesh(flashGeometry, this.silverMaterial);
      flash.name = `school-surface-flash-${index + 1}`;
      flash.rotation.x = -Math.PI / 2;
      flash.renderOrder = 2;
      this.surfaceFlashes.push(flash);
      this.worldRoot.add(flash);
    }

    const splashGeometry = new ConeGeometry(0.055, 0.26, 4, 1, true);
    this.ownedGeometries.add(splashGeometry);
    for (let index = 0; index < 6; index += 1) {
      const splash = new Mesh(splashGeometry, this.splashMaterial);
      splash.name = `school-splash-${index + 1}`;
      splash.rotation.z = (index - 2.5) * 0.13;
      splash.renderOrder = 2;
      this.splashes.push(splash);
      this.worldRoot.add(splash);
    }

    this.catchModel = environment.eventModels.create('schoolFish');
    this.catchActor = this.catchModel.root;
    this.catchActor.name = 'school-catch-actor';
    this.catchActor.position.set(1.52, 0.86, -0.42);
    this.catchActor.rotation.set(0.08, -0.34, -0.12);
    this.catchActor.userData.catchModelId = 'schoolFish';
    setFlatShading(this.catchActor);
    this.boatRoot.add(this.catchActor);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'school-of-fish') return;
    this.clear();
    const variants = createSchoolVariants(MAX_FISH, context.variantSeed);
    this.activeFish = activeFishCount(context.variantSeed);
    for (let index = 0; index < this.fishActors.length; index += 1) {
      const fish = this.fishActors[index]!;
      fish.variant = variants[index] ?? DEFAULT_VARIANT;
      fish.root.visible = index < this.activeFish;
    }
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleSchoolReveal(0, this.sample);
    for (let index = 0; index < this.fishActors.length; index += 1) {
      const fish = this.fishActors[index]!;
      fish.root.visible = index < this.activeFish;
      fish.root.scale.setScalar(0.01);
    }
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    sampleSchoolReveal(0, this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: SCHOOL_REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || (
        choiceId !== 'fishingNet'
        && choiceId !== 'bucket'
        && choiceId !== 'spyglass'
      )
    ) {
      return Promise.resolve(false);
    }
    this.cancelActive();
    if (!this.borrowActor(instanceId)) return Promise.resolve(false);
    sampleSchoolItemUse(choiceId, 0, this.sample);
    this.borrowedActor!.applyPose(this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        elapsed: 0,
        duration: SCHOOL_ITEM_DURATION,
        resolve,
      };
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    const selected = result.selectedInstanceId;
    const selectedBroken = selected !== null
      && result.brokenInstanceIds.includes(selected);
    if (selected !== null && this.borrowedActor?.instanceId !== selected) {
      this.borrowActor(selected);
    }
    this.reactionState.foodDelta = result.resourceDeltas.food ?? 0;
    this.reactionState.brokenItem = selectedBroken;
    this.worldRoot.userData.foodDelta = this.reactionState.foodDelta;
    this.catchActor.userData.foodDelta = this.reactionState.foodDelta;
    sampleSchoolReaction(this.reactionState, 0, this.sample);
    this.borrowedActor?.applyPose(this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'reaction',
        elapsed: 0,
        duration: SCHOOL_REACTION_DURATION,
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
      const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
      if (active.kind === 'reveal') {
        sampleSchoolReveal(progress, this.sample);
      } else if (active.kind === 'item') {
        sampleSchoolItemUse(active.choiceId, progress, this.sample);
        this.borrowedActor?.applyPose(this.sample);
      } else {
        sampleSchoolReaction(this.reactionState, progress, this.sample);
        this.borrowedActor?.applyPose(this.sample);
      }
      if (progress === 1) this.finishActive();
    }
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.active.elapsed = this.active.duration;
    if (this.active.kind === 'reveal') {
      sampleSchoolReveal(1, this.sample);
    } else if (this.active.kind === 'item') {
      sampleSchoolItemUse(this.active.choiceId, 1, this.sample);
      this.borrowedActor?.applyPose(this.sample);
    } else {
      sampleSchoolReaction(this.reactionState, 1, this.sample);
      this.borrowedActor?.applyPose(this.sample);
    }
    this.applySample(0);
    this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
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
    this.resolveCancelled(active);

    runCleanupSteps([
      () => actor?.release(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      ...this.fishActors.map(({ model }) => () => model.dispose()),
      () => this.catchModel.dispose(),
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

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    if (active.kind === 'item') {
      sampleSchoolItemUse(active.choiceId, 1, this.sample);
      this.borrowedActor?.applyPose(this.sample);
      active.resolve(true);
      return;
    }
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    this.resolveCancelled(active);
  }

  private resolveCancelled(active: ActiveSchoolAnimation | null): void {
    if (active?.kind === 'item') active.resolve(false);
    else active?.resolve();
  }

  private applySample(time: number): void {
    const showCatch = this.sample.catchStrength > 0.008
      && this.sample.foodDelta > 0;
    for (let index = 0; index < this.fishActors.length; index += 1) {
      const fish = this.fishActors[index]!;
      const variant = fish.variant;
      const pose = fish.pose;
      sampleSchoolFishPose(variant, time, this.sample, pose);
      this.environment.sampleWorldWaveInto(fish.wave, time, pose.x, pose.z, 1);
      fish.root.position.set(
        pose.x + fish.wave.displacementX,
        WATERLINE + fish.wave.height + SURFACE_BODY_LIFT - variant.depth * 0.12,
        pose.z + fish.wave.displacementZ,
      );
      fish.root.rotation.set(
        pose.pitch + fish.wave.normal.z * 0.12,
        pose.yaw,
        pose.roll - fish.wave.normal.x * 0.1,
      );
      fish.root.scale.set(pose.scale, pose.scale, pose.scale);
      fish.root.visible = index < this.activeFish && (!showCatch || index !== 0);
    }

    const heldBreaching = this.sample.schoolAlpha > 0.98
      && this.sample.gather > 0.98
      && this.sample.scatter < 0.01;
    const flashStrength = Math.max(
      this.sample.surfaceFlash,
      heldBreaching ? 0.24 : 0,
      this.sample.effectKind === 'telescope-track' ? this.sample.effect * 0.34 : 0,
    );
    this.silverMaterial.opacity = Math.min(0.68, flashStrength * 0.7);
    for (let index = 0; index < this.surfaceFlashes.length; index += 1) {
      const flash = this.surfaceFlashes[index]!;
      const fishIndex = (index * 3) % this.activeFish;
      const fish = this.fishActors[fishIndex]!;
      const threshold = fish.variant.flashOffset * 0.42;
      flash.visible = flashStrength > threshold && fish.root.visible;
      flash.position.set(
        fish.root.position.x,
        WATERLINE + fish.wave.height + SURFACE_EFFECT_LIFT,
        fish.root.position.z,
      );
      const flashScale = 0.5 + flashStrength * (0.75 + index * 0.035);
      flash.scale.set(flashScale, flashScale, flashScale);
    }

    const splashStrength = Math.max(
      this.sample.splash,
      heldBreaching ? 0.26 : 0,
    );
    this.splashMaterial.opacity = Math.min(0.72, splashStrength * 0.74);
    for (let index = 0; index < this.splashes.length; index += 1) {
      const splash = this.splashes[index]!;
      const fishIndex = (index * 4 + 1) % this.activeFish;
      const fish = this.fishActors[fishIndex]!;
      splash.visible = (
        heldBreaching || this.sample.splash > index * 0.09
      ) && fish.root.visible;
      splash.position.set(
        fish.root.position.x,
        WATERLINE + fish.wave.height + SURFACE_EFFECT_LIFT,
        fish.root.position.z,
      );
      const splashScale = 0.28 + splashStrength * (0.82 + index * 0.04);
      splash.scale.set(splashScale, splashScale, splashScale);
    }

    this.catchActor.visible = showCatch;
    const catchScale = 0.68 + this.sample.catchStrength * 0.32;
    this.catchActor.scale.set(catchScale, catchScale, catchScale);
    this.catchActor.position.y = 0.66 + this.sample.catchStrength * 0.2;
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.silverMaterial.opacity = 0;
    this.splashMaterial.opacity = 0;
    this.catchActor.visible = false;
    this.catchActor.position.y = 0.86;
    this.catchActor.scale.set(1, 1, 1);
    this.worldRoot.userData.foodDelta = 0;
    this.catchActor.userData.foodDelta = 0;
    for (const fish of this.fishActors) {
      fish.root.visible = false;
      fish.root.position.set(0, 0, 0);
      fish.root.rotation.set(0, 0, 0);
      fish.root.scale.set(1, 1, 1);
    }
    for (const flash of this.surfaceFlashes) flash.visible = false;
    for (const splash of this.splashes) splash.visible = false;
  }
}
