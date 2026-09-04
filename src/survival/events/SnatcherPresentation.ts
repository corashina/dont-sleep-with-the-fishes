import {
  AnimationMixer,
  Group,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  Vector3,
} from 'three';
import type {
  AnimationAction,
  BufferAttribute,
  InterleavedBufferAttribute,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { runCleanupSteps } from '../../world/SceneResources';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  identitySnatcherSample,
  sampleSnatcherItemUse,
  sampleSnatcherReaction,
  sampleSnatcherReveal,
  snatcherItemDuration,
  SNATCHER_REACTION_DURATION,
  SNATCHER_REVEAL_DURATION,
  type SnatcherSample,
} from './snatcherChoreography';

const TENTACLE_X = 2.05;
const TENTACLE_Y = -0.62;
const TENTACLE_Z = -0.66;
const TENTACLE_SCALE = 0.94;
const TENTACLE_HIT_Y = 1.25;
const TENTACLE_HIT_Z = 0.44;

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute;

interface TentacleHitSurface {
  readonly mesh: SkinnedMesh;
  readonly position: PositionAttribute;
}

function setTentacleMaterial(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.multiplyScalar(0.62);
      material.roughness = 0.82;
      material.metalness = 0.02;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

export class SnatcherPresentation implements DedicatedEventPresentation {
  readonly eventId = 'snatcher' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly modelInstance;
  private readonly mixer: AnimationMixer | null;
  private readonly idleAction: AnimationAction | null;
  private readonly tentacle = new Group();
  private readonly hitVertexPosition = new Vector3();
  private readonly hitTargetWorldPosition = new Vector3();
  private readonly hitClosestWorldPosition = new Vector3();
  private readonly hitSurfaces: readonly TentacleHitSurface[];
  private readonly sample: SnatcherSample = identitySnatcherSample();
  private readonly animation = new TimedPresentationAnimation<
    'reveal' | 'item' | 'reaction'
  >(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    () => { this.activeChoiceId = null; },
  );
  private activeChoiceId: string | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'tentacle-attack-world';
    this.boatRoot.name = 'tentacle-attack-boat';
    this.tentacle.name = 'tentacle-attack-tentacle';
    this.tentacle.position.set(TENTACLE_X, TENTACLE_Y, TENTACLE_Z);

    this.modelInstance = environment.eventModels.create('snatcher');
    this.modelInstance.root.name = 'tentacle-attack-model';
    setTentacleMaterial(this.modelInstance.root);
    const idleClip = this.modelInstance.root.animations.find(
      ({ name }) => name.toLowerCase().includes('idle'),
    ) ?? this.modelInstance.root.animations[0];
    this.mixer = idleClip === undefined
      ? null
      : new AnimationMixer(this.modelInstance.root);
    this.idleAction = idleClip === undefined
      ? null
      : this.mixer!.clipAction(idleClip);
    this.tentacle.add(this.modelInstance.root);
    this.itemAimTarget.name = 'snatcher-item-aim-target';
    this.itemAimTarget.position.set(0, TENTACLE_HIT_Y, TENTACLE_HIT_Z);
    this.tentacle.add(this.itemAimTarget);
    this.boatRoot.add(this.tentacle);
    this.hitSurfaces = this.findHitSurfaces();
    this.updateItemAimTarget();
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'snatcher') return;
    this.clear();
    this.staged = true;
    this.boatRoot.visible = true;
    this.tentacle.visible = false;
    this.idleAction?.reset().play();
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    sampleSnatcherReveal(0, this.sample);
    this.applySample();
    return this.animation.start('reveal', SNATCHER_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || (choiceId !== 'shotgun' && choiceId !== 'knife')
    ) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    sampleSnatcherItemUse(choiceId, 0, this.sample);
    this.applySample();
    return this.animation.start('item', snatcherItemDuration(choiceId), {
      complete: true,
      cancel: false,
    });
  }

  react(_result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    sampleSnatcherReaction(0, this.sample);
    this.applySample();
    return this.animation.start('reaction', SNATCHER_REACTION_DURATION);
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.mixer?.update(safeDelta);
    this.animation.update(_time, safeDelta);
    this.updateItemAimTarget();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.staged = false;
    this.idleAction?.stop();
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.modelInstance.root);

    runCleanupSteps([
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.modelInstance.dispose(),
    ]);
  }

  private applyAnimation(
    kind: 'reveal' | 'item' | 'reaction',
    progress: number,
  ): void {
    if (kind === 'reveal') {
      sampleSnatcherReveal(progress, this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      sampleSnatcherItemUse(this.activeChoiceId, progress, this.sample);
    } else {
      sampleSnatcherReaction(progress, this.sample);
    }
    this.applySample();
  }

  private applySample(): void {
    const visibility = Math.max(this.sample.headVisibility, this.sample.fingerVisibility);
    this.tentacle.visible = visibility > 0.008;
    this.modelInstance.root.visible = visibility > 0.008;
    this.tentacle.position.set(
      TENTACLE_X + this.sample.creatureX,
      TENTACLE_Y + this.sample.creatureY,
      TENTACLE_Z + this.sample.creatureZ,
    );
    this.tentacle.rotation.set(
      -0.12 + this.sample.creaturePitch,
      -0.32 + this.sample.creatureYaw,
      -0.2 + this.sample.creatureRoll,
    );
    const riseScale = 0.72 + this.sample.crouchStrength * 0.28;
    this.tentacle.scale.set(
      TENTACLE_SCALE * (0.9 + this.sample.pointStrength * 0.1),
      TENTACLE_SCALE * riseScale,
      TENTACLE_SCALE * (0.92 + this.sample.pointStrength * 0.08),
    );
  }

  private findHitSurfaces(): readonly TentacleHitSurface[] {
    const surfaces: TentacleHitSurface[] = [];
    this.modelInstance.root.traverse((object) => {
      if (!(object instanceof SkinnedMesh)) return;
      const position = object.geometry.getAttribute('position');
      if (position === undefined || position.count === 0) return;
      surfaces.push({ mesh: object, position });
    });
    if (surfaces.length === 0) {
      throw new Error('Snatcher model has no skinned surface vertex');
    }
    return surfaces;
  }

  private updateItemAimTarget(): void {
    this.tentacle.updateWorldMatrix(true, true);
    this.hitTargetWorldPosition
      .set(0, TENTACLE_HIT_Y, TENTACLE_HIT_Z)
      .applyMatrix4(this.tentacle.matrixWorld);
    let closestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const { mesh, position } of this.hitSurfaces) {
      mesh.updateMatrixWorld(true);
      mesh.skeleton.update();
      for (let index = 0; index < position.count; index += 1) {
        this.hitVertexPosition.fromBufferAttribute(position, index);
        mesh.applyBoneTransform(index, this.hitVertexPosition);
        mesh.localToWorld(this.hitVertexPosition);
        const distanceSquared = this.hitVertexPosition.distanceToSquared(
          this.hitTargetWorldPosition,
        );
        if (distanceSquared >= closestDistanceSquared) continue;
        closestDistanceSquared = distanceSquared;
        this.hitClosestWorldPosition.copy(this.hitVertexPosition);
      }
    }

    this.tentacle.worldToLocal(this.hitClosestWorldPosition);
    this.itemAimTarget.position.copy(this.hitClosestWorldPosition);
  }

  private hideScene(): void {
    this.boatRoot.visible = false;
    this.worldRoot.visible = false;
    this.tentacle.visible = false;
    this.modelInstance.root.visible = false;
    this.tentacle.position.set(TENTACLE_X, TENTACLE_Y, TENTACLE_Z);
    this.tentacle.rotation.set(-0.12, -0.32, -0.2);
    this.tentacle.scale.setScalar(TENTACLE_SCALE);
  }
}
