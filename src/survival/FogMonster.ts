import {
  type AnimationAction, AnimationMixer, Box3, Group, LoopOnce, Mesh,
  Matrix4, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3,
} from 'three';
import { applySeaFogMaterial } from '../world/SeaFogMaterial';
import { createWaveSample } from '../ocean/WaveField';
import { clamp01, pulse, smoothstep } from './animationMath';
import type { EventModelInstance } from './EventModelLibrary';
import type { WorldWaveSampler } from './eventPresentationTypes';
import { mulberry32, type Mulberry32Random } from './random';
import { LIFEBOAT_GUNWALE_SURFACE_Y } from '../world/Lifeboat';

interface FogMonsterWaves {
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly readWorldWaveAmplitudeScale: () => number;
}

export const FOG_MONSTER_ATTACK_DURATION = 5;
export const FOG_MONSTER_STRIKE_PROGRESS = 0.8;

export class FogMonster {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly moving: AnimationAction | null;
  private readonly attack: AnimationAction | null;
  private readonly attackStart = new Vector3();
  private readonly attackTarget = new Vector3();
  private readonly mouthPosition = new Vector3();
  private readonly upperMouthPosition = new Vector3();
  private readonly clearanceBounds = new Box3();
  private readonly clearanceInverse = new Matrix4();
  private readonly clearanceOffset = new Vector3();
  private readonly clearanceOrigin = new Vector3();
  private readonly lowerJaw: Object3D | undefined;
  private readonly upperJaw: Object3D | undefined;
  private attackStartYaw = 0;
  private attacking = false;
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly wave = createWaveSample();
  private random: Mulberry32Random = mulberry32(0);
  private elapsed = 0;
  private duration = 5;
  private startX = -0.7;
  private targetX = 0.7;
  private startZ = -24;
  private targetZ = -24;
  private disposed = false;

  constructor(
    private readonly model: EventModelInstance,
    private readonly camera?: Object3D,
    private readonly waves?: FogMonsterWaves,
    private readonly boat?: Object3D,
  ) {
    this.root.name = 'fog-monster';
    const bounds = new Box3().setFromObject(model.root);
    if (!bounds.isEmpty()) model.root.position.y -= bounds.min.y;
    this.root.add(model.root);
    this.lowerJaw = model.root.getObjectByName('jawlow_3');
    this.upperJaw = model.root.getObjectByName('jawhigh_3');
    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || this.materials.includes(material)) continue;
        applySeaFogMaterial(material);
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
    const attack = model.root.animations.find((clip) => clip.name === 'attack');
    this.moving = moving === undefined ? null : this.mixer.clipAction(moving);
    this.attack = attack === undefined ? null : this.mixer.clipAction(attack);
    this.moving?.play();
    if (this.attack !== null) {
      this.attack.setLoop(LoopOnce, 1);
      this.attack.clampWhenFinished = true;
    }
    this.setVisibility(0);
  }

  stage(seed: number): void {
    this.endAttack();
    this.random = mulberry32(seed);
    this.startX = (this.random.next() < 0.5 ? -1 : 1) * (0.35 + this.random.next() * 0.55);
    this.startZ = -23 - this.random.next() * 2;
    this.elapsed = 0;
    this.chooseTarget();
    this.root.rotation.set(0, 0, 0);
    this.mixer.setTime(0);
    this.update(0, 0);
  }

  update(time: number, delta: number): void {
    if (this.disposed || this.attacking) return;
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

  beginAttack(): void {
    if (this.disposed) return;
    this.endAttack();
    this.attacking = true;
    this.attackStart.copy(this.root.position);
    this.attackStartYaw = this.root.rotation.y;
    this.attackTarget.set(0, LIFEBOAT_GUNWALE_SURFACE_Y, -3);
    this.attack?.reset().setEffectiveWeight(0).play();
  }

  updateAttack(time: number, progress: number): void {
    if (!this.attacking || this.disposed) return;
    const t = clamp01(progress);
    const approach = smoothstep((t - 0.03) / 0.72);
    const retreat = smoothstep((t - 0.88) / 0.12);
    const distance = approach * (1 - retreat);
    this.root.position.lerpVectors(this.attackStart, this.attackTarget, distance);
    const { x, z } = this.root.position;
    this.waves?.sampleWorldWaveInto(this.wave, time, x, z, this.waves.readWorldWaveAmplitudeScale());
    this.root.position.y = this.wave.height + 0.03;
    this.root.rotation.y = this.attackStartYaw * (1 - distance);

    // Sample the clip from reaction time so a slow frame cannot desynchronize the strike.
    const attackWeight = smoothstep((t - 0.58) / 0.08) * (1 - smoothstep((t - 0.88) / 0.12));
    this.moving?.setEffectiveWeight(1 - attackWeight);
    if (this.moving !== null) this.moving.time = (t * FOG_MONSTER_ATTACK_DURATION) % this.moving.getClip().duration;
    if (this.attack !== null) {
      this.attack.setEffectiveWeight(attackWeight);
      this.attack.time = clamp01((t - 0.58) / (0.22 / 0.75)) * this.attack.getClip().duration;
    }
    this.mixer.update(0);
    this.alignBite(smoothstep((t - 0.7) / 0.1) * (1 - retreat));
    if (t < FOG_MONSTER_STRIKE_PROGRESS) this.keepOutsideBow();
  }

  private keepOutsideBow(): void {
    const frame = this.boat ?? this.root.parent;
    frame?.updateWorldMatrix(true, false);
    if (frame !== null && frame !== undefined) this.clearanceInverse.copy(frame.matrixWorld).invert();
    else this.clearanceInverse.identity();
    // SkinnedMesh.updateMatrixWorld updates its bind inverse before vertex sampling.
    this.root.parent?.updateWorldMatrix(true, false);
    this.root.updateMatrixWorld(true);
    this.clearanceBounds.setFromObject(this.root, true).applyMatrix4(this.clearanceInverse);
    const intrusion = this.clearanceBounds.max.z + 3.08;
    if (intrusion <= 0) return;
    this.clearanceOrigin.set(0, 0, 0);
    this.clearanceOffset.set(0, 0, -intrusion);
    frame?.localToWorld(this.clearanceOrigin);
    frame?.localToWorld(this.clearanceOffset);
    this.root.parent?.worldToLocal(this.clearanceOrigin);
    this.root.parent?.worldToLocal(this.clearanceOffset);
    this.root.position.add(this.clearanceOffset.sub(this.clearanceOrigin));
  }

  private alignBite(weight: number): void {
    if (this.lowerJaw === undefined || this.upperJaw === undefined) return;
    this.lowerJaw.getWorldPosition(this.mouthPosition);
    this.upperJaw.getWorldPosition(this.upperMouthPosition);
    this.mouthPosition.add(this.upperMouthPosition).multiplyScalar(0.5);
    this.root.parent?.worldToLocal(this.mouthPosition);
    this.attackTarget.set(0, LIFEBOAT_GUNWALE_SURFACE_Y, -3);
    this.boat?.localToWorld(this.attackTarget);
    this.root.parent?.worldToLocal(this.attackTarget);
    this.root.position.addScaledVector(this.mouthPosition.sub(this.attackTarget), -weight);
    // Keep the approach target stable in the boat's local space on the next frame.
    this.attackTarget.set(0, LIFEBOAT_GUNWALE_SURFACE_Y, -3);
  }

  attackImpact(progress: number): number {
    return pulse(progress, FOG_MONSTER_STRIKE_PROGRESS - 0.025, FOG_MONSTER_STRIKE_PROGRESS, 0.82);
  }

  endAttack(): void {
    if (!this.attacking) return;
    this.attacking = false;
    this.root.position.copy(this.attackStart);
    this.root.rotation.y = this.attackStartYaw;
    this.attack?.stop();
    this.moving?.setEffectiveWeight(1).play();
    this.mixer.update(0);
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
    this.targetZ = -23 - this.random.next() * 2;
    this.duration = 4 + this.random.next() * 3;
  }
}
