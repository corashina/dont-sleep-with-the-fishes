import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { ItemId, ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import { FishingBiteParticles } from '../FishingBiteParticles';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import { borrowSupplyActor, releaseSupplyActor } from '../BoatSupplyDisplay';
import type { BorrowedSupplyActor } from '../BoatSupplyDisplay';
import {
  createEventItemUseSample,
  resolveEventItemUseContext,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../eventItemUseChoreography';
import { resolveCancelledEventAnimation } from '../eventPresentationTypes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventAnimation,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  identityLeakSample,
  LEAK_ITEM_DURATION,
  LEAK_REACTION_DURATION,
  LEAK_REVEAL_DURATION,
  sampleLeakItemUse,
  sampleLeakReaction,
  sampleLeakReveal,
  type LeakSample,
} from './leakChoreography';

interface LeakHolePlacement {
  readonly side: -1 | 1;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly streamScale: number;
}

const LEAK_SIDES = [-1, 1] as const;
const LEAK_HOLES: readonly LeakHolePlacement[] = LEAK_SIDES.flatMap((side) => [
  { side, y: 0.2, z: -0.94, scaleX: 0.2, scaleY: 0.12, rotation: -0.16, streamScale: 1 },
  { side, y: -0.03, z: -0.34, scaleX: 0.16, scaleY: 0.1, rotation: 0.23, streamScale: 0.55 },
  { side, y: 0.12, z: 0.18, scaleX: 0.18, scaleY: 0.11, rotation: -0.08, streamScale: 0.84 },
]);
const HOLE_X = 1.57;
const STREAM_X = 1.85;
const STREAM_DROP = 0.21;
const INTERIOR_WATER_Y = -0.25;
const WATER_OPACITY = 0.72;

const INTERIOR_WATER_STATIONS = Object.freeze([
  { z: -3, halfWidth: 0.28 },
  { z: -2.65, halfWidth: 0.98 },
  { z: -2.08, halfWidth: 1.46 },
  { z: -1.12, halfWidth: 1.61 },
  { z: 0, halfWidth: 1.61 },
  { z: 1.18, halfWidth: 1.58 },
  { z: 2.2, halfWidth: 1.26 },
  { z: 2.72, halfWidth: 0.68 },
  { z: 3, halfWidth: 0.28 },
]);

function createInteriorWaterGeometry(): ShapeGeometry {
  const shape = new Shape();
  const [first, ...starboard] = INTERIOR_WATER_STATIONS;
  if (first === undefined) throw new Error('Leak water requires hull stations.');
  shape.moveTo(first.halfWidth, -first.z);
  for (const station of starboard) shape.lineTo(station.halfWidth, -station.z);
  for (let index = INTERIOR_WATER_STATIONS.length - 1; index >= 0; index -= 1) {
    const station = INTERIOR_WATER_STATIONS[index]!;
    shape.lineTo(-station.halfWidth, -station.z);
  }
  shape.closePath();
  const geometry = new ShapeGeometry(shape, 10);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeWaterMaterial(color: number, opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.16,
    roughness: 0.28,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
}

export class LeakPresentation implements DedicatedEventPresentation {
  readonly eventId = 'leak' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly holeMaterial = new MeshStandardMaterial({
    color: 0x10171a,
    emissive: 0x05090a,
    emissiveIntensity: 0.12,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly streamMaterial = makeWaterMaterial(0x58bfd0, 0);
  private readonly interiorMaterial = makeWaterMaterial(0x2b8798, 0);
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly holes: readonly Mesh[];
  private readonly streams: readonly Mesh[];
  private readonly spray = new FishingBiteParticles();
  private readonly sprayOrigin = new Vector3();
  private readonly interiorWater: Mesh;
  private readonly sample: LeakSample = identityLeakSample();
  private readonly itemUseSample = createEventItemUseSample();
  private readonly reactionState: {
    safe: boolean;
    brokenItem: boolean;
    consumedItem: boolean;
    hullDamage: boolean;
    lostItem: boolean;
  } = {
    safe: true,
    brokenItem: false,
    consumedItem: false,
    hullDamage: false,
    lostItem: false,
  };
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private active: DedicatedEventAnimation<{
    readonly instanceId: ItemInstanceId;
    readonly itemId: ItemId;
    readonly itemUseContext: EventItemUseContext;
  }> | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private sprayElapsed = 0;
  private sprayHoleIndex = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'leak-world';
    this.boatRoot.name = 'leak-boat';

    this.ownedMaterials.add(this.holeMaterial);
    this.ownedMaterials.add(this.streamMaterial);
    this.ownedMaterials.add(this.interiorMaterial);

    const holeShape = new Shape();
    holeShape.moveTo(-0.92, -0.18);
    holeShape.lineTo(-0.48, -0.82);
    holeShape.lineTo(0.18, -0.94);
    holeShape.lineTo(0.88, -0.42);
    holeShape.lineTo(0.72, 0.28);
    holeShape.lineTo(0.14, 0.92);
    holeShape.lineTo(-0.66, 0.7);
    holeShape.closePath();
    const holeGeometry = new ShapeGeometry(holeShape);
    const streamGeometry = new CylinderGeometry(0.012, 0.026, 0.62, 5, 2, true);
    this.ownedGeometries.add(holeGeometry);
    this.ownedGeometries.add(streamGeometry);
    const holes: Mesh[] = [];
    const streams: Mesh[] = [];
    for (let index = 0; index < LEAK_HOLES.length; index += 1) {
      const placement = LEAK_HOLES[index]!;
      const hole = new Mesh(holeGeometry, this.holeMaterial);
      hole.name = `leak-hole-${index + 1}`;
      hole.position.set(placement.side * HOLE_X, placement.y, placement.z);
      hole.rotation.set(
        0,
        placement.side * Math.PI / 2,
        placement.side * placement.rotation,
      );
      hole.scale.set(placement.scaleX, placement.scaleY, 1);
      hole.renderOrder = 1;
      holes.push(hole);

      const stream = new Mesh(streamGeometry, this.streamMaterial);
      stream.name = `leak-stream-${index + 1}`;
      stream.position.set(
        placement.side * STREAM_X,
        placement.y - STREAM_DROP,
        placement.z,
      );
      const sideIndex = index % 3;
      stream.rotation.set(0, 0, placement.side * (0.72 + sideIndex * 0.08));
      stream.renderOrder = 2;
      streams.push(stream);
    }
    this.holes = holes;
    this.streams = streams;

    this.spray.points.name = 'leak-spray-particles';
    this.spray.points.renderOrder = 3;

    const interiorGeometry = createInteriorWaterGeometry();
    this.ownedGeometries.add(interiorGeometry);
    this.interiorWater = new Mesh(interiorGeometry, this.interiorMaterial);
    this.interiorWater.name = 'leak-interior-water';
    this.interiorWater.position.set(0, INTERIOR_WATER_Y, 0);
    this.interiorWater.renderOrder = 1;

    this.boatRoot.add(
      ...this.holes,
      ...this.streams,
      this.spray.points,
      this.interiorWater,
    );
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'leak') return;
    this.clear();
    this.staged = true;
    this.boatRoot.visible = true;
    for (const hole of this.holes) hole.visible = true;
    this.sprayElapsed = 0;
    this.sprayHoleIndex = 0;
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    sampleLeakReveal(0, this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: LEAK_REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || (choiceId !== 'ductTape' && choiceId !== 'bucket' && choiceId !== 'map')
    ) {
      return Promise.resolve(false);
    }
    this.cancelActive();
    if (!this.borrowActor(instanceId)) return Promise.resolve(false);
    const itemId = this.environment.supplies.itemType(instanceId);
    if (itemId === null) return Promise.resolve(false);
    const itemUseContext = resolveEventItemUseContext(this.eventId, choiceId, itemId);
    if (itemUseContext === null) return Promise.resolve(false);
    this.environment.itemUseAdapter.begin(this.borrowedActor!);
    sampleLeakItemUse(choiceId, 0, this.sample);
    sampleEventItemUse(itemUseContext, itemId, 0, this.itemUseSample);
    this.environment.itemUseAdapter.apply(this.itemUseSample);
    this.applyHeldLeak(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        instanceId,
        itemId,
        itemUseContext,
        elapsed: 0,
        duration: LEAK_ITEM_DURATION,
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
    const selectedConsumed = selected !== null
      && result.consumedInstanceIds.includes(selected);
    const lost = result.lostInstanceIds[0] ?? null;
    const hullDamage = (result.resourceDeltas.hull ?? 0) < 0;

    if (lost !== null) this.borrowActor(lost);
    else if (selectedBroken && selected !== null) this.borrowActor(selected);
    else if (selectedConsumed && selected !== null) this.borrowActor(selected);

    this.reactionState.brokenItem = selectedBroken;
    this.reactionState.consumedItem = selectedConsumed;
    this.reactionState.hullDamage = hullDamage;
    this.reactionState.lostItem = lost !== null;
    this.reactionState.safe = !selectedBroken && !hullDamage && lost === null;
    sampleLeakReaction(this.reactionState, 0, this.sample);
    this.borrowedActor?.applyPose(this.sample);
    this.applyHeldLeak(0);

    return new Promise((resolve) => {
      this.active = {
        kind: 'reaction',
        elapsed: 0,
        duration: LEAK_REACTION_DURATION,
        resolve,
      };
    });
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (active === null) {
      this.updateInteriorWave(time);
      this.updateSpray(safeDelta);
      return;
    }

    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    switch (active.kind) {
      case 'reveal':
        sampleLeakReveal(progress, this.sample);
        break;
      case 'item':
        sampleLeakItemUse(active.choiceId, progress, this.sample);
        sampleEventItemUse(
          active.itemUseContext, active.itemId, progress, this.itemUseSample,
        );
        this.environment.itemUseAdapter.apply(this.itemUseSample);
        break;
      case 'reaction':
        sampleLeakReaction(this.reactionState, progress, this.sample);
        this.borrowedActor?.applyPose(this.sample);
        break;
    }
    this.applySample(time);
    this.updateSpray(safeDelta);
    if (progress === 1) this.finishActive(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.active.elapsed = this.active.duration;
    switch (this.active.kind) {
      case 'reveal':
        sampleLeakReveal(1, this.sample);
        break;
      case 'item':
        sampleLeakItemUse(this.active.choiceId, 1, this.sample);
        sampleEventItemUse(
          this.active.itemUseContext, this.active.itemId, 1, this.itemUseSample,
        );
        this.environment.itemUseAdapter.apply(this.itemUseSample);
        break;
      case 'reaction':
        sampleLeakReaction(this.reactionState, 1, this.sample);
        this.borrowedActor?.applyPose(this.sample);
        break;
    }
    this.applySample(0);
    this.finishActive(0);
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
    if (active?.kind === 'item') this.environment.itemUseAdapter.clear();
    resolveCancelledEventAnimation(active);

    runCleanupSteps([
      () => actor?.release(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.spray.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private borrowActor(instanceId: ItemInstanceId): boolean {
    this.borrowedActor = borrowSupplyActor(
      this.borrowedActor, this.environment.supplies, instanceId,
    );
    return this.borrowedActor !== null;
  }

  private releaseActor(): void {
    this.borrowedActor = releaseSupplyActor(this.borrowedActor);
  }

  private finishActive(time: number): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    if (active.kind === 'item') {
      sampleLeakItemUse(active.choiceId, 1, this.sample);
      sampleEventItemUse(
        active.itemUseContext, active.itemId, 1, this.itemUseSample,
      );
      this.environment.itemUseAdapter.apply(this.itemUseSample);
      this.applyHeldLeak(time);
      this.environment.itemUseAdapter.clear();
      active.resolve(true);
      return;
    }
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    if (active?.kind === 'item') this.environment.itemUseAdapter.clear();
    resolveCancelledEventAnimation(active);
  }

  private applyHeldLeak(time: number): void {
    sampleLeakReveal(1, this.sample);
    this.applySample(time);
  }

  private applySample(time: number): void {
    this.boatRoot.position.set(this.sample.boatKick, 0, this.sample.cameraPush * 0.2);
    this.boatRoot.rotation.set(0, 0, this.sample.boatKick * 0.55);

    const streamStrength = Math.max(
      this.sample.jetStrength,
      this.sample.dripStrength * 0.42,
    );
    this.streamMaterial.opacity = Math.min(
      WATER_OPACITY,
      streamStrength * WATER_OPACITY,
    );
    for (let index = 0; index < this.streams.length; index += 1) {
      const stream = this.streams[index]!;
      const localStrength = streamStrength * (0.78 + index * 0.1);
      stream.visible = localStrength > 0.025;
      stream.scale.set(
        0.7 + index * 0.08,
        (0.1 + localStrength * 0.96) * LEAK_HOLES[index]!.streamScale,
        0.7 + index * 0.08,
      );
    }
    this.spray.points.visible = streamStrength > 0.08;

    this.interiorWater.visible = this.sample.interiorWater > 0.008;
    this.interiorMaterial.opacity = Math.min(0.24, this.sample.interiorWater * 0.26);
    this.updateInteriorWave(time);
  }

  private updateSpray(delta: number): void {
    this.spray.update(delta);
    if (!this.spray.points.visible || delta <= 0) return;
    this.sprayElapsed += delta;
    while (this.sprayElapsed >= 0.22) {
      this.sprayElapsed -= 0.22;
      const placement = LEAK_HOLES[this.sprayHoleIndex]!;
      this.sprayOrigin.set(
        placement.side * (HOLE_X + 0.04),
        placement.y - 0.04,
        placement.z,
      );
      this.spray.emit(this.sprayOrigin, 0.24 + this.sprayHoleIndex * 0.06);
      this.sprayHoleIndex = (this.sprayHoleIndex + 1) % LEAK_HOLES.length;
    }
  }

  private updateInteriorWave(time: number): void {
    if (!this.interiorWater.visible) return;
    this.environment.sampleWorldWaveInto(
      this.waveSample,
      time,
      0,
      0,
      0.16,
    );
    this.interiorWater.position.y = INTERIOR_WATER_Y
      + this.sample.interiorWater * 0.008
      + this.waveSample.height * 0.004;
    this.interiorWater.rotation.set(
      this.waveSample.normal.z * 0.035,
      0,
      -this.waveSample.normal.x * 0.035,
    );
  }

  private hideScene(): void {
    this.boatRoot.visible = false;
    this.boatRoot.position.set(0, 0, 0);
    this.boatRoot.rotation.set(0, 0, 0);
    for (const hole of this.holes) hole.visible = false;
    for (const stream of this.streams) stream.visible = false;
    this.spray.points.visible = false;
    this.spray.reset();
    this.sprayElapsed = 0;
    this.sprayHoleIndex = 0;
    this.interiorWater.visible = false;
    this.streamMaterial.opacity = 0;
    this.interiorMaterial.opacity = 0;
  }
}
