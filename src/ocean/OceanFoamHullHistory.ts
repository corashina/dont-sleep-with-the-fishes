import { Matrix4, Quaternion, Vector3 } from 'three';
import type { WaterExclusionRegion } from './WaterExclusion';

class HullFrame {
  region: WaterExclusionRegion | null = null;
  time = 0;
  previousTime = 0;
  readonly position = new Vector3();
  readonly rotation = new Quaternion();
  readonly scale = new Vector3(1, 1, 1);
  readonly previousPosition = new Vector3();
  readonly previousRotation = new Quaternion();
  readonly previousScale = new Vector3(1, 1, 1);
}

/** Identity follows region objects even when callers reorder their exclusion lists. */
export class OceanFoamHullHistory {
  readonly worldToLocal: Matrix4[];
  readonly previousLocalToWorld: Matrix4[];
  readonly localToWorld: Matrix4[];
  readonly intervals: Float32Array;
  private readonly frames: HullFrame[];
  private readonly order: Int32Array;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly point = new Vector3();
  private readonly previousPoint = new Vector3();
  private count = 0;

  constructor(private readonly capacity: number) {
    this.frames = Array.from({ length: capacity }, () => new HullFrame());
    this.worldToLocal = Array.from({ length: capacity }, () => new Matrix4());
    this.previousLocalToWorld = Array.from({ length: capacity }, () => new Matrix4());
    this.localToWorld = Array.from({ length: capacity }, () => new Matrix4());
    this.intervals = new Float32Array(capacity);
    this.order = new Int32Array(capacity);
  }

  setRegions(regions: readonly WaterExclusionRegion[], timeSeconds: number): void {
    this.count = Math.min(regions.length, this.capacity);
    for (const frame of this.frames) {
      const index = frame.region === null ? -1 : regions.indexOf(frame.region);
      if (index < 0 || index >= this.count) frame.region = null;
    }
    for (let i = 0; i < this.count; i++) {
      const region = regions[i]!;
      const existing = this.findSlot(region);
      const fresh = existing < 0;
      const index = fresh ? this.findSlot(null) : existing;
      const frame = this.frames[index]!;
      this.order[i] = index;
      if (!fresh && timeSeconds === frame.time) continue;
      frame.previousPosition.copy(frame.position);
      frame.previousRotation.copy(frame.rotation);
      frame.previousScale.copy(frame.scale);
      frame.previousTime = frame.time;
      this.matrix.copy(region.worldToLocal).invert().decompose(frame.position, frame.rotation, frame.scale);
      frame.time = timeSeconds;
      frame.region = region;
      if (fresh || timeSeconds < frame.previousTime) {
        frame.previousPosition.copy(frame.position);
        frame.previousRotation.copy(frame.rotation);
        frame.previousScale.copy(frame.scale);
        frame.previousTime = timeSeconds;
      }
    }
  }

  private findSlot(region: WaterExclusionRegion | null): number {
    for (let slot = 0; slot < this.capacity; slot++) {
      if (this.frames[slot]!.region === region) return slot;
    }
    return -1;
  }

  sample(stepTime: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (i >= this.count) { this.intervals[i] = 0; continue; }
      const frame = this.frames[this.order[i]!]!;
      const duration = frame.time - frame.previousTime;
      const alpha = duration > 0 ? Math.min(1, Math.max(0, (stepTime - frame.previousTime) / duration)) : 1;
      this.position.lerpVectors(frame.previousPosition, frame.position, alpha);
      this.rotation.slerpQuaternions(frame.previousRotation, frame.rotation, alpha);
      this.scale.lerpVectors(frame.previousScale, frame.scale, alpha);
      this.localToWorld[i]!.compose(this.position, this.rotation, this.scale);
      this.worldToLocal[i]!.copy(this.localToWorld[i]!).invert();
      this.previousLocalToWorld[i]!.compose(frame.previousPosition, frame.previousRotation, frame.previousScale);
      this.intervals[i] = Math.max(0, Math.min(duration, stepTime - frame.previousTime));
    }
  }

  velocityAt(index: number, worldPoint: Vector3, output: Vector3): void {
    const interval = this.intervals[index] ?? 0;
    if (index >= this.count || interval <= 0) { output.set(0, 0, 0); return; }
    this.point.copy(worldPoint).applyMatrix4(this.worldToLocal[index]!);
    this.previousPoint.copy(this.point).applyMatrix4(this.previousLocalToWorld[index]!);
    output.copy(this.point).applyMatrix4(this.localToWorld[index]!).sub(this.previousPoint).divideScalar(interval);
  }

  reset(): void {
    for (const frame of this.frames) frame.region = null;
    this.count = 0;
    this.intervals.fill(0);
  }
}
