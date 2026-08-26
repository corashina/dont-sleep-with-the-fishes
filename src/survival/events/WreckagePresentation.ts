import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { runCleanupSteps } from '../../world/SceneResources';
import type { EventModelInstance } from '../EventModelLibrary';
import type { FocusedEventInteractionTarget } from '../FocusedEventPresentation';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  createWreckageSample,
  sampleWreckageBeat,
  wreckageBeatDuration,
  type WreckageBeat,
  type WreckageSample,
} from './wreckageChoreography';

type SurfaceDebrisKind = 'box' | 'crate' | 'pallet' | 'plank';

interface SurfaceDebrisPlacement {
  readonly kind: SurfaceDebrisKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

interface ActiveWreckageBeat {
  readonly beat: WreckageBeat;
  elapsed: number;
  readonly resolve: () => void;
}

const SURFACE_DEBRIS = Object.freeze([
  { kind: 'box', x: 2.65, y: 0.04, z: -4.10, yaw: 0.34, scale: 0.82 },
  { kind: 'crate', x: 4.15, y: 0.07, z: -5.25, yaw: -0.46, scale: 0.88 },
  { kind: 'pallet', x: 5.55, y: 0.02, z: -6.75, yaw: 0.72, scale: 0.92 },
  { kind: 'plank', x: 3.05, y: 0.10, z: -5.65, yaw: 0.18, scale: 0.95 },
  { kind: 'plank', x: 4.85, y: 0.06, z: -7.55, yaw: -0.62, scale: 0.78 },
  { kind: 'plank', x: 2.75, y: 0.08, z: -7.95, yaw: 1.02, scale: 0.70 },
  { kind: 'plank', x: 5.95, y: 0.03, z: -8.65, yaw: -0.20, scale: 0.62 },
  { kind: 'plank', x: 3.95, y: 0.12, z: -9.20, yaw: 0.58, scale: 0.56 },
] as const satisfies readonly SurfaceDebrisPlacement[]);

const SURFACE_TILT = Object.freeze([
  { pitch: -0.03, roll: -0.04 },
  { pitch: 0.02, roll: 0.06 },
  { pitch: -0.01, roll: -0.05 },
  { pitch: 0.03, roll: 0.07 },
  { pitch: -0.04, roll: -0.06 },
  { pitch: 0.05, roll: 0.04 },
  { pitch: -0.02, roll: -0.03 },
  { pitch: 0.04, roll: 0.05 },
] as const);

const PLANK_START_INDEX = 3;
const TARGET_ID = 'event:wreckage';

function createPlankGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -1.00, 0.08, -0.18,
    1.08, 0.08, -0.13,
    0.94, 0.08, 0.20,
    -0.90, 0.08, 0.16,
    -1.00, -0.08, -0.18,
    1.08, -0.08, -0.13,
    0.94, -0.08, 0.20,
    -0.90, -0.08, 0.16,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    7, 6, 5, 7, 5, 4,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 30, 1);
  geometry.computeVertexNormals();
  return geometry;
}

export class WreckagePresentation implements DedicatedEventPresentation {
  readonly eventId = 'wreckage' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Object3D();

  private readonly debris = new Group();
  private readonly shipPlacement = new Group();
  private readonly ship: EventModelInstance;
  private readonly box: EventModelInstance;
  private readonly crate: EventModelInstance;
  private readonly pallet: EventModelInstance;
  private readonly plankGeometry = createPlankGeometry();
  private readonly plankMaterials = [
    new MeshStandardMaterial({
      color: 0x8a5a35,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    }),
    new MeshStandardMaterial({
      color: 0x5f3a24,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    }),
  ];
  private readonly surfaceObjects: Object3D[] = [];
  private readonly sample: WreckageSample = createWreckageSample();
  private readonly targets: readonly FocusedEventInteractionTarget[];
  private active: ActiveWreckageBeat | null = null;
  private surfaceSeedOffset = 0;
  private surfaceTime = 0;
  private staged = false;
  private disposed = false;

  constructor(environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'wreckage-world';
    this.boatRoot.name = 'wreckage-boat';
    this.debris.name = 'wreckage-surface-debris';

    this.ship = environment.eventModels.create('containerShip');
    this.box = environment.eventModels.create('wreckageBox');
    this.crate = environment.eventModels.create('wreckageCrate');
    this.pallet = environment.eventModels.create('wreckagePallet');

    this.shipPlacement.name = 'wreckage-wreck';
    this.shipPlacement.position.set(0, -7.2, -11.5);
    this.shipPlacement.rotation.set(0.18, -0.42, -0.12);
    this.shipPlacement.visible = false;
    this.shipPlacement.add(this.ship.root);

    this.addModelDebris(this.box.root, 'wreckage-box');
    this.addModelDebris(this.crate.root, 'wreckage-crate');
    this.addModelDebris(this.pallet.root, 'wreckage-pallet');
    for (let index = PLANK_START_INDEX; index < SURFACE_DEBRIS.length; index += 1) {
      const plank = new Mesh(this.plankGeometry, this.plankMaterials);
      plank.name = `wreckage-plank-${index - PLANK_START_INDEX}`;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.surfaceObjects.push(plank);
      this.debris.add(plank);
    }

    this.itemAimTarget.name = 'wreckage-item-aim-target';
    this.itemAimTarget.position.set(4.3, 0.08, -6.65);
    this.targets = Object.freeze([Object.freeze({
      id: TARGET_ID,
      label: 'WRECKAGE',
      description: 'Inspect the floating debris.',
      focusEventId: 'wreckage' as const,
      root: this.debris,
      tooltip: false,
      minimumHitWidth: 96,
      minimumHitHeight: 72,
    })]);

    this.worldRoot.add(this.debris, this.shipPlacement, this.itemAimTarget);
    this.updateFloatingDebris();
    this.hideScene();
  }

  interactionTargets(): readonly FocusedEventInteractionTarget[] {
    return this.disposed ? EMPTY_TARGETS : this.targets;
  }

  interactionRoot(id: string): Object3D | null {
    return !this.disposed && id === TARGET_ID ? this.debris : null;
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.cancelActive();
    const seed = Number.isFinite(context.variantSeed) ? Math.trunc(context.variantSeed) : 0;
    this.surfaceSeedOffset = seed % 7;
    this.surfaceTime = 0;
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.shipPlacement.visible = false;
    this.updateFloatingDebris();
    sampleWreckageBeat('reveal', 0, this.sample);
    this.applySample();
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    return this.startBeat('reveal');
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  playChoice(choiceId: string): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    return choiceId === 'leave' ? this.startBeat('leave') : Promise.resolve();
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    return Promise.resolve(false);
  }

  react(_result: EventOutcomePresentation): Promise<void> {
    return Promise.resolve();
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    if (Number.isFinite(time)) this.surfaceTime = time;
    this.updateFloatingDebris();
    const active = this.active;
    if (active === null || !Number.isFinite(delta) || delta <= 0) return;
    const duration = wreckageBeatDuration(active.beat);
    active.elapsed = Math.min(duration, active.elapsed + delta);
    sampleWreckageBeat(active.beat, active.elapsed, this.sample);
    this.applySample();
    if (active.elapsed < duration) return;
    this.active = null;
    if (active.beat === 'reveal') {
      sampleWreckageBeat('surface-hold', 0, this.sample);
      this.applySample();
    }
    active.resolve();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const active = this.active;
    if (active === null) return;
    active.elapsed = wreckageBeatDuration(active.beat);
    sampleWreckageBeat(active.beat, active.elapsed, this.sample);
    this.applySample();
    this.active = null;
    if (active.beat === 'reveal') {
      sampleWreckageBeat('surface-hold', 0, this.sample);
      this.applySample();
    }
    active.resolve();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.staged = false;
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.cancelActive(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.ship.dispose(),
      () => this.box.dispose(),
      () => this.crate.dispose(),
      () => this.pallet.dispose(),
      () => this.plankGeometry.dispose(),
      ...this.plankMaterials.map((material) => () => material.dispose()),
    ]);
  }

  private addModelDebris(root: Group, name: string): void {
    const placement = new Group();
    placement.name = name;
    placement.add(root);
    this.surfaceObjects.push(placement);
    this.debris.add(placement);
  }

  private startBeat(beat: WreckageBeat): Promise<void> {
    this.cancelActive();
    sampleWreckageBeat(beat, 0, this.sample);
    this.applySample();
    return new Promise((resolve) => {
      this.active = { beat, elapsed: 0, resolve };
    });
  }

  private cancelActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    active.resolve();
  }

  private updateFloatingDebris(): void {
    for (let index = 0; index < this.surfaceObjects.length; index += 1) {
      const placement = SURFACE_DEBRIS[index]!;
      const tilt = SURFACE_TILT[index]!;
      const object = this.surfaceObjects[index]!;
      const phase = this.surfaceTime * 0.9 + index * 1.47 + this.surfaceSeedOffset * 0.23;
      object.position.set(
        placement.x,
        placement.y + Math.sin(phase) * 0.045,
        placement.z,
      );
      object.rotation.set(
        tilt.pitch + Math.cos(phase * 0.8) * 0.025,
        placement.yaw,
        tilt.roll + Math.sin(phase * 0.72) * 0.035,
      );
      object.scale.setScalar(placement.scale);
    }
  }

  private applySample(): void {
    this.debris.visible = this.staged && this.sample.debrisAlpha > 0;
    this.worldRoot.visible = this.staged && this.sample.sceneAlpha > 0;
    this.boatRoot.visible = this.worldRoot.visible;
    this.shipPlacement.visible = false;
  }

  private hideScene(): void {
    this.debris.visible = false;
    this.shipPlacement.visible = false;
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
  }
}

const EMPTY_TARGETS: readonly FocusedEventInteractionTarget[] = Object.freeze([]);
