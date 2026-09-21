import { Mesh, Raycaster, SkinnedMesh, Vector2, type Intersection, type Object3D, type PerspectiveCamera } from 'three';

export class BoatInteractionRaycast {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly intersections: Intersection[] = [];

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly boat: Object3D,
  ) {}

  hits(target: Object3D, x: number, y: number, width: number, height: number): boolean {
    if (width <= 0 || height <= 0 || !this.isVisible(target)) return false;
    this.camera.updateWorldMatrix(true, false);
    this.pointer.set(x / width * 2 - 1, 1 - y / height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targetDistance = this.distanceTo(target);
    return Number.isFinite(targetDistance) && targetDistance < this.distanceTo(this.boat);
  }

  private distanceTo(root: Object3D): number {
    if (!this.isVisible(root)) return Infinity;
    root.updateWorldMatrix(true, true);
    this.intersections.length = 0;
    this.intersectVisible(root);
    let distance = Infinity;
    for (const hit of this.intersections) distance = Math.min(distance, hit.distance);
    return distance;
  }

  private intersectVisible(object: Object3D): void {
    if (!object.visible) return;
    if (object instanceof Mesh) {
      if (object instanceof SkinnedMesh) {
        object.skeleton.update();
        object.computeBoundingSphere();
        if (object.boundingBox !== null) object.computeBoundingBox();
      }
      this.raycaster.intersectObject(object, false, this.intersections);
    }
    for (const child of object.children) this.intersectVisible(child);
  }

  private isVisible(object: Object3D): boolean {
    for (let current: Object3D | null = object; current !== null; current = current.parent) {
      if (!current.visible) return false;
    }
    return true;
  }
}
