import { EllipseCurve, Vector2 } from 'three';
import { SWARM_DISTRACTION_TARGET, type SwarmSharkPose, type SwarmVariant } from './sharkSwarmChoreography';

export const SWARM_SWIM_SPEED = 2.6;
const TAU = Math.PI * 2;

/** Distance-based swimming, with tangent joins from the boat orbit to the food orbit. */
export class SwarmSwimPath {
  private orbit = new EllipseCurve();
  private orbitLength = 0;
  private phaseDistance = 0;
  private departure: EllipseCurve | null = null;
  private departureLength = 0;
  private crossingLength = 0;
  private diversionTime = 0;
  private foodRadius = 0;
  private foodAngle = 0;
  private readonly point = new Vector2();
  private readonly exit = new Vector2();
  private readonly entry = new Vector2();

  reset(variant: SwarmVariant): void {
    this.orbit = new EllipseCurve(0, 0, variant.radiusX, variant.radiusZ, 0, TAU);
    this.orbit.arcLengthDivisions = 1024;
    this.orbitLength = this.orbit.getLength();
    const lengths = this.orbit.getLengths();
    const phase = ((variant.orbitAngle % TAU + TAU) % TAU) / TAU * this.orbit.arcLengthDivisions;
    const index = Math.floor(phase);
    this.phaseDistance = lengths[index]! + (lengths[index + 1]! - lengths[index]!) * (phase - index);
    this.foodRadius = variant.group % 2 === 0 ? 2.8 : 3.6;
    this.departure = null;
  }

  divert(time: number): number {
    this.orbitPoint(time);
    const startAngle = Math.atan2(this.point.y / this.orbit.yRadius, this.point.x / this.orbit.xRadius);
    const target = SWARM_DISTRACTION_TARGET;
    const direction = Math.atan2(target.z, target.x);
    // Find the common outer tangent. This keeps every shark clear of the hull.
    let low = direction - Math.PI / 2;
    let high = direction;
    for (let step = 0; step < 40; step += 1) {
      const angle = (low + high) / 2;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const support = Math.hypot(this.orbit.xRadius * nx, this.orbit.yRadius * nz);
      if (target.x * nx + target.z * nz < support - this.foodRadius) low = angle;
      else high = angle;
    }
    this.foodAngle = (low + high) / 2;
    const nx = Math.cos(this.foodAngle);
    const nz = Math.sin(this.foodAngle);
    const support = Math.hypot(this.orbit.xRadius * nx, this.orbit.yRadius * nz);
    this.exit.set(this.orbit.xRadius ** 2 * nx / support, this.orbit.yRadius ** 2 * nz / support);
    this.entry.set(target.x + nx * this.foodRadius, target.z + nz * this.foodRadius);
    const exitAngle = Math.atan2(this.exit.y / this.orbit.yRadius, this.exit.x / this.orbit.xRadius);
    const sweep = ((exitAngle - startAngle) % TAU + TAU) % TAU;
    this.departure = new EllipseCurve(0, 0, this.orbit.xRadius, this.orbit.yRadius,
      startAngle, startAngle + sweep);
    this.departure.arcLengthDivisions = 1024;
    this.departureLength = this.departure.getLength();
    this.crossingLength = this.exit.distanceTo(this.entry);
    this.diversionTime = time;
    return (this.departureLength + this.crossingLength) / SWARM_SWIM_SPEED;
  }

  settle(time: number): void {
    if (this.departure === null) return;
    this.diversionTime = time - (this.departureLength + this.crossingLength) / SWARM_SWIM_SPEED;
  }

  sample(time: number, pose: SwarmSharkPose): void {
    if (this.departure === null) {
      this.orbitPoint(time);
      this.copyEllipsePose(pose);
      return;
    }
    const distance = Math.max(0, time - this.diversionTime) * SWARM_SWIM_SPEED;
    if (distance < this.departureLength) {
      this.departure.getPointAt(distance / this.departureLength, this.point);
      this.copyEllipsePose(pose);
    } else if (distance < this.departureLength + this.crossingLength) {
      this.point.lerpVectors(this.exit, this.entry, (distance - this.departureLength) / this.crossingLength);
      pose.x = this.point.x;
      pose.z = this.point.y;
      pose.yaw = Math.atan2(this.entry.x - this.exit.x, this.entry.y - this.exit.y);
    } else {
      const angle = this.foodAngle + (distance - this.departureLength - this.crossingLength) / this.foodRadius;
      pose.x = SWARM_DISTRACTION_TARGET.x + Math.cos(angle) * this.foodRadius;
      pose.z = SWARM_DISTRACTION_TARGET.z + Math.sin(angle) * this.foodRadius;
      pose.yaw = Math.atan2(-Math.sin(angle), Math.cos(angle));
    }
  }

  private orbitPoint(time: number): void {
    const distance = ((this.phaseDistance + time * SWARM_SWIM_SPEED) % this.orbitLength + this.orbitLength) % this.orbitLength;
    this.orbit.getPointAt(distance / this.orbitLength, this.point);
  }

  private copyEllipsePose(pose: SwarmSharkPose): void {
    pose.x = this.point.x;
    pose.z = this.point.y;
    pose.yaw = Math.atan2(-this.point.y * this.orbit.xRadius / this.orbit.yRadius,
      this.point.x * this.orbit.yRadius / this.orbit.xRadius);
  }
}
