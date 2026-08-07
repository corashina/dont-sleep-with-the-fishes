import {
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { EventModelInstance } from '../EventModelLibrary';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  createSwarmFishPose,
  createSwarmSample,
  createSwarmVariants,
  sampleSwarmFishPose,
  sampleSwarmItemUse,
  sampleSwarmReaction,
  sampleSwarmReveal,
  swarmItemDuration,
  SWARM_FISH_COUNT,
  SWARM_REACTION_DURATION,
  SWARM_REVEAL_DURATION,
  type SwarmFishPose,
  type SwarmReactionState,
  type SwarmSample,
  type SwarmVariant,
} from './anglerfishSwarmChoreography';

interface AnglerActor {
  readonly root: Group;
  readonly bodyMidY: number;
  readonly lure: PointLight | null;
  readonly lureMarker: Mesh;
  readonly wave: WaveSample;
  readonly pose: SwarmFishPose;
  previousX: number;
  previousZ: number;
  headingYaw: number;
  hasPreviousPosition: boolean;
  variant: SwarmVariant;
}

const WATERLINE = 0.04;
const BODY_PRESENTATION_SCALE = 1.25;
const SWARM_BODY_TINT = new Color(0x31535b);
const CATCH_COUNT = 2;
const SPLASH_COUNT = 2;
const LURE_LIGHT_COUNT = 2;
const DEFAULT_VARIANT: SwarmVariant = {
  scale: 0.54,
  hullAngle: 0,
  radiusX: 3.5,
  radiusZ: 4.95,
  approachDistance: 1.8,
  depth: 0.3,
  speed: 0.8,
  roll: 0,
  revealAt: 0.06,
  lurePhase: 0,
  group: 0,
};

function styleAngler(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (let index = 0; index < materials.length; index += 1) {
      const material = materials[index]!;
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.lerp(SWARM_BODY_TINT, 0.55);
      material.emissive.setHex(0x07161c);
      material.emissiveIntensity = 0.14;
      material.roughness = Math.max(0.68, material.roughness);
      material.metalness = Math.min(0.08, material.metalness);
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

function supportedChoice(choiceId: string): boolean {
  return choiceId === 'fishingNet'
    || choiceId === 'shotgun'
    || choiceId === 'flashlight'
    || choiceId === 'baitTin'
    || choiceId === 'bait';
}

function sceneChoiceId(choiceId: string): string {
  return choiceId === 'bait' ? 'baitTin' : choiceId;
}

export class AnglerfishSwarmPresentation implements DedicatedEventPresentation {
  readonly eventId = 'swarm-of-anglerfish' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly modelInstance: EventModelInstance;
  private readonly anglers: AnglerActor[] = [];
  private readonly variants: SwarmVariant[] = Array.from(
    { length: SWARM_FISH_COUNT },
    () => DEFAULT_VARIANT,
  );
  private readonly catchActors: Group[] = [];
  private readonly splashes: Mesh[] = [];
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly splashMaterial = new MeshStandardMaterial({
    color: 0x4e9fae,
    emissive: 0x173f49,
    emissiveIntensity: 0.22,
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly catchBodyMaterial = new MeshStandardMaterial({
    color: 0x17282d,
    emissive: 0x061116,
    emissiveIntensity: 0.08,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });
  private readonly catchDetailMaterial = new MeshStandardMaterial({
    color: 0x56686b,
    emissive: 0x111d20,
    emissiveIntensity: 0.1,
    roughness: 0.7,
    metalness: 0,
    flatShading: true,
  });
  private readonly catchLureMaterial = new MeshStandardMaterial({
    color: 0x78c6d4,
    emissive: 0x4aaec3,
    emissiveIntensity: 0.58,
    roughness: 0.3,
    metalness: 0,
    flatShading: true,
  });
  private readonly sample: SwarmSample = createSwarmSample();
  private readonly reactionState: {
    attacked: boolean;
    foodDelta: number;
    baitDelta: number;
    brokenItem: boolean;
  } = {
    attacked: false,
    foodDelta: 0,
    baitDelta: 0,
    brokenItem: false,
  };
  private readonly animation = new TimedPresentationAnimation<
    'reveal' | 'item' | 'reaction'
  >(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    () => {
      this.activeChoiceId = null;
    },
  );
  private activeChoiceId: string | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'anglerfish-swarm-world';
    this.boatRoot.name = 'anglerfish-swarm-boat';
    this.ownedMaterials.add(this.splashMaterial);
    this.ownedMaterials.add(this.catchBodyMaterial);
    this.ownedMaterials.add(this.catchDetailMaterial);
    this.ownedMaterials.add(this.catchLureMaterial);

    const swarmLureGeometry = new SphereGeometry(0.075, 6, 4);
    this.ownedGeometries.add(swarmLureGeometry);
    this.modelInstance = environment.eventModels.create('anglerFish');
    styleAngler(this.modelInstance.root);
    for (let index = 0; index < SWARM_FISH_COUNT; index += 1) {
      const root = index === 0
        ? this.modelInstance.root
        : this.modelInstance.root.clone(true);
      root.name = `swarm-angler-${index + 1}`;
      root.userData.presentationScaleMaximum = 1.08;
      root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(root);
      const bodyMidY = bounds.isEmpty()
        ? 0
        : (bounds.min.y + bounds.max.y) * 0.5;
      root.userData.bodyMidY = bodyMidY;
      const lure = index < LURE_LIGHT_COUNT
        ? new PointLight(0x67cde4, 0, 4.2, 1.8)
        : null;
      if (lure !== null) {
        lure.name = `swarm-lure-light-${index + 1}`;
        lure.userData.palette = 'cold-cyan';
      }
      const lureMarker = new Mesh(swarmLureGeometry, this.catchLureMaterial);
      lureMarker.name = `swarm-lure-marker-${index + 1}`;
      lureMarker.renderOrder = 3;
      this.anglers.push({
        root,
        bodyMidY,
        lure,
        lureMarker,
        wave: waveSample(),
        pose: createSwarmFishPose(),
        previousX: 0,
        previousZ: 0,
        headingYaw: 0,
        hasPreviousPosition: false,
        variant: DEFAULT_VARIANT,
      });
      this.worldRoot.add(root, lureMarker);
      if (lure !== null) this.worldRoot.add(lure);
    }
    this.itemAimTarget.name = 'swarm-of-anglerfish-item-aim-target';
    this.itemAimTarget.position.set(0, 0.08, 0.22);
    this.anglers[0]!.root.add(this.itemAimTarget);

    const catchBodyGeometry = new SphereGeometry(0.44, 7, 5);
    const catchTailGeometry = new ConeGeometry(0.28, 0.56, 4, 1);
    const catchStalkGeometry = new CylinderGeometry(0.018, 0.032, 0.5, 5);
    const catchLureGeometry = new SphereGeometry(0.075, 6, 4);
    this.ownedGeometries.add(catchBodyGeometry);
    this.ownedGeometries.add(catchTailGeometry);
    this.ownedGeometries.add(catchStalkGeometry);
    this.ownedGeometries.add(catchLureGeometry);
    for (let index = 0; index < CATCH_COUNT; index += 1) {
      const root = new Group();
      root.name = `swarm-catch-actor-${index + 1}`;
      root.position.set(1.25 + index * 0.72, 0.72 + index * 0.08, -0.38);
      root.rotation.set(0.08, -0.36 + index * 0.22, -0.14 + index * 0.08);
      root.scale.setScalar(0.62 - index * 0.04);
      root.userData.catchModelId = 'anglerFish';
      root.userData.catchSource = 'authored-low-poly';
      root.userData.foodUnit = 1;

      const body = new Mesh(catchBodyGeometry, this.catchBodyMaterial);
      body.name = `${root.name}-body`;
      body.scale.set(1.18, 0.76, 0.82);
      body.castShadow = true;
      const tail = new Mesh(catchTailGeometry, this.catchDetailMaterial);
      tail.name = `${root.name}-tail`;
      tail.position.set(-0.58, 0, 0);
      tail.rotation.z = Math.PI / 2;
      tail.scale.set(1, 0.82, 0.46);
      tail.castShadow = true;
      const stalk = new Mesh(catchStalkGeometry, this.catchDetailMaterial);
      stalk.name = `${root.name}-lure-stalk`;
      stalk.position.set(0.2, 0.38, 0.02);
      stalk.rotation.z = -0.52;
      stalk.castShadow = true;
      const lure = new Mesh(catchLureGeometry, this.catchLureMaterial);
      lure.name = `${root.name}-lure`;
      lure.position.set(0.33, 0.59, 0.02);
      lure.scale.set(0.82, 1.14, 0.78);
      lure.castShadow = true;
      root.add(body, tail, stalk, lure);

      this.catchActors.push(root);
      this.boatRoot.add(root);
    }

    const splashGeometry = new ConeGeometry(0.065, 0.34, 5, 1, true);
    this.ownedGeometries.add(splashGeometry);
    for (let index = 0; index < SPLASH_COUNT; index += 1) {
      const splash = new Mesh(splashGeometry, this.splashMaterial);
      splash.name = `swarm-splash-${index + 1}`;
      splash.rotation.z = (index - 3.5) * 0.09;
      splash.renderOrder = 2;
      this.splashes.push(splash);
      this.worldRoot.add(splash);
    }
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    const variants = createSwarmVariants(SWARM_FISH_COUNT, context.variantSeed);
    for (let index = 0; index < this.anglers.length; index += 1) {
      const variant = variants[index] ?? DEFAULT_VARIANT;
      this.variants[index] = variant;
      this.anglers[index]!.variant = variant;
    }
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleSwarmReveal(0, variants, this.sample);
    this.applySample(0);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    sampleSwarmReveal(0, this.currentVariants(), this.sample);
    this.applySample(0);
    return this.animation.start('reveal', SWARM_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || !supportedChoice(choiceId)) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    sampleSwarmItemUse(sceneChoiceId(choiceId), 0, this.sample);
    this.applySample(0);
    return this.animation.start(
      'item',
      swarmItemDuration(sceneChoiceId(choiceId)),
      {
        complete: true,
        cancel: false,
      },
    );
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    this.reactionState.attacked = (result.resourceDeltas.hull ?? 0) < 0
      || (result.resourceDeltas.health ?? 0) < 0;
    this.reactionState.foodDelta = result.resourceDeltas.food ?? 0;
    this.reactionState.baitDelta = result.resourceDeltas.bait ?? 0;
    this.reactionState.brokenItem = result.selectedInstanceId !== null
      && result.brokenInstanceIds.includes(result.selectedInstanceId);
    this.worldRoot.userData.foodDelta = this.reactionState.foodDelta;
    this.worldRoot.userData.baitDelta = this.reactionState.baitDelta;
    for (let index = 0; index < this.catchActors.length; index += 1) {
      this.catchActors[index]!.userData.foodDelta = this.reactionState.foodDelta;
    }
    sampleSwarmReaction(this.reactionState, 0, this.sample);
    this.applySample(0);
    return this.animation.start('reaction', SWARM_REACTION_DURATION);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    this.animation.update(time, Number.isFinite(delta) ? delta : 0);
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
    this.applySample(0);
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.staged = false;
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation.cancel();
    this.activeChoiceId = null;
    runCleanupSteps([
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.modelInstance.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private currentVariants(): readonly SwarmVariant[] {
    return this.variants;
  }

  private applyAnimation(
    kind: 'reveal' | 'item' | 'reaction',
    progress: number,
  ): void {
    if (kind === 'reveal') {
      sampleSwarmReveal(progress, this.currentVariants(), this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      sampleSwarmItemUse(
        sceneChoiceId(this.activeChoiceId),
        progress,
        this.sample,
      );
    } else {
      sampleSwarmReaction(this.reactionState, progress, this.sample);
    }
  }

  private applySample(time: number): void {
    for (let index = 0; index < this.anglers.length; index += 1) {
      const fish = this.anglers[index]!;
      sampleSwarmFishPose(fish.variant, time, this.sample, fish.pose);
      this.environment.sampleWorldWaveInto(
        fish.wave,
        time,
        fish.pose.x,
        fish.pose.z,
        1,
      );
      const presentationScale = fish.pose.scale * BODY_PRESENTATION_SCALE;
      const surfaceY = WATERLINE + fish.wave.height;
      const positionX = fish.pose.x + fish.wave.displacementX;
      const positionZ = fish.pose.z + fish.wave.displacementZ;
      if (fish.hasPreviousPosition) {
        const travelX = positionX - fish.previousX;
        const travelZ = positionZ - fish.previousZ;
        if (travelX * travelX + travelZ * travelZ > 1e-8) {
          fish.headingYaw = Math.atan2(travelX, travelZ);
        }
      } else {
        fish.headingYaw = fish.pose.yaw;
        fish.hasPreviousPosition = true;
      }
      fish.previousX = positionX;
      fish.previousZ = positionZ;
      fish.root.scale.setScalar(presentationScale);
      fish.root.position.set(
        positionX,
        surfaceY - fish.bodyMidY * presentationScale,
        positionZ,
      );
      fish.root.userData.surfaceY = surfaceY;
      fish.root.rotation.set(
        fish.pose.pitch + fish.wave.normal.z * 0.1,
        fish.headingYaw,
        fish.pose.roll - fish.wave.normal.x * 0.08,
      );
      const caught = index < this.sample.foodDelta
        && this.sample.catchStrength > 0.008;
      fish.root.visible = index < this.sample.bodyVisibleCount && !caught;

      fish.lureMarker.visible = index < this.sample.visibleCount;
      fish.lure?.position.set(
        fish.root.position.x,
        fish.root.position.y + fish.variant.scale * 0.56,
        fish.root.position.z + fish.variant.scale * 0.12,
      );
      fish.lureMarker.position.set(
        fish.root.position.x,
        fish.root.position.y + fish.variant.scale * 0.56,
        fish.root.position.z + fish.variant.scale * 0.12,
      );
      const lurePulse = 0.9
        + Math.sin(time * fish.variant.speed * 1.7 + fish.variant.lurePhase) * 0.1;
      fish.lureMarker.scale.setScalar(
        lurePulse * (0.82 + this.sample.lureStrength * 0.28),
      );
      if (fish.lure !== null) {
        fish.lure.visible = fish.lureMarker.visible;
        fish.lure.intensity = fish.lure.visible
          ? this.sample.lureStrength * (1 - this.sample.lureDim) * lurePulse
          : 0;
      }
    }

    const catchCount = Math.max(
      0,
      Math.min(CATCH_COUNT, Math.trunc(this.sample.foodDelta)),
    );
    for (let index = 0; index < this.catchActors.length; index += 1) {
      const actor = this.catchActors[index]!;
      actor.visible = index < catchCount && this.sample.catchStrength > 0.008;
      const scale = (0.62 - index * 0.04)
        * (0.74 + this.sample.catchStrength * 0.26);
      actor.scale.setScalar(scale);
      actor.position.y = 0.58 + index * 0.08
        + this.sample.catchStrength * 0.14;
    }

    this.splashMaterial.opacity = Math.min(0.72, this.sample.splash * 0.76);
    for (let index = 0; index < this.splashes.length; index += 1) {
      const splash = this.splashes[index]!;
      const fish = this.anglers[(index * 5 + 1) % SWARM_FISH_COUNT]!;
      splash.visible = this.sample.splash > index * 0.075
        && fish.lureMarker.visible;
      splash.position.set(
        fish.root.position.x,
        WATERLINE + fish.wave.height + 0.12,
        fish.root.position.z,
      );
      const scale = 0.3 + this.sample.splash * (0.74 + index * 0.045);
      splash.scale.set(scale, scale, scale);
    }

    this.boatRoot.rotation.z = this.sample.hullRoll;
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.worldRoot.userData.foodDelta = 0;
    this.worldRoot.userData.baitDelta = 0;
    this.splashMaterial.opacity = 0;
    this.boatRoot.rotation.set(0, 0, 0);
    for (let index = 0; index < this.anglers.length; index += 1) {
      const fish = this.anglers[index]!;
      fish.root.visible = false;
      fish.root.position.set(0, 0, 0);
      fish.root.rotation.set(0, 0, 0);
      fish.root.scale.setScalar(1);
      fish.previousX = 0;
      fish.previousZ = 0;
      fish.headingYaw = 0;
      fish.hasPreviousPosition = false;
      if (fish.lure !== null) fish.lure.visible = false;
      fish.lureMarker.visible = false;
      if (fish.lure !== null) {
        fish.lure.intensity = 0;
        fish.lure.position.set(0, 0, 0);
      }
      fish.lureMarker.position.set(0, 0, 0);
      fish.lureMarker.scale.set(1, 1, 1);
    }
    for (let index = 0; index < this.catchActors.length; index += 1) {
      const actor = this.catchActors[index]!;
      actor.visible = false;
      actor.scale.setScalar(0.62 - index * 0.04);
      actor.position.y = 0.72 + index * 0.08;
      actor.userData.foodDelta = 0;
    }
    for (let index = 0; index < this.splashes.length; index += 1) {
      this.splashes[index]!.visible = false;
    }
  }
}
