import { MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Group, type Object3D } from 'three';
import { lifeboatHullHalfWidthAt } from '../../world/Lifeboat';
import type { RandomSource } from '../survivalTypes';
import { CrabFloorLanding, CrabSurface } from './CrabSurface';

const clamp = (value: number) => MathUtils.clamp(value, 0, 1);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const PATH_STEPS = 192;
const TURN_RADIUS = 12;
const UP = new Vector3(0, 1, 0);
const REST_HEIGHTS = [0.13, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13, -0.11] as const;
const SIDE_POSITIONS_Z = [-2.85, -2.85, -1.91, -1.91, -1.08, -1.08, -0.35, -0.35] as const;

function restingYaw(index: number, random: RandomSource): number {
  const variation = random.next() - 0.5;
  // The model's claws face local -Z; turn the floor pair toward the player's +Z position.
  if (index === 2) return Math.PI + 0.25;
  if (index === 3) return Math.PI - 0.1;
  return variation * 1.3;
}

function wallProgress(index: number, travel: number): number {
  // Stop the bow pair on top of the rail, halfway through the turn over its rim.
  if (index < 2) return travel * 0.625;
  if (index < 4) return travel / 0.55 * 0.8;
  return travel;
}

function wallRay(surface: CrabSurface, travel: number, side: number, z: number, restY: number): void {
  const width = lifeboatHullHalfWidthAt(z)!;
  if (travel < 0.45) {
    surface.origin.set(side * (width + 2), MathUtils.lerp(-0.3, 0.39, travel / 0.45), z);
    surface.direction.set(-side, 0, 0);
  } else if (travel < 0.8) {
    const angle = (travel - 0.45) / 0.35 * Math.PI;
    surface.origin.set(side * (width + Math.cos(angle) * 2), 0.39 + Math.sin(angle) * 2, z);
    surface.direction.set(-side * Math.cos(angle), -Math.sin(angle), 0);
  } else {
    surface.origin.set(side * (width - 2), MathUtils.lerp(0.39, restY, (travel - 0.8) / 0.2), z);
    surface.direction.set(side, 0, 0);
  }
}

/** Bake contact poses against the rendered timber once; playback only interpolates them. */
export class CrabPath {
  private readonly positions = Array.from({ length: PATH_STEPS + 1 }, () => new Vector3());
  private readonly rotations = Array.from({ length: PATH_STEPS + 1 }, () => new Quaternion());
  private delay = 0;
  private duration = 1;
  private retreatDelay = 0;
  private retreatDuration = 1;
  private readonly bodyPoints: Vector3[] = [];

  constructor(model: Group) {
    model.updateWorldMatrix(true, true);
    const inverse = new Matrix4().copy(model.parent!.matrixWorld).invert();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const vertices = object.geometry.getAttribute('position');
      for (let index = 0; index < vertices.count; index += 1) {
        this.bodyPoints.push(new Vector3().fromBufferAttribute(vertices, index)
          .applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
      }
    });
  }

  configure(index: number, random: RandomSource, boat: Object3D): void {
    const surface = new CrabSurface(boat);
    const turn = new Quaternion();
    const side = index % 2 === 0 ? -1 : 1;
    const z = SIDE_POSITIONS_Z[index]! + (random.next() - 0.5) * 0.08;
    const startZ = Math.max(-2.94, z + (random.next() < 0.5 ? -1 : 1) * (0.06 + random.next() * 0.1));
    // The nearest starboard crab grips the wall below the radio shelf.
    const restY = REST_HEIGHTS[index]! + random.next() * 0.06;
    this.delay = random.next() * 0.32;
    this.duration = 0.36 + random.next() * 0.28;
    this.retreatDelay = random.next() * 0.2;
    this.retreatDuration = 0.45 + random.next() * 0.34;
    const yaw = restingYaw(index, random);
    const startYaw = yaw + (random.next() - 0.5) * 0.7;
    const landing = index === 2 || index === 3 ? new CrabFloorLanding(side, yaw, this.bodyPoints, surface) : null;
    for (let step = 0; step <= PATH_STEPS; step += 1) {
      const travel = step / PATH_STEPS;
      const position = this.positions[step]!;
      const rotation = this.rotations[step]!;
      if (landing && travel >= 0.55) {
        landing.sample(travel, position, rotation);
        continue;
      }
      const wallTravel = wallProgress(index, travel);
      const pathZ = MathUtils.lerp(startZ, landing?.z ?? z, ease(landing ? travel / 0.5 : travel));
      wallRay(surface, wallTravel, side, pathZ, restY);
      surface.project(position);
      turn.setFromAxisAngle(UP, MathUtils.lerp(startYaw, yaw, ease(travel)));
      rotation.setFromUnitVectors(UP, surface.normal).multiply(turn);
    }
    this.smoothTurns();
  }

  private smoothTurns(): void {
    // Blend across timber faces during baking, so rail corners cannot create one-frame turns.
    // Read an unchanged copy; a forward-only filter would lag behind on the return trip.
    const source = this.rotations.map(rotation => rotation.clone());
    for (let step = 1; step < PATH_STEPS; step += 1) {
      const reference = source[step]!;
      const result = this.rotations[step]!.set(0, 0, 0, 0);
      for (let offset = -TURN_RADIUS; offset <= TURN_RADIUS; offset += 1) {
        const rotation = source[MathUtils.clamp(step + offset, 0, PATH_STEPS)]!;
        const weight = (TURN_RADIUS + 1 - Math.abs(offset)) * (reference.dot(rotation) < 0 ? -1 : 1);
        result.x += rotation.x * weight;
        result.y += rotation.y * weight;
        result.z += rotation.z * weight;
        result.w += rotation.w * weight;
      }
      result.normalize();
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
