import {
  AnimationMixer,
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  LoopOnce,
  Matrix4,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type AnimationAction,
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
import { ItemAimTarget } from '../ItemAimTarget';
import { smoothstep } from '../animationMath';
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
  SWARM_DIVERSION_DURATION,
  SWARM_DISTRACTION_TARGET,
  SWARM_REVEAL_DURATION,
  type SwarmSharkPose,
  type SwarmSample,
  type SwarmVariant,
} from './sharkSwarmChoreography';
import { sampleSwarmBreach, SWARM_BREACH_DURATION, SWARM_BITE_CLIP_PROGRESS } from './sharkSwarmAttack';
import { SwarmSwimPath } from './SwarmSwimPath';

interface SharkActor {
  readonly root: Group;
  readonly modelInstance: EventModelInstance;
  readonly mixer: AnimationMixer;
  readonly swimAction: AnimationAction;
  readonly biteAction: AnimationAction;
  readonly swimDuration: number;
  readonly waterlineLocalY: number;
  readonly wave: WaveSample;
  readonly pose: SwarmSharkPose;
  readonly swimPath: SwarmSwimPath;
  previousX: number;
  previousZ: number;
  headingYaw: number;
  hasPreviousPosition: boolean;
  variant: SwarmVariant;
}

const WATERLINE = 0.02;
const BODY_WATERLINE_FRACTION = 0.55;
const SWARM_BODY_TINT = new Color(0x31535b);
const SPLASH_COUNT = SWARM_SHARK_COUNT;
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

function styleShark(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (let index = 0; index < materials.length; index += 1) {
      const material = materials[index]!;
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.lerp(SWARM_BODY_TINT, 0.18);
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
    || choiceId === 'cannedFood'
    || choiceId === 'bait';
}

function sceneChoiceId(choiceId: string): string {
  return choiceId === 'bait' || choiceId === 'cannedFood' ? 'baitTin' : choiceId;
}

export class SharkSwarmPresentation implements DedicatedEventPresentation {
  readonly eventId = 'swarm-of-sharks' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget: ItemAimTarget;

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
  private readonly playerPosition = new Vector3();
  private readonly playerDirection = new Vector3();
  private readonly mouthAnchor = new Vector3();
  private readonly mouthOffset = new Vector3();
  private readonly biteForward = new Vector3();
  private readonly biteAlignment = new Quaternion();
  private readonly contactRotation = new Quaternion();
  private readonly worldRotation = new Quaternion();
  private readonly modelInverse = new Matrix4();
  private readonly breachStart = new Vector3();
  private readonly breachLaunch = new Vector3();
  private attackingShark: SharkActor | null = null;
  private biteSoundPlayed = false;
  private readonly reactionState: {
    attacked: boolean;
    playerBitten: boolean;
    foodDelta: number;
    baitDelta: number;
    brokenItem: boolean;
  } = {
    attacked: false,
    playerBitten: false,
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
  private sceneTime = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'shark-swarm-world';
    this.boatRoot.name = 'shark-swarm-boat';
    this.ownedMaterials.add(this.splashMaterial);
    for (let index = 0; index < SWARM_SHARK_COUNT; index += 1) {
      const modelInstance = environment.eventModels.create('shark');
      const root = modelInstance.root;
      const swim = root.animations.find((clip) => clip.name.endsWith('|Swim'));
      const bite = root.animations.find((clip) => clip.name.endsWith('|Swim_Bite'));
      if (swim === undefined) throw new Error('Shark model is missing its swim animation');
      if (bite === undefined) throw new Error('Shark model is missing its bite animation');
      const mixer = new AnimationMixer(root);
      const swimAction = mixer.clipAction(swim).play();
      const biteAction = mixer.clipAction(bite).setLoop(LoopOnce, 1).play();
      biteAction.paused = true;
      biteAction.clampWhenFinished = true;
      biteAction.setEffectiveWeight(0);
      styleShark(root);
      root.updateMatrixWorld(true);
      const bodyBounds = new Box3().setFromObject(root);
      const waterlineLocalY = bodyBounds.isEmpty()
        ? 0
        : bodyBounds.min.y
          + (bodyBounds.max.y - bodyBounds.min.y) * BODY_WATERLINE_FRACTION;
      root.name = `swarm-shark-${index + 1}`;
      root.userData.waterlineLocalY = waterlineLocalY;
      this.sharks.push({
        root,
        modelInstance,
        mixer,
        swimAction,
        biteAction,
        swimDuration: swim.duration,
        waterlineLocalY,
        wave: waveSample(),
        pose: createSwarmSharkPose(),
        swimPath: new SwarmSwimPath(),
        previousX: 0,
        previousZ: 0,
        headingYaw: 0,
        hasPreviousPosition: false,
        variant: DEFAULT_VARIANT,
      });
      this.worldRoot.add(root);
    }
    this.itemAimTarget = new ItemAimTarget(this.sharks[0]!.root);
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
    this.sceneTime = 0;
    this.sharks[0]!.root.add(this.itemAimTarget);
    this.itemAimTarget.position.set(0, 0.08, 0.22);
    const variants = createSwarmVariants(SWARM_SHARK_COUNT, context.variantSeed);
    for (let index = 0; index < this.sharks.length; index += 1) {
      const variant = variants[index] ?? DEFAULT_VARIANT;
      this.variants[index] = variant;
      const shark = this.sharks[index]!;
      shark.variant = variant;
      shark.swimPath.reset(variant);
      shark.swimAction.setEffectiveWeight(1);
      shark.biteAction.setEffectiveWeight(0);
      shark.biteAction.time = 0;
      shark.mixer.setTime(variant.motionPhase / (Math.PI * 2) * shark.swimDuration);
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
    if (sceneChoiceId(choiceId) === 'baitTin') {
      this.worldRoot.add(this.itemAimTarget);
      this.itemAimTarget.position.set(SWARM_DISTRACTION_TARGET.x, WATERLINE, SWARM_DISTRACTION_TARGET.z);
    }
    sampleSwarmItemUse(sceneChoiceId(choiceId), 0, this.sample);
    this.applySample(this.sceneTime);
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
    this.reactionState.playerBitten = (result.resourceDeltas.health ?? 0) < 0;
    this.attackingShark = null;
    this.biteSoundPlayed = false;
    if (this.reactionState.playerBitten) this.prepareBreach();
    this.reactionState.foodDelta = result.resourceDeltas.food ?? 0;
    this.reactionState.baitDelta = result.resourceDeltas.bait ?? 0;
    this.reactionState.brokenItem = result.selectedInstanceId !== null
      && result.brokenInstanceIds.includes(result.selectedInstanceId);
    this.worldRoot.userData.foodDelta = this.reactionState.foodDelta;
    this.worldRoot.userData.baitDelta = this.reactionState.baitDelta;
    sampleSwarmReaction(this.reactionState, 0, this.sample);
    this.applySample(this.sceneTime);
    return this.animation.start('reaction', this.prepareReactionDuration());
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.sceneTime = Number.isFinite(time) ? time : this.sceneTime;
    this.animation.update(this.sceneTime, safeDelta);
    this.applySample(this.sceneTime, safeDelta);
    if (!this.biteSoundPlayed && this.attackingShark !== null && this.sample.breachProgress >= 0.97) {
      this.biteSoundPlayed = true;
      this.environment.emitCue({ eventId: this.eventId, cue: 'bite' });
    }
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.biteSoundPlayed = true;
    this.animation.settle();
    for (const shark of this.sharks) shark.swimPath.settle(this.sceneTime);
    this.applySample(this.sceneTime);
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.staged = false;
    this.attackingShark = null;
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
          shark.mixer.stopAllAction();
          shark.mixer.uncacheRoot(shark.root);
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

  private prepareReactionDuration(): number {
    if (this.reactionState.playerBitten) return SWARM_BREACH_DURATION;
    if (this.reactionState.foodDelta >= 0 && this.reactionState.baitDelta >= 0) return SWARM_REACTION_DURATION;
    let duration = SWARM_DIVERSION_DURATION;
    for (const shark of this.sharks) {
      duration = Math.max(duration, shark.swimPath.divert(this.sceneTime) + SWARM_DIVERSION_DURATION);
    }
    return duration;
  }

  private prepareBreach(): void {
    const camera = this.environment.camera;
    if (camera !== undefined) {
      camera.getWorldPosition(this.playerPosition);
      camera.getWorldDirection(this.playerDirection);
      this.playerPosition.addScaledVector(this.playerDirection, 0.18);
      camera.getWorldQuaternion(this.contactRotation);
      this.worldRoot.getWorldQuaternion(this.worldRotation).invert();
      this.contactRotation.premultiply(this.worldRotation);
      this.worldRoot.worldToLocal(this.playerPosition);
    } else {
      this.playerPosition.set(0, 0.88, 0.96);
      this.contactRotation.identity();
    }
    // The bow is boat-local -Z, independent of the player's look direction.
    this.breachLaunch.set(0, WATERLINE, -6);
    this.boatRoot.localToWorld(this.breachLaunch);
    this.worldRoot.worldToLocal(this.breachLaunch);
    let nearestDistance = Infinity;
    for (const shark of this.sharks) {
      const distance = shark.root.position.distanceToSquared(this.breachLaunch);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        this.attackingShark = shark;
      }
    }
    const shark = this.attackingShark!;
    this.prepareBiteAlignment(shark);
    this.breachStart.copy(this.mouthAnchor);
    shark.root.localToWorld(this.breachStart);
    this.worldRoot.worldToLocal(this.breachStart);
    this.breachLaunch.y = WATERLINE + shark.wave.height;
  }

  private prepareBiteAlignment(shark: SharkActor): void {
    const head = shark.root.getObjectByName('Head');
    const nose = shark.root.getObjectByName('Head_end');
    const jaw = shark.root.getObjectByName('LowerJaw_end');
    if (head === undefined || nose === undefined || jaw === undefined) {
      throw new Error('Shark model is missing its mouth bones');
    }
    shark.swimAction.setEffectiveWeight(0);
    shark.biteAction.setEffectiveWeight(1);
    shark.biteAction.time = SWARM_BITE_CLIP_PROGRESS * shark.biteAction.getClip().duration;
    shark.mixer.update(0);
    shark.root.updateWorldMatrix(true, true);
    this.modelInverse.copy(shark.root.matrixWorld).invert();
    this.mouthAnchor.setFromMatrixPosition(nose.matrixWorld).applyMatrix4(this.modelInverse);
    this.mouthOffset.setFromMatrixPosition(jaw.matrixWorld).applyMatrix4(this.modelInverse);
    this.biteForward.setFromMatrixPosition(head.matrixWorld).applyMatrix4(this.modelInverse);
    this.biteForward.subVectors(this.mouthAnchor, this.biteForward).normalize();
    this.biteAlignment.setFromUnitVectors(this.biteForward, this.mouthOffset.set(0, 0, 1));
    this.mouthOffset.setFromMatrixPosition(jaw.matrixWorld).applyMatrix4(this.modelInverse);
    this.mouthAnchor.add(this.mouthOffset).multiplyScalar(0.5);
  }

  private alignBite(shark: SharkActor): void {
    if (shark.pose.breach === 0) return;
    shark.root.quaternion.slerp(this.contactRotation, smoothstep((this.sample.breachProgress - 0.82) / 0.18));
    shark.root.quaternion.multiply(this.biteAlignment);
    this.mouthOffset.copy(this.mouthAnchor).multiplyScalar(shark.pose.scale)
      .applyQuaternion(shark.root.quaternion);
    shark.root.position.sub(this.mouthOffset);
  }

  private sampleShark(shark: SharkActor, time: number, waveAmplitudeScale: number): void {
    shark.swimPath.sample(time, shark.pose);
    sampleSwarmSharkPose(shark.variant, time, this.sample, shark.pose);
    this.environment.sampleWorldWaveInto(
      shark.wave, time, shark.pose.x, shark.pose.z, waveAmplitudeScale,
    );
    shark.pose.y = WATERLINE + shark.wave.height
      - shark.waterlineLocalY * shark.pose.scale
      - shark.variant.depth * 0.08;
    if (shark === this.attackingShark && this.sample.breachProgress >= 0) {
      sampleSwarmBreach(this.sample.breachProgress, this.breachStart, this.breachLaunch, this.playerPosition, shark.pose);
    }
  }

  private applySample(time: number, delta = 0): void {
    const waveAmplitudeScale = this.environment.readWorldWaveAmplitudeScale();
    let impact = 0;
    let splashStrength = this.sample.splash;
    for (let index = 0; index < this.sharks.length; index += 1) {
      const shark = this.sharks[index]!;
      this.sampleShark(shark, time, waveAmplitudeScale);
      const presentationScale = shark.pose.scale;
      const surfaceY = WATERLINE + shark.wave.height;
      impact = Math.max(impact, shark.pose.impact);
      splashStrength = Math.max(splashStrength, shark.pose.splash);
      const waveInfluence = 1 - shark.pose.breach;
      const positionX = shark.pose.x + shark.wave.displacementX * waveInfluence;
      const positionZ = shark.pose.z + shark.wave.displacementZ * waveInfluence;
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
      if (shark.pose.breach > 0) shark.headingYaw = shark.pose.yaw;
      shark.root.scale.setScalar(presentationScale);
      shark.root.position.set(
        positionX,
        shark.pose.y,
        positionZ,
      );
      shark.root.userData.surfaceY = surfaceY;
      shark.root.userData.submersionOffset = shark.variant.depth * 0.08;
      shark.root.rotation.set(
        shark.pose.pitch + shark.wave.normal.z * 0.1 * waveInfluence,
        shark.headingYaw,
        shark.pose.roll - shark.wave.normal.x * 0.08 * waveInfluence,
        'YXZ',
      );
      shark.swimAction.setEffectiveWeight(1 - shark.pose.biteWeight);
      shark.biteAction.setEffectiveWeight(shark.pose.biteWeight);
      shark.biteAction.time = shark.pose.biteProgress * shark.biteAction.getClip().duration;
      shark.mixer.update(delta);
      this.alignBite(shark);
      const caught = index < this.sample.foodDelta
        && this.sample.catchStrength > 0.008;
      shark.root.visible = !caught;
    }

    this.splashMaterial.opacity = Math.min(0.72, splashStrength * 0.76);
    for (let index = 0; index < this.splashes.length; index += 1) {
      const splash = this.splashes[index]!;
      const shark = this.sharks[index]!;
      const strength = Math.max(this.sample.splash, shark.pose.splash);
      splash.visible = strength > 0.01
        && shark.root.visible;
      splash.position.set(
        shark.root.position.x,
        WATERLINE + shark.wave.height + 0.12,
        shark.root.position.z,
      );
      const scale = 0.3 + strength * (1.6 + index * 0.045);
      splash.scale.set(scale, scale, scale);
    }

    this.boatRoot.rotation.z = this.sample.hullRoll;
    this.environment.cameraEffectsRoot?.rotation.set(
      impact * 0.035,
      0,
      impact === 0 ? 0 : Math.sin(this.sample.breachProgress * 70) * impact * 0.025,
    );
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.worldRoot.userData.foodDelta = 0;
    this.worldRoot.userData.baitDelta = 0;
    this.splashMaterial.opacity = 0;
    this.boatRoot.rotation.set(0, 0, 0);
    this.environment.cameraEffectsRoot?.rotation.set(0, 0, 0);
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
      shark.swimAction.setEffectiveWeight(1);
      shark.biteAction.setEffectiveWeight(0);
      shark.biteAction.time = 0;
    }
    for (let index = 0; index < this.splashes.length; index += 1) {
      this.splashes[index]!.visible = false;
    }
  }
}
