import { Box3, BufferGeometry, Group, Material, PointLight, Sphere, Vector3 } from 'three';
import { hasRenderableBounds } from '../rendering/modelPresentation';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import { smoothstepUnchecked as smoothstep } from './animationMath';
import { eventSideFromSeed } from './eventVariant';
import type {
  EventChoicePresentation, FocusedEventPresentation, FocusedEventPresentationDependencies,
} from './FocusedEventPresentation';
import { GhostShipAppearance } from './GhostShipAppearance';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

const SPEED = 2.4;
const DISTANCE = 120;
const START_X = 56;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export class GhostShipPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly ship = new Group();
  private readonly wash = new PointLight(0x55ff8c, 0, 18, 1.5);
  private readonly appearance: GhostShipAppearance;
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly direction = new Vector3();
  private readonly animation = new TimedPresentationAnimation<'signaled'>(
    (_kind, _time, progress) => this.sampleSignal(progress),
    () => { this.wash.intensity = 0; },
  );
  private readonly radius: number;
  private readonly viewSlope: number;
  private passResolve: (() => void) | null = null;
  private elapsed = 0;
  private cruising = false;
  private staged = false;
  private disposed = false;

  constructor(private readonly dependencies: FocusedEventPresentationDependencies) {
    const model = dependencies.propModels.createEventModel('ghostShip')?.root;
    if (model === undefined || !hasRenderableBounds(model)) throw new Error('Missing required Ghost Ship event model.');
    this.root.name = 'focused-event:ghost-ship';
    this.root.userData.motionSource = 'steady-authored-path';
    this.root.userData.holdOnClear = false;
    this.ship.name = 'ghost-ship-vessel';
    model.name = 'event-model:ghostShip';
    this.ship.add(model);
    const bounds = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
    this.radius = bounds.radius + bounds.center.length();
    this.viewSlope = Math.tan(dependencies.camera.fov * Math.PI / 360);
    this.appearance = new GhostShipAppearance(model);
    this.wash.name = 'ghost-ship-player-light';
    this.wash.position.set(0, 2.5, -1);
    this.root.add(this.ship, this.wash);
    collectMeshResources(this.root, this.geometries, this.materials);
    this.clear();
  }

  itemAimTarget(): Group | null { return this.staged ? this.ship : null; }

  hasPassed(): boolean {
    // Use the normal field of view so binocular zoom cannot end the crossing early.
    const viewEdge = (DISTANCE + this.radius) * this.viewSlope * this.dependencies.camera.aspect;
    return this.staged && this.ship.position.x * this.direction.x
      > Math.max(START_X, viewEdge) + this.radius + 10;
  }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.clear();
    const side = eventSideFromSeed(variantSeed);
    this.ship.position.set(side * START_X, 0, -DISTANCE);
    this.ship.rotation.set(0, -side * Math.PI / 2, 0);
    this.direction.set(-side, 0, 0);
    this.appearance.setStrength(1);
    this.elapsed = 0;
    this.staged = true;
    this.cruising = true;
    this.root.visible = true;
    this.root.userData.eventSide = side === -1 ? 'left' : 'right';
    this.root.userData.state = 'staged';
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    this.root.userData.state = 'revealed';
    return Promise.resolve();
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!['spyglass', 'flashlight', 'flareGun', 'shotgun', 'sleep'].includes(choice.choiceId)) {
      throw new Error(`Unsupported Ghost Ship choice: ${choice.choiceId}`);
    }
    // The shared item controller owns tool motion and sound.
    return Promise.resolve();
  }

  react(result: EventResultPresentation, _outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'ghost-ship') throw new Error(`Ghost Ship received result for ${result.eventId}.`);
    if (result.resultId !== 'ghost-ship-pass' && result.resultId !== 'ghost-ship-signaled') {
      throw new Error(`Unsupported Ghost Ship result: ${result.resultId}`);
    }
    this.animation.settle();
    this.resolvePass();
    const signaled = result.resultId === 'ghost-ship-signaled';
    this.root.userData.state = signaled ? 'signaled' : 'pass';
    if (signaled) {
      void this.animation.start('signaled', 6);
      this.sampleSignal(0);
    }
    if (this.hasPassed() && !this.animation.active) {
      this.finish();
      return Promise.resolve();
    }
    return new Promise((resolve) => { this.passResolve = resolve; });
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged || !Number.isFinite(delta) || delta < 0) return;
    this.elapsed += delta;
    if (this.cruising) this.ship.position.addScaledVector(this.direction, SPEED * delta);
    this.ship.position.y = Math.sin(this.elapsed * 0.45) * 0.12;
    this.ship.rotation.z = Math.sin(this.elapsed * 0.3) * 0.008;
    this.animation.update(this.elapsed, delta);
    if (this.passResolve !== null && this.hasPassed() && !this.animation.active) this.finish();
  }

  settleForVisibilityChange(): void {
    if (!this.disposed) this.animation.settle();
  }

  clear(): void {
    this.animation.cancel();
    this.resolvePass();
    this.cruising = false;
    this.staged = false;
    this.root.visible = false;
    this.wash.intensity = 0;
    this.appearance.setStrength(0);
    this.root.userData.state = 'idle';
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.wash.dispose();
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private sampleSignal(progress: number): void {
    const chill = smoothstep(clamp((progress - 0.3) / 0.2))
      * (1 - smoothstep(clamp((progress - 0.65) / 0.35)));
    this.wash.intensity = chill * 35;
  }

  private finish(): void {
    this.root.userData.state = 'departed';
    this.cruising = false;
    this.staged = false;
    this.root.visible = false;
    this.wash.intensity = 0;
    this.resolvePass();
  }

  private resolvePass(): void {
    const resolve = this.passResolve;
    this.passResolve = null;
    resolve?.();
  }
}
