import { MathUtils, Matrix3, Quaternion, Raycaster, Vector3, type Group, type Object3D } from 'three';
import { lifeboatHullHalfWidthAt } from '../../world/Lifeboat';
import type { RandomSource } from '../survivalTypes';

const clamp = (value: number) => MathUtils.clamp(value, 0, 1);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const PATH_STEPS = 192;
const UP = new Vector3(0, 1, 0);

/** Bake contact poses against the rendered timber once; playback only interpolates them. */
export class CrabPath {
  private readonly positions = Array.from({ length: PATH_STEPS + 1 }, () => new Vector3());
  private readonly rotations = Array.from({ length: PATH_STEPS + 1 }, () => new Quaternion());
  private delay = 0;
  private duration = 1;
  private retreatDelay = 0;
  private retreatDuration = 1;

  configure(index: number, random: RandomSource, boat: Object3D): void {
    const wood = [boat.getObjectByName('lifeboat-hull-planks'), boat.getObjectByName('survival-gunwale')];
    if (!wood[0] || !wood[1]) throw new Error('Crab paths require the lifeboat timber.');
    boat.updateWorldMatrix(true, true);
    const ray = new Raycaster();
    const origin = new Vector3();
    const direction = new Vector3();
    const normal = new Vector3();
    const worldNormal = new Matrix3();
    const boatNormal = new Matrix3().getNormalMatrix(boat.matrixWorld).invert();
    const turn = new Quaternion();
    const side = index % 2 === 0 ? -1 : 1;
    // Keep resting bodies between the ribs and clear of the display bench.
    const z = [-2.48, -1.91, -1.08, -0.35][Math.floor(index / 2)]! + (random.next() - 0.5) * 0.08;
    const startZ = z + (random.next() < 0.5 ? -1 : 1) * (0.06 + random.next() * 0.1);
    const restY = 0.13 + random.next() * 0.06;
    this.delay = random.next() * 0.32;
    this.duration = 0.36 + random.next() * 0.28;
    this.retreatDelay = random.next() * 0.2;
    this.retreatDuration = 0.45 + random.next() * 0.34;
    const yaw = (random.next() - 0.5) * 1.3;
    const startYaw = yaw + (random.next() - 0.5) * 0.7;
    for (let step = 0; step <= PATH_STEPS; step += 1) {
      const travel = step / PATH_STEPS;
      const pathZ = MathUtils.lerp(startZ, z, ease(travel));
      const width = lifeboatHullHalfWidthAt(pathZ)!;
      if (travel < 0.45) {
        origin.set(side * (width + 2), MathUtils.lerp(-0.3, 0.39, travel / 0.45), pathZ);
        direction.set(-side, 0, 0);
      } else if (travel < 0.8) {
        const angle = (travel - 0.45) / 0.35 * Math.PI;
        origin.set(side * (width + Math.cos(angle) * 2), 0.39 + Math.sin(angle) * 2, pathZ);
        direction.set(-side * Math.cos(angle), -Math.sin(angle), 0);
      } else {
        origin.set(side * (width - 2), MathUtils.lerp(0.39, restY, (travel - 0.8) / 0.2), pathZ);
        direction.set(side, 0, 0);
      }
      boat.localToWorld(origin);
      direction.transformDirection(boat.matrixWorld);
      ray.set(origin, direction);
      ray.far = 2.5;
      const hit = ray.intersectObjects(wood as Object3D[], true)[0];
      if (!hit?.face) throw new Error(`Missing crab contact at ${pathZ}, ${travel}`);
      worldNormal.getNormalMatrix(hit.object.matrixWorld);
      normal.copy(hit.face.normal).applyMatrix3(worldNormal).applyMatrix3(boatNormal).normalize();
      const position = this.positions[step]!;
      position.copy(hit.point);
      boat.worldToLocal(position);
      position.addScaledVector(normal, 0.008);
      turn.setFromAxisAngle(UP, MathUtils.lerp(startYaw, yaw, ease(travel)));
      this.rotations[step]!.setFromUnitVectors(UP, normal).multiply(turn);
    }
  }

  sample(root: Group, progress: number, retreat = false): void {
    const travel = retreat
      ? 1 - clamp((progress - this.retreatDelay) / this.retreatDuration)
      : clamp((progress - this.delay) / this.duration);
    const sample = travel * PATH_STEPS;
    const first = Math.min(Math.floor(sample), PATH_STEPS - 1);
    const blend = sample - first;
    root.position.lerpVectors(this.positions[first]!, this.positions[first + 1]!, blend);
    root.quaternion.slerpQuaternions(this.rotations[first]!, this.rotations[first + 1]!, blend);
    root.visible = travel > 0;
  }
}
