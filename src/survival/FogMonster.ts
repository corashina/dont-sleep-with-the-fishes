import { AnimationMixer, Box3, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera } from 'three';
import { createWaveSample } from '../ocean/WaveField';
import { smoothstep } from './animationMath';
import type { EventModelInstance } from './EventModelLibrary';
import type { WorldWaveSampler } from './eventPresentationTypes';
import { mulberry32, type Mulberry32Random } from './random';

interface FogMonsterWaves {
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly readWorldWaveAmplitudeScale: () => number;
}

export class FogMonster {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly wave = createWaveSample();
  private random: Mulberry32Random = mulberry32(0);
  private elapsed = 0;
  private duration = 5;
  private startX = -0.7;
  private targetX = 0.7;
  private startZ = -9;
  private targetZ = -9;
  private disposed = false;

  constructor(
    private readonly model: EventModelInstance,
    private readonly camera?: Object3D,
    private readonly waves?: FogMonsterWaves,
  ) {
    this.root.name = 'fog-monster';
    const bounds = new Box3().setFromObject(model.root);
    if (!bounds.isEmpty()) model.root.position.y -= bounds.min.y;
    this.root.add(model.root);
    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || this.materials.includes(material)) continue;
        material.transparent = true;
        material.depthWrite = false;
        material.roughness = Math.max(0.8, material.roughness);
        material.emissive.copy(material.color);
        material.emissiveIntensity = 0.18;
        this.materials.push(material);
      }
    });
    this.mixer = new AnimationMixer(model.root);
    const moving = model.root.animations.find((clip) => clip.name === 'moving');
    if (moving !== undefined) this.mixer.clipAction(moving).play();
    this.setVisibility(0);
  }

  stage(seed: number): void {
    this.random = mulberry32(seed);
    this.startX = (this.random.next() < 0.5 ? -1 : 1) * (0.35 + this.random.next() * 0.55);
    this.startZ = -8 - this.random.next() * 2;
    this.elapsed = 0;
    this.chooseTarget();
    this.root.rotation.set(0, 0, 0);
    this.mixer.setTime(0);
    this.update(0, 0);
  }

  update(time: number, delta: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.25)) : 0;
    this.elapsed += step;
    if (this.elapsed >= this.duration) {
      this.elapsed -= this.duration;
      this.startX = this.targetX;
      this.startZ = this.targetZ;
      this.chooseTarget();
    }
    const progress = smoothstep(this.elapsed / this.duration);
    const z = this.startZ + (this.targetZ - this.startZ) * progress;
    const camera = this.camera;
    const halfView = camera instanceof PerspectiveCamera
      ? Math.tan(camera.getEffectiveFOV() * Math.PI / 360) * camera.aspect
      : Math.tan(40 * Math.PI / 180) * 16 / 9;
    // Reserve space for the whole body at each edge, including portrait views.
    const horizontalRange = Math.max(0, Math.min(4.2, -z * halfView - 1.5));
    const x = (this.startX + (this.targetX - this.startX) * progress) * horizontalRange;
    this.waves?.sampleWorldWaveInto(this.wave, time, x, z, this.waves.readWorldWaveAmplitudeScale());
    this.root.position.set(x, this.wave.height + 0.03, z);
    const turn = Math.sign(this.targetX - this.startX) * 0.6;
    this.root.rotation.y += (turn - this.root.rotation.y) * (1 - Math.exp(-step * 3));
    this.mixer.update(step);
  }

  setVisibility(amount: number): void {
    this.root.visible = amount > 0.015;
    for (let index = 0; index < this.materials.length; index += 1) {
      this.materials[index]!.opacity = Math.min(0.9, Math.max(0, amount) * 0.9);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
    this.model.dispose();
    this.root.removeFromParent();
  }

  private chooseTarget(): void {
    this.targetX = (this.startX < 0 ? 1 : -1) * (0.35 + this.random.next() * 0.55);
    this.targetZ = -8 - this.random.next() * 2;
    this.duration = 4 + this.random.next() * 3;
  }
}
