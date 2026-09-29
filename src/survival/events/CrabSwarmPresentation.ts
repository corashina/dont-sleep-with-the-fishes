import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { runCleanupSteps } from '../../world/SceneResources';
import type { BorrowedSupplyActor, BoatSupplyDisplay, MutableSupplyPose } from '../BoatSupplyDisplay';
import type { EventModelInstance } from '../EventModelLibrary';
import type {
  DedicatedEventEnvironment, DedicatedEventPresentation, EventOutcomePresentation, EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import { mulberry32 } from '../random';
import { CrabPath } from './crabSwarmChoreography';

export const CRAB_COUNT = 8;
export const CRAB_REVEAL_SECONDS = 5;
export const CRAB_RETREAT_SECONDS = 3.2;
const clamp = (value: number) => MathUtils.clamp(value, 0, 1);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

interface Crab {
  readonly root: Group;
  readonly model: EventModelInstance;
  readonly path: CrabPath;
}

function colorCrab(root: Group): void {
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.set('#eb792c');
      material.emissive.set('#eb792c');
      // Keep the shell orange in the boat's deep night shadows.
      material.emissiveIntensity = 0.45;
      material.roughness = 0.78;
      material.metalness = 0;
    }
  });
}

type Environment = Pick<DedicatedEventEnvironment, 'eventModels'> & {
  readonly supplies: Pick<BoatSupplyDisplay, 'borrowEventActor'>;
};

export class CrabSwarmPresentation implements DedicatedEventPresentation {
  readonly eventId = 'crab-swarm' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();
  private readonly crabs: Crab[] = [];
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'reaction'>(
    (kind, _time, progress) => kind === 'reveal' ? this.climb(progress) : this.retreat(progress),
    kind => { if (kind === 'reaction') this.stolenActor?.releaseOnNextSync(); },
  );
  private stolenActor: BorrowedSupplyActor | null = null;
  private readonly itemStart = new Vector3();
  private readonly itemLocalStart = new Vector3();
  private readonly itemPosition = new Vector3();
  private readonly localPosition = new Vector3();
  private readonly itemPose: MutableSupplyPose = {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
  };
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: Environment) {
    this.worldRoot.name = 'crab-swarm-world';
    this.boatRoot.name = 'crab-swarm-boat';
    this.itemAimTarget.name = 'crab-swarm-aim';
    this.itemAimTarget.position.set(0, 0.2, -1.7);
    this.boatRoot.add(this.itemAimTarget);
    try {
      for (let index = 0; index < CRAB_COUNT; index += 1) {
        const model = environment.eventModels.create('crab');
        model.root.scale.multiplyScalar(0.7);
        colorCrab(model.root);
        const root = new Group();
        root.name = `swarm-crab-${index + 1}`;
        root.add(model.root);
        // Place the feet on the path, independent of the source model's origin.
        const bounds = new Box3().setFromObject(model.root);
        model.root.position.y -= bounds.min.y;
        this.crabs.push({ root, model, path: new CrabPath(model.root) });
        this.boatRoot.add(root);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.boatRoot.visible = false;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    const random = mulberry32(context.variantSeed);
    this.crabs.forEach((crab, index) => crab.path.configure(index, random, this.boatRoot.parent!));
    this.staged = true;
    this.boatRoot.visible = true;
    this.climb(0);
  }

  reveal(): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    this.climb(0);
    return this.animation.start('reveal', CRAB_REVEAL_SECONDS);
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    // The shared item controller moves the tool. Crabs hold their reveal pose.
    return Promise.resolve(false);
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (!this.staged || this.disposed) return Promise.resolve();
    this.animation.cancel();
    this.releaseActor();
    const stolenId = result.lostInstanceIds[0];
    if (stolenId !== undefined) {
      this.stolenActor = this.environment.supplies.borrowEventActor(stolenId);
      if (this.stolenActor !== null) {
        this.itemLocalStart.copy(this.stolenActor.root.position);
        this.stolenActor.root.getWorldPosition(this.itemStart);
        this.boatRoot.worldToLocal(this.itemStart);
      }
    }
    this.retreat(0);
    return this.animation.start('reaction', CRAB_RETREAT_SECONDS);
  }

  update(time: number, delta: number): void {
    if (!this.staged || this.disposed || !this.animation.active) return;
    this.animation.update(time, Number.isFinite(delta) ? Math.max(0, delta) : 0);
  }

  settleForVisibilityChange(): void { if (!this.disposed) this.animation.settle(); }
  skip(): void { this.settleForVisibilityChange(); }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.releaseActor();
    this.staged = false;
    this.boatRoot.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    runCleanupSteps([
      ...this.crabs.map(crab => () => crab.model.dispose()),
      () => this.boatRoot.clear(), () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
    ]);
  }

  private releaseActor(): void {
    this.stolenActor?.release();
    this.stolenActor = null;
  }

  private climb(progress: number): void {
    for (const crab of this.crabs) crab.path.sample(crab.root, progress);
  }

  private retreat(progress: number): void {
    const actor = this.stolenActor;
    // The thief stays on the timber too, instead of flying with the stolen item.
    const thief = this.crabs[this.itemStart.x < 0 ? 0 : 1]!;
    for (const crab of this.crabs) {
      const retreat = actor !== null && crab === thief ? clamp((progress - 0.3) / 0.7) : progress;
      crab.path.sample(crab.root, retreat, true);
    }
    if (actor === null) return;
    const approach = ease(progress / 0.3);
    this.itemPosition.set(0, 0.1, 0.12).applyQuaternion(thief.root.quaternion).add(thief.root.position);
    this.itemPosition.lerpVectors(this.itemStart, this.itemPosition, approach);
    this.localPosition.copy(this.itemPosition);
    this.boatRoot.localToWorld(this.localPosition);
    actor.root.parent!.worldToLocal(this.localPosition);
    this.localPosition.sub(this.itemLocalStart);
    this.itemPose.x = this.localPosition.x;
    this.itemPose.y = this.localPosition.y;
    this.itemPose.z = this.localPosition.z;
    this.itemPose.scaleX = this.itemPose.scaleY = this.itemPose.scaleZ = progress < 1 ? 1 : 0;
    actor.applyPose(this.itemPose);
  }
}
