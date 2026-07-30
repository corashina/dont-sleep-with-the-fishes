import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { BorrowedSupplyActor } from '../BoatSupplyDisplay';
import type {
  DedicatedEventEnvironment,
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

type ActiveLeakAnimation =
  | {
      readonly kind: 'reveal';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'item';
      readonly choiceId: string;
      readonly instanceId: ItemInstanceId;
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

const LEAK_X = 1.06;
const LEAK_Y = 0.72;
const LEAK_Z = -0.54;
const WATER_OPACITY = 0.72;

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

export class LeakPresentation implements DedicatedEventPresentation {
  readonly eventId = 'leak' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly modelInstance;
  private readonly seamMaterial = new MeshStandardMaterial({
    color: 0x3b251c,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });
  private readonly wetMaterial = makeWaterMaterial(0x183d46, 0);
  private readonly jetMaterial = makeWaterMaterial(0x58bfd0, 0);
  private readonly dripMaterial = makeWaterMaterial(0x65c8d4, 0);
  private readonly splashMaterial = makeWaterMaterial(0x72d1d8, 0);
  private readonly interiorMaterial = makeWaterMaterial(0x2b8798, 0);
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly planks: Group;
  private readonly seam: Mesh;
  private readonly wetBand: Mesh;
  private readonly jet: Mesh;
  private readonly drips: readonly Mesh[];
  private readonly splashes: readonly Mesh[];
  private readonly interiorWater: Mesh;
  private readonly sample: LeakSample = identityLeakSample();
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
  private active: ActiveLeakAnimation | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'leak-world';
    this.boatRoot.name = 'leak-boat';

    this.modelInstance = environment.eventModels.create('leakPlanks');
    this.planks = this.modelInstance.root;
    this.planks.name = 'leak-planks';
    this.planks.position.set(LEAK_X, LEAK_Y, LEAK_Z);
    this.planks.rotation.set(-0.04, -0.12, 0.08);
    setFlatShading(this.planks);

    this.ownedMaterials.add(this.seamMaterial);
    this.ownedMaterials.add(this.wetMaterial);
    this.ownedMaterials.add(this.jetMaterial);
    this.ownedMaterials.add(this.dripMaterial);
    this.ownedMaterials.add(this.splashMaterial);
    this.ownedMaterials.add(this.interiorMaterial);

    const seamGeometry = new BoxGeometry(1.16, 0.045, 0.055, 3, 1, 1);
    this.ownedGeometries.add(seamGeometry);
    this.seam = new Mesh(seamGeometry, this.seamMaterial);
    this.seam.name = 'leak-seam';
    this.seam.position.set(LEAK_X + 0.03, LEAK_Y - 0.06, LEAK_Z - 0.055);
    this.seam.rotation.set(-0.04, -0.12, 0.11);
    this.seam.castShadow = true;
    this.seam.receiveShadow = true;

    const wetGeometry = new BoxGeometry(1.34, 0.095, 0.035, 4, 1, 1);
    this.ownedGeometries.add(wetGeometry);
    this.wetBand = new Mesh(wetGeometry, this.wetMaterial);
    this.wetBand.name = 'leak-wet-band';
    this.wetBand.position.set(LEAK_X + 0.02, LEAK_Y - 0.065, LEAK_Z - 0.09);
    this.wetBand.rotation.copy(this.seam.rotation);
    this.wetBand.renderOrder = 1;

    const jetGeometry = new CylinderGeometry(0.035, 0.08, 0.92, 6, 2, true);
    this.ownedGeometries.add(jetGeometry);
    this.jet = new Mesh(jetGeometry, this.jetMaterial);
    this.jet.name = 'leak-water-jet';
    this.jet.position.set(LEAK_X + 0.12, LEAK_Y - 0.42, LEAK_Z - 0.12);
    this.jet.rotation.set(0.06, 0.02, -0.12);
    this.jet.renderOrder = 2;

    const dripGeometry = new SphereGeometry(0.036, 5, 3);
    this.ownedGeometries.add(dripGeometry);
    const drips: Mesh[] = [];
    for (let index = 0; index < 8; index += 1) {
      const drip = new Mesh(dripGeometry, this.dripMaterial);
      drip.name = `leak-drip-${index + 1}`;
      drip.position.set(
        LEAK_X - 0.47 + index * 0.14,
        LEAK_Y - 0.18 - (index % 3) * 0.09,
        LEAK_Z - 0.13 - (index % 2) * 0.025,
      );
      drip.scale.set(0.72 + (index % 2) * 0.22, 1.4, 0.78);
      drip.renderOrder = 2;
      drips.push(drip);
    }
    this.drips = drips;

    const splashGeometry = new TorusGeometry(0.11, 0.015, 4, 9);
    this.ownedGeometries.add(splashGeometry);
    const splashes: Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const splash = new Mesh(splashGeometry, this.splashMaterial);
      splash.name = `leak-splash-${index + 1}`;
      splash.position.set(
        LEAK_X - 0.34 + index * 0.14,
        0.18 + (index % 2) * 0.018,
        LEAK_Z - 0.08 - (index % 3) * 0.07,
      );
      splash.rotation.set(Math.PI / 2, 0, (index - 2.5) * 0.09);
      splash.renderOrder = 2;
      splashes.push(splash);
    }
    this.splashes = splashes;

    const interiorGeometry = new BoxGeometry(2.7, 0.025, 1.62, 6, 1, 4);
    this.ownedGeometries.add(interiorGeometry);
    this.interiorWater = new Mesh(interiorGeometry, this.interiorMaterial);
    this.interiorWater.name = 'leak-interior-water';
    this.interiorWater.position.set(0.56, 0.105, -0.32);
    this.interiorWater.renderOrder = 1;

    this.boatRoot.add(
      this.planks,
      this.seam,
      this.wetBand,
      this.jet,
      ...this.drips,
      ...this.splashes,
      this.interiorWater,
    );
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'leak') return;
    this.clear();
    this.staged = true;
    this.boatRoot.visible = true;
    this.planks.visible = true;
    this.seam.visible = true;
    this.wetBand.visible = true;
    this.wetMaterial.opacity = 0.2;
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
    sampleLeakItemUse(choiceId, 0, this.sample);
    this.borrowedActor!.applyPose(this.sample);
    this.applyHeldLeak(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        instanceId,
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
    if (active === null) {
      this.updateInteriorWave(time);
      return;
    }

    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    switch (active.kind) {
      case 'reveal':
        sampleLeakReveal(progress, this.sample);
        break;
      case 'item':
        sampleLeakItemUse(active.choiceId, progress, this.sample);
        this.borrowedActor?.applyPose(this.sample);
        break;
      case 'reaction':
        sampleLeakReaction(this.reactionState, progress, this.sample);
        this.borrowedActor?.applyPose(this.sample);
        break;
    }
    this.applySample(time);
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
        this.borrowedActor?.applyPose(this.sample);
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
    this.resolveCancelled(active);

    runCleanupSteps([
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

  private finishActive(time: number): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    if (active.kind === 'item') {
      sampleLeakItemUse(active.choiceId, 1, this.sample);
      this.borrowedActor?.applyPose(this.sample);
      this.applyHeldLeak(time);
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

  private resolveCancelled(active: ActiveLeakAnimation | null): void {
    if (active?.kind === 'item') active.resolve(false);
    else active?.resolve();
  }

  private applyHeldLeak(time: number): void {
    sampleLeakReveal(1, this.sample);
    this.applySample(time);
  }

  private applySample(time: number): void {
    this.boatRoot.position.set(this.sample.boatKick, 0, this.sample.cameraPush * 0.2);
    this.boatRoot.rotation.set(0, 0, this.sample.boatKick * 0.55);

    const jetStrength = Math.max(0, this.sample.jetStrength);
    this.jet.visible = jetStrength > 0.008;
    this.jet.scale.set(
      0.82 + Math.min(1.6, jetStrength) * 0.18,
      0.04 + jetStrength * 0.96,
      0.82 + Math.min(1.6, jetStrength) * 0.18,
    );
    this.jetMaterial.opacity = Math.min(WATER_OPACITY, jetStrength * WATER_OPACITY);

    this.wetBand.visible = this.sample.wetBand > 0.008;
    this.wetMaterial.opacity = this.sample.wetBand * 0.34;

    const dripStrength = Math.max(0, this.sample.dripStrength);
    this.dripMaterial.opacity = Math.min(0.68, dripStrength * 0.74);
    for (let index = 0; index < this.drips.length; index += 1) {
      const drip = this.drips[index]!;
      drip.visible = dripStrength > (index % 4) * 0.07;
      const fall = dripStrength * (0.72 + (index % 3) * 0.13);
      drip.scale.set(
        0.72 + (index % 2) * 0.22,
        0.55 + fall * (1.2 + (index % 2) * 0.24),
        0.78,
      );
      drip.position.y = LEAK_Y - 0.18 - (index % 3) * 0.09
        - Math.sin(time * 5.2 + index * 1.7) * 0.035 * dripStrength;
    }

    const splashStrength = Math.max(
      this.sample.splashStrength,
      this.sample.surgeStrength,
    );
    this.splashMaterial.opacity = Math.min(0.7, splashStrength * 0.72);
    for (let index = 0; index < this.splashes.length; index += 1) {
      const splash = this.splashes[index]!;
      splash.visible = splashStrength > index * 0.075;
      const scale = 0.28 + splashStrength * (0.74 + index * 0.055);
      splash.scale.set(scale, scale, scale);
    }

    this.interiorWater.visible = this.sample.interiorWater > 0.008;
    this.interiorMaterial.opacity = Math.min(0.48, this.sample.interiorWater * 0.52);
    this.updateInteriorWave(time);
  }

  private updateInteriorWave(time: number): void {
    if (!this.interiorWater.visible) return;
    this.environment.sampleWorldWaveInto(
      this.waveSample,
      time,
      0.56,
      -0.32,
      0.16,
    );
    this.interiorWater.position.y = 0.105
      + this.sample.interiorWater * 0.055
      + this.waveSample.height * 0.018;
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
    this.planks.visible = false;
    this.seam.visible = false;
    this.wetBand.visible = false;
    this.jet.visible = false;
    this.interiorWater.visible = false;
    this.wetMaterial.opacity = 0;
    this.jetMaterial.opacity = 0;
    this.dripMaterial.opacity = 0;
    this.splashMaterial.opacity = 0;
    this.interiorMaterial.opacity = 0;
    for (const drip of this.drips) drip.visible = false;
    for (const splash of this.splashes) splash.visible = false;
  }
}
