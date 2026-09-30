import { MathUtils, Matrix4, Mesh, Quaternion, Vector3, type Group, type Object3D } from 'three';
import { lifeboatHullHalfWidthAt } from '../../world/Lifeboat';
import type { RandomSource } from '../survivalTypes';
import { CrabFloorLanding, CrabSurface } from './CrabSurface';

const clamp = (value: number) => MathUtils.clamp(value, 0, 1);
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const PATH_STEPS = 192;
const TURN_RADIUS = 12;
const UP = new Vector3(0, 1, 0);
const WALL_REST_Y = 0.13;
// Wall crabs rest between side frames. The rear pair stops on the rail, clear of the radio.
const SIDE_POSITIONS_Z = [-2.85, -2.85, -1.91, -1.91, -1.08, -1.08, -0.72, -0.72] as const;
const DASH_SHARE = 0.8;
const DASH_WEIGHT = 0.25;
const GAIT_HZ = 7;
const GAIT_SWAY = 0.08;
const GAIT_LIFT = 0.006;
const gaitTurn = new Quaternion();
const gaitLift = new Vector3();

/** The bow pair and the rear pair stop on the rail. */
export const isRailCrab = (index: number) => index < 2 || index > 5;
export const isFloorCrab = (index: number) => index === 2 || index === 3;

function restingYaw(index: number, random: RandomSource): number {
  const variation = random.next() - 0.5;
  // The model's claws face local -Z; turn the floor pair toward the player's +Z position.
  if (index === 2) return Math.PI + 0.25;
  if (index === 3) return Math.PI - 0.1;
  return variation * 1.3;
}

function wallProgress(index: number, travel: number): number {
  // Stop rail crabs on top of the rail, halfway through the turn over its rim.
  if (isRailCrab(index)) return travel * 0.625;
  if (isFloorCrab(index)) return travel / 0.55 * 0.8;
  return travel;
}

/** Crabs scuttle in bursts. A larger weight turns faster on the rail rims. */
function dash(travel: number, dashes: number): number {
  const index = Math.min(dashes - 1, Math.floor(travel * dashes));
  const phase = clamp((travel * dashes - index) / DASH_SHARE);
  return DASH_WEIGHT * (index + ease(phase)) / dashes + (1 - DASH_WEIGHT) * travel;
}

/** Leg motion is strongest in the middle of each dash. */
function stride(travel: number, dashes: number): number {
  const index = Math.min(dashes - 1, Math.floor(travel * dashes));
  return Math.sin(Math.PI * clamp((travel * dashes - index) / DASH_SHARE));
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
  private dashes = 1;
  private retreatDashes = 1;
  private gaitPhase = 0;
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
    const restY = WALL_REST_Y + random.next() * 0.06;
    this.delay = random.next() * 0.32;
    this.duration = 0.36 + random.next() * 0.28;
    this.retreatDelay = random.next() * 0.2;
    this.retreatDuration = 0.45 + random.next() * 0.34;
    const yaw = restingYaw(index, random);
    const startYaw = yaw + (random.next() - 0.5) * 0.7;
    const landing = isFloorCrab(index) ? new CrabFloorLanding(side, yaw, this.bodyPoints, surface) : null;
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
    this.dashes = 3 + Math.floor(random.next() * 3);
    this.retreatDashes = 2 + Math.floor(random.next() * 2);
    this.gaitPhase = random.next() * Math.PI * 2;
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

  sample(root: Group, progress: number, seconds: number, retreat = false, immediate = false): void {
    const walk = retreat
      ? clamp((progress - (immediate ? 0 : this.retreatDelay)) / this.retreatDuration)
      : clamp((progress - this.delay) / this.duration);
    const dashes = retreat ? this.retreatDashes : this.dashes;
    const travel = clamp(retreat ? 1 - dash(walk, dashes) : dash(walk, dashes));
    const sample = travel * PATH_STEPS;
    const first = Math.min(Math.floor(sample), PATH_STEPS - 1);
    const blend = sample - first;
    root.position.lerpVectors(this.positions[first]!, this.positions[first + 1]!, blend);
    root.quaternion.slerpQuaternions(this.rotations[first]!, this.rotations[first + 1]!, blend);
    root.visible = travel > 0;
    // Sway the body over its legs and lift it off the timber, never into it.
    const gait = Math.sin(seconds * GAIT_HZ * Math.PI * 2 + this.gaitPhase) * stride(walk, dashes);
    root.quaternion.multiply(gaitTurn.setFromAxisAngle(UP, gait * GAIT_SWAY));
    root.position.addScaledVector(gaitLift.copy(UP).applyQuaternion(root.quaternion), Math.abs(gait) * GAIT_LIFT);
  }
}
