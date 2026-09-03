import {
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
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
  createSwarmSharkPose,
  createSwarmSample,
  createSwarmVariants,
  sampleSwarmSharkPose,
  sampleSwarmItemUse,
  sampleSwarmReaction,
  sampleSwarmReveal,
  swarmItemDuration,
  SWARM_SHARK_COUNT,
  SWARM_REACTION_DURATION,
  SWARM_REVEAL_DURATION,
  type SwarmSharkPose,
  type SwarmReactionState,
  type SwarmSample,
  type SwarmVariant,
} from './sharkSwarmChoreography';

interface SharkActor {
  readonly root: Group;
  readonly modelInstance: EventModelInstance;
  readonly waterlineLocalY: number;
  readonly wave: WaveSample;
  readonly pose: SwarmSharkPose;
  previousX: number;
  previousZ: number;
  headingYaw: number;
  hasPreviousPosition: boolean;
  variant: SwarmVariant;
}

const WATERLINE = 0.02;
const FIN_PRESENTATION_SCALE = 1.55;
const FIN_WATERLINE_FRACTION = 0.2;
const SWARM_BODY_TINT = new Color(0x31535b);
const SPLASH_COUNT = 2;
const DEFAULT_VARIANT: SwarmVariant = {
  scale: 0.54,
  orbitAngle: 0,
  radiusX: 5,
  radiusZ: 6.5,
  approachDistance: 2.4,
  depth: 0.3,
  speed: 0.8,
  roll: 0,
  revealAt: 0.06,
  motionPhase: 0,
  group: 0,
  netSlapWeight: 0,
};

function styleFin(root: Group): void {
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

export class SharkSwarmPresentation implements DedicatedEventPresentation {
  readonly eventId = 'swarm-of-sharks' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly sharks: SharkActor[] = [];
  private readonly variants: SwarmVariant[] = Array.from(
    { length: SWARM_SHARK_COUNT },
    () => DEFAULT_VARIANT,
  );
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
    this.worldRoot.name = 'shark-swarm-world';
    this.boatRoot.name = 'shark-swarm-boat';
    this.ownedMaterials.add(this.splashMaterial);
    for (let index = 0; index < SWARM_SHARK_COUNT; index += 1) {
      const modelInstance = environment.eventModels.create('shark');
      const root = modelInstance.root;
      styleFin(root);
      root.updateMatrixWorld(true);
      const bodyBounds = new Box3().setFromObject(root);
      const waterlineLocalY = bodyBounds.isEmpty()
        ? 0
        : bodyBounds.min.y
          + (bodyBounds.max.y - bodyBounds.min.y) * FIN_WATERLINE_FRACTION;
      root.name = `swarm-shark-${index + 1}`;
      root.userData.presentationScaleMaximum = 1.62;
      root.userData.waterlineLocalY = waterlineLocalY;
      root.userData.finOnly = true;
      this.sharks.push({
        root,
        modelInstance,
        waterlineLocalY,
        wave: waveSample(),
        pose: createSwarmSharkPose(),
        previousX: 0,
        previousZ: 0,
        headingYaw: 0,
        hasPreviousPosition: false,
        variant: DEFAULT_VARIANT,
      });
      this.worldRoot.add(root);
    }
    this.itemAimTarget.name = 'swarm-of-sharks-item-aim-target';
    this.itemAimTarget.position.set(0, 0.08, 0.22);
    this.sharks[0]!.root.add(this.itemAimTarget);

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
    const variants = createSwarmVariants(SWARM_SHARK_COUNT, context.variantSeed);
    for (let index = 0; index < this.sharks.length; index += 1) {
      const variant = variants[index] ?? DEFAULT_VARIANT;
      this.variants[index] = variant;
      this.sharks[index]!.variant = variant;
      this.sharks[index]!.root.userData.orbitRadiusX = variant.radiusX;
      this.sharks[index]!.root.userData.orbitRadiusZ = variant.radiusZ;
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
    sampleSwarmReaction(this.reactionState, 0, this.sample);
    this.applySample(0);
    return this.animation.start('reaction', SWARM_REACTION_DURATION);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.animation.update(time, safeDelta);
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
      () => {
        for (let index = 0; index < this.sharks.length; index += 1) {
          const shark = this.sharks[index]!;
          shark.modelInstance.dispose();
        }
      },
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
    const waveAmplitudeScale = this.environment.readWorldWaveAmplitudeScale();
    for (let index = 0; index < this.sharks.length; index += 1) {
      const shark = this.sharks[index]!;
      sampleSwarmSharkPose(shark.variant, time, this.sample, shark.pose);
      this.environment.sampleWorldWaveInto(
        shark.wave,
        time,
        shark.pose.x,
        shark.pose.z,
        waveAmplitudeScale,
      );
      const presentationScale = shark.pose.scale * FIN_PRESENTATION_SCALE;
      const surfaceY = WATERLINE + shark.wave.height;
      const positionX = shark.pose.x + shark.wave.displacementX;
      const positionZ = shark.pose.z + shark.wave.displacementZ;
      if (shark.hasPreviousPosition) {
        const travelX = positionX - shark.previousX;
        const travelZ = positionZ - shark.previousZ;
        if (travelX * travelX + travelZ * travelZ > 1e-8) {
          shark.headingYaw = Math.atan2(travelX, travelZ);
        }
      } else {
        shark.headingYaw = shark.pose.yaw;
        shark.hasPreviousPosition = true;
      }
      shark.previousX = positionX;
      shark.previousZ = positionZ;
      shark.root.scale.setScalar(presentationScale);
      shark.root.position.set(
        positionX,
        surfaceY
          - shark.waterlineLocalY * presentationScale
          - shark.variant.depth * 0.08,
        positionZ,
      );
      shark.root.userData.surfaceY = surfaceY;
      shark.root.userData.submersionOffset = shark.variant.depth * 0.08;
      shark.root.rotation.set(
        shark.pose.pitch + shark.wave.normal.z * 0.1,
        shark.headingYaw,
        shark.pose.roll - shark.wave.normal.x * 0.08,
      );
      const caught = index < this.sample.foodDelta
        && this.sample.catchStrength > 0.008;
      shark.root.visible = !caught;
    }

    this.splashMaterial.opacity = Math.min(0.72, this.sample.splash * 0.76);
    for (let index = 0; index < this.splashes.length; index += 1) {
      const splash = this.splashes[index]!;
      const shark = this.sharks[(index * 5 + 1) % SWARM_SHARK_COUNT]!;
      splash.visible = this.sample.splash > index * 0.075
        && shark.root.visible;
      splash.position.set(
        shark.root.position.x,
        WATERLINE + shark.wave.height + 0.12,
        shark.root.position.z,
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
    for (let index = 0; index < this.sharks.length; index += 1) {
      const shark = this.sharks[index]!;
      shark.root.visible = false;
      shark.root.position.set(0, 0, 0);
      shark.root.rotation.set(0, 0, 0);
      shark.root.scale.setScalar(1);
      shark.previousX = 0;
      shark.previousZ = 0;
      shark.headingYaw = 0;
      shark.hasPreviousPosition = false;
    }
    for (let index = 0; index < this.splashes.length; index += 1) {
      this.splashes[index]!.visible = false;
    }
  }
}
