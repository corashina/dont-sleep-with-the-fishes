import {
  Box3, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  Object3D, Quaternion, SkinnedMesh, SpotLight, Vector3,
} from 'three';
import {
  createObjectScreenBoundsCache, type ObjectScreenBoundsCache,
} from '../rendering/projectScreenBounds';
import { ItemAimTarget } from './ItemAimTarget';

const SEGMENTS = 32;
const FORWARD = new Vector3(1, 0, 0);

/** Fits a reusable cone to the target's current visible mesh bounds. */
export class FlashlightBeam extends Group {
  private readonly geometry = new ConeGeometry(1, 1, SEGMENTS, 1, true);
  private readonly material = new MeshBasicMaterial({
    color: 0xffefb8, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide,
  });
  readonly beam = new Mesh(this.geometry, this.material);
  readonly light = new SpotLight(0xffedb5, 0, 0, Math.PI / 4, 0.1, 0);
  private model: Object3D | null = null;
  private cache: ObjectScreenBoundsCache | null = null;
  private readonly corners: Vector3[] = [];
  private cornerCount = 0;
  private readonly bounds = new Box3();
  private readonly center = new Vector3();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly offset = new Vector3();
  private readonly parentRotation = new Quaternion();

  constructor() {
    super();
    this.name = 'event-item-flashlight-beam';
    this.beam.name = 'event-item-flashlight-cone';
    // Put the tip at the origin and extend along local +X.
    this.geometry.rotateZ(Math.PI / 2);
    this.geometry.translate(0.5, 0, 0);
    this.light.name = 'event-item-flashlight-light';
    this.light.target.position.x = 1;
    this.add(this.beam, this.light, this.light.target);
    this.hide();
  }

  setTarget(target: Object3D | null): void {
    this.model = target instanceof ItemAimTarget ? target.model : target;
    this.cache = this.model === null ? null : createObjectScreenBoundsCache(this.model);
    for (const entry of this.cache?.entries ?? []) {
      if (entry.object instanceof SkinnedMesh) entry.object.computeBoundingBox();
    }
    this.corners.length = 0;
    const count = (this.cache?.entries.length ?? 0) * 8;
    for (let index = 0; index < count; index += 1) this.corners.push(new Vector3());
    this.cornerCount = 0;
  }

  updateTarget(): void {
    this.cornerCount = 0;
    this.bounds.makeEmpty();
    if (this.model === null || this.cache === null) return;
    this.model.updateWorldMatrix(true, true);
    for (const entry of this.cache.entries) {
      if (!this.isVisible(entry.object)) continue;
      let bounds = entry.bounds;
      if (entry.object instanceof SkinnedMesh) {
        entry.object.computeBoundingBox();
        bounds = entry.object.boundingBox!;
      }
      for (let index = 0; index < 8; index += 1) {
        const corner = this.corners[this.cornerCount++]!;
        corner.set(
          index & 1 ? bounds.max.x : bounds.min.x,
          index & 2 ? bounds.max.y : bounds.min.y,
          index & 4 ? bounds.max.z : bounds.min.z,
        ).applyMatrix4(entry.object.matrixWorld);
        this.bounds.expandByPoint(corner);
      }
    }
    if (this.cornerCount > 0) this.bounds.getCenter(this.center);
  }

  copyTargetCenter(output: Vector3): boolean {
    if (this.cornerCount === 0) return false;
    output.copy(this.center);
    return true;
  }

  apply(actor: Object3D, primary: number, secondary: number): void {
    this.hide();
    if (this.cornerCount === 0 || primary <= 0) return;
    actor.getWorldPosition(this.origin);
    this.direction.subVectors(this.center, this.origin);
    if (this.direction.lengthSq() < 0.0001) return;
    this.direction.normalize();
    let length = 0;
    let slope = 0;
    for (let index = 0; index < this.cornerCount; index += 1) {
      this.offset.subVectors(this.corners[index]!, this.origin);
      const depth = this.offset.dot(this.direction);
      // A forward cone cannot enclose a target that surrounds its source.
      if (depth <= 0.001) return;
      const radial = Math.sqrt(Math.max(0, this.offset.lengthSq() - depth * depth));
      length = Math.max(length, depth);
      slope = Math.max(slope, radial / depth);
    }
    // Circumscribe the bounds even between the cone's polygon vertices.
    const radius = Math.max(0.01, length * slope / Math.cos(Math.PI / SEGMENTS));
    this.quaternion.setFromUnitVectors(FORWARD, this.direction);
    if (this.parent !== null) {
      this.parent.getWorldQuaternion(this.parentRotation).invert();
      this.quaternion.premultiply(this.parentRotation);
    }
    this.beam.scale.set(length, radius, radius);
    this.light.distance = length;
    this.light.angle = Math.atan2(radius, length);
    this.light.intensity = primary * (1.1 + primary * 3.2 + secondary * 2.5);
    this.material.opacity = primary * 0.16;
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.light.intensity = 0;
    this.material.opacity = 0;
  }

  dispose(): void {
    this.setTarget(null);
    this.geometry.dispose();
    this.material.dispose();
    this.light.dispose();
    this.clear();
  }

  private isVisible(object: Object3D): boolean {
    let current: Object3D | null = object;
    while (current !== null) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return true;
  }
}
