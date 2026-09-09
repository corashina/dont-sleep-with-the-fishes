import { Box3, Euler, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { createWaveSample, type WaveSample } from '../ocean/WaveField';
import { FishingCatchLibrary } from './FishingCatchLibrary';
import { FishingBiteParticles } from './FishingBiteParticles';
import type { FishingCastPoint, FishingHaul } from './FishingSession';
import { runCleanupSteps } from '../world/SceneResources';
import { boatSupplyTransform } from '../world/BoatStorage';

export const NET_HAUL_DURATION = 4.8;
const smooth = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/** The model and its materials belong to PropModelLibrary. */
export class NetFishingPresentation {
  readonly root = new Group();
  private readonly basket = new Group();
  private readonly netPivot = new Group();
  private readonly catches = [new FishingCatchLibrary(), new FishingCatchLibrary()] as const;
  private readonly particles = new FishingBiteParticles();
  private readonly bounds = new Box3();
  private readonly start = new Vector3(-0.75, 0.7, -2.9);
  private readonly water = new Vector3();
  private readonly rest = new Vector3(-0.45, 0.65, -2.95);
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

  constructor(
    model: Object3D,
    worldRoot: Object3D,
    private readonly boatRoot: Object3D,
    private readonly sampleWave: (output: WaveSample, x: number, z: number) => void,
  ) {
    this.root.name = 'fishing-net-haul';
    this.netPivot.name = 'fishing-net-haul-pivot';
    this.basket.name = 'fishing-net-catches';
    this.netPivot.add(model);
    // The existing net's basket center is 0.56 metres ahead of its grip.
    this.basket.position.set(0, 0.03, -0.56);
    this.netPivot.add(this.basket);
    this.root.add(this.netPivot, this.particles.points);
    worldRoot.add(this.root);
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

  async prepare(haul: FishingHaul, point: FishingCastPoint): Promise<boolean> {
    const generation = ++this.generation;
    this.water.set(Math.min(1.2, Math.max(-1.2, point.x)), 0, -3.9);
    const models = await Promise.all(this.catches.map((library, index) => library.prepare(haul[index]!.id)));
    if (generation !== this.generation) return false;
    models.forEach((model, index) => {
      if (model === null) return;
      model.position.set(0, 0, 0);
      model.rotation.set(0, index === 0 ? 0.4 : -0.6, 0);
      this.bounds.setFromObject(model, true);
      const size = this.bounds.getSize(this.splash);
      model.scale.multiplyScalar(Math.min(1, 0.32 / Math.max(size.x, size.y, size.z)));
      this.bounds.setFromObject(model, true);
      model.position.set(index === 0 ? -0.07 : 0.07, -this.bounds.min.y - 0.13, index === 0 ? -0.08 : 0.1);
      this.basket.add(model);
    });
    this.sample(0);
    return true;
  }

  sample(progress: number): void {
    this.netPivot.scale.setScalar(1);
    this.progress = Math.min(1, Math.max(0, progress));
    this.sampleWave(this.wave, this.water.x, this.water.z - 0.56);
    this.water.y = this.wave.height + 0.22;
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
  }

  update(delta: number): void {
    if (!this.root.visible || delta <= 0) return;
    this.particles.update(delta);
    const t = this.progress;
    const burst = Math.floor(t * NET_HAUL_DURATION * 7);
    if (t < 0.24 || t > 0.91 || burst === this.lastBurst) return;
    this.lastBurst = burst;
    this.basket.getWorldPosition(this.splash);
    this.root.worldToLocal(this.splash);
    this.particles.emit(this.splash, t < 0.6 ? 0.7 : 0.05, t < 0.6 ? undefined : -0.15);
  }

  clear(): void {
    this.generation += 1;
    this.root.visible = false;
    this.basket.clear();
    this.catches.forEach((library) => library.hide());
    this.particles.reset();
    this.lastBurst = -1;
  }

  dispose(): void {
    this.clear();
    runCleanupSteps([
      () => this.catches[0].dispose(),
      () => this.catches[1].dispose(),
      () => this.particles.dispose(),
      () => this.root.removeFromParent(),
    ]);
  }
}
