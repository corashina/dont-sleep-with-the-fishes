import { Euler, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { createWaveSample, type WaveSample } from '../ocean/WaveField';
import type { FishingCatchPresentationLibrary } from './FishingPresentation';
import { FishingBiteParticles } from './FishingBiteParticles';
import type { FishingCastPoint } from './FishingSession';
import type { FishingCatchId } from './fishingCatalog';
import { runCleanupSteps } from '../world/SceneResources';
import { boatSupplyTransform } from '../world/BoatStorage';
import { NET_BASKET_CENTER, NetCatchPlacement } from './NetCatchPlacement';

export const NET_HAUL_DURATION = 4.8;
const NET_WATER_CONTACT = 0.24;
const smooth = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/** The model and its materials belong to PropModelLibrary. */
export class NetFishingPresentation {
  readonly root = new Group();
  private readonly basket = new Group();
  private readonly netPivot = new Group();
  private readonly particles = new FishingBiteParticles();
  private readonly catchPlacement: NetCatchPlacement;
  private readonly start = new Vector3(-0.75, 0.48, -2.9);
  private readonly water = new Vector3();
  private readonly waterWorld = new Vector3();
  private readonly rest = new Vector3(-0.45, 0.43, -2.95);
  private readonly splash = new Vector3();
  private readonly wave = createWaveSample();
  private readonly storage = boatSupplyTransform('fishingNet', 0);
  private readonly storageMatrix = new Matrix4().compose(
    this.storage.position,
    new Quaternion().setFromEuler(this.storage.rotation),
    new Vector3().setScalar(this.storage.scale),
  );
  private readonly storageToRoot = new Matrix4();
  private readonly storedPosition = new Vector3();
  private readonly storedRotation = new Quaternion();
  private readonly storedScale = new Vector3();
  private readonly heldRotation = new Quaternion().setFromEuler(new Euler(-0.1, 0, 0));
  private readonly heldScale = new Vector3(1, 1, 1);
  private readonly returnPosition = new Vector3();
  private readonly returnRotation = new Quaternion();
  private readonly returnScale = new Vector3();
  private progress = 0;
  private lastBurst = -1;
  private generation = 0;
  private onWaterImpact: (() => void) | null = null;

  constructor(
    model: Object3D,
    private readonly worldRoot: Object3D,
    private readonly boatRoot: Object3D,
    private readonly sampleWave: (output: WaveSample, x: number, z: number) => void,
    private readonly catchLibrary: FishingCatchPresentationLibrary,
  ) {
    this.root.name = 'fishing-net-haul';
    this.netPivot.name = 'fishing-net-haul-pivot';
    this.basket.name = 'fishing-net-catches';
    this.netPivot.add(model);
    this.catchPlacement = new NetCatchPlacement(model);
    // The existing net's basket center is 0.56 metres ahead of its grip.
    this.basket.position.set(...NET_BASKET_CENTER);
    this.netPivot.add(this.basket);
    this.root.add(this.netPivot);
    boatRoot.add(this.root);
    worldRoot.add(this.particles.points);
    this.root.visible = false;
  }

  show(): void {
    this.clear();
    this.root.visible = true;
    this.samplePickup(0);
  }

  samplePickup(progress: number): void {
    this.updateStoredPose();
    const t = smooth(progress);
    this.netPivot.position.lerpVectors(this.storedPosition, this.start, t);
    this.netPivot.position.y += Math.sin(Math.PI * t) * 0.35;
    // Move the handle clear of the bench before turning the basket toward the water.
    this.netPivot.quaternion.copy(this.storedRotation).slerp(this.heldRotation, smooth((progress - 0.3) / 0.7));
    this.netPivot.scale.lerpVectors(this.storedScale, this.heldScale, t);
  }

  beginReturn(): void {
    this.progress = 1;
    this.returnPosition.copy(this.netPivot.position);
    this.returnRotation.copy(this.netPivot.quaternion);
    this.returnScale.copy(this.netPivot.scale);
    this.basket.visible = false;
    this.root.visible = true;
  }

  sampleReturn(progress: number): void {
    this.updateStoredPose();
    const t = smooth(progress);
    this.netPivot.position.lerpVectors(this.returnPosition, this.storedPosition, t);
    this.netPivot.position.y += Math.sin(Math.PI * t) * 0.35;
    this.netPivot.quaternion.copy(this.returnRotation).slerp(this.storedRotation, smooth(progress / 0.7));
    this.netPivot.scale.lerpVectors(this.returnScale, this.storedScale, t);
  }

  private updateStoredPose(): void {
    this.boatRoot.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    this.storageToRoot.copy(this.root.matrixWorld).invert()
      .multiply(this.boatRoot.matrixWorld).multiply(this.storageMatrix)
      .decompose(this.storedPosition, this.storedRotation, this.storedScale);
  }

  async prepare(catchId: FishingCatchId, point: FishingCastPoint, onWaterImpact?: () => void): Promise<boolean> {
    const generation = ++this.generation;
    this.waterWorld.set(Math.min(1.2, Math.max(-1.2, point.x)), 0, -3.9);
    this.basket.clear();
    const model = await this.catchLibrary.prepare(catchId);
    if (generation !== this.generation) return false;
    if (model !== null) {
      model.rotation.set(0, 0.4, 0);
      this.catchPlacement.place(model);
      this.basket.add(model);
    }
    this.sample(0);
    this.onWaterImpact = onWaterImpact ?? null;
    return true;
  }

  sample(progress: number): void {
    this.netPivot.scale.setScalar(1);
    this.progress = Math.min(1, Math.max(0, progress));
    this.sampleWave(this.wave, this.waterWorld.x, this.waterWorld.z - 0.56);
    this.waterWorld.y = this.wave.height + 0.22;
    this.water.copy(this.waterWorld);
    this.root.worldToLocal(this.water);
    const t = this.progress;
    if (t < 0.28) {
      this.netPivot.position.lerpVectors(this.start, this.water, smooth(t / 0.28));
      this.netPivot.position.y += Math.sin(Math.PI * t / 0.28) * 0.45;
    } else if (t < 0.58) {
      this.netPivot.position.copy(this.water);
      this.netPivot.position.x += Math.sin((t - 0.28) / 0.3 * Math.PI) * 0.65;
    } else {
      const lift = smooth((t - 0.58) / 0.42);
      this.netPivot.position.lerpVectors(this.water, this.rest, lift);
      this.netPivot.position.y += Math.sin(Math.PI * lift) * 0.72;
    }
    this.netPivot.rotation.set(
      -0.1 - Math.sin(Math.PI * t) * 0.5,
      Math.sin(t * Math.PI * 2) * 0.16,
      Math.sin(t * Math.PI * 3) * 0.09 * (1 - t),
    );
    this.basket.visible = t >= 0.58;
    if (t >= NET_WATER_CONTACT && this.onWaterImpact !== null) {
      const onWaterImpact = this.onWaterImpact;
      this.onWaterImpact = null;
      onWaterImpact();
    }
  }

  update(delta: number): void {
    if (!this.root.visible || delta <= 0) return;
    this.particles.update(delta);
    const t = this.progress;
    const burst = Math.floor(t * NET_HAUL_DURATION * 7);
    if (t < NET_WATER_CONTACT || t > 0.91 || burst === this.lastBurst) return;
    this.lastBurst = burst;
    this.basket.getWorldPosition(this.splash);
    this.worldRoot.worldToLocal(this.splash);
    this.particles.emit(this.splash, t < 0.6 ? 0.7 : 0.05, t < 0.6 ? undefined : -0.15);
  }

  clear(): void {
    this.generation += 1;
    this.onWaterImpact = null;
    this.root.visible = false;
    this.basket.clear();
    this.catchLibrary.hide();
    this.particles.reset();
    this.lastBurst = -1;
  }

  dispose(): void {
    this.clear();
    runCleanupSteps([
      () => this.catchLibrary.dispose(),
      () => this.particles.dispose(),
      () => this.particles.points.removeFromParent(),
      () => this.root.removeFromParent(),
    ]);
  }
}
