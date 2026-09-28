import { Mesh, Raycaster, SkinnedMesh, Triangle, Vector2, Vector3, type Intersection, type Object3D, type PerspectiveCamera } from 'three';

export class BoatInteractionRaycast {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly intersections: Intersection[] = [];
  private readonly triangle = new Triangle();
  private readonly screenPointer = new Vector3();
  private readonly closest = new Vector3();
  private readonly midpoint = new Vector3();
  private readonly nearestPointer = new Vector2();
  private nearestDistanceSquared = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly boat: Object3D,
  ) {}

  hits(target: Object3D, x: number, y: number, width: number, height: number, padding = 0): boolean {
    if (width <= 0 || height <= 0 || !this.isVisible(target)) return false;
    this.camera.updateWorldMatrix(true, false);
    if (this.hitsAt(target, x, y, width, height)) return true;
    if (padding <= 0) return false;
    this.screenPointer.set(x, y, 0);
    this.nearestDistanceSquared = padding * padding;
    this.nearestPointer.set(NaN, NaN);
    this.findNearestPoint(target, width, height);
    return Number.isFinite(this.nearestPointer.x)
      && this.hitsAt(target, this.nearestPointer.x, this.nearestPointer.y, width, height);
  }

  private hitsAt(target: Object3D, x: number, y: number, width: number, height: number): boolean {
    this.pointer.set(x / width * 2 - 1, 1 - y / height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targetDistance = this.distanceTo(target);
    return Number.isFinite(targetDistance) && targetDistance < this.distanceTo(this.boat, target);
  }

  private findNearestPoint(object: Object3D, width: number, height: number): void {
    if (!object.visible) return;
    if (object instanceof Mesh) this.findNearestMeshPoint(object, width, height);
    for (const child of object.children) this.findNearestPoint(child, width, height);
  }

  private findNearestMeshPoint(mesh: Mesh, width: number, height: number): void {
    const { index } = mesh.geometry;
    const count = index?.count ?? mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i += 3) {
      if (!this.projectTriangle(mesh, i, width, height)) continue;
      this.triangle.closestPointToPoint(this.screenPointer, this.closest);
      const distance = this.closest.distanceToSquared(this.screenPointer);
      if (distance >= this.nearestDistanceSquared || !Number.isFinite(distance)) continue;
      this.nearestDistanceSquared = distance;
      // Move just inside the triangle so a shared edge cannot miss through rounding.
      this.closest.lerp(this.triangle.getMidpoint(this.midpoint), 0.00001);
      this.nearestPointer.set(this.closest.x, this.closest.y);
    }
  }

  private projectTriangle(mesh: Mesh, i: number, width: number, height: number): boolean {
    const { index } = mesh.geometry;
    const { a, b, c } = this.triangle;
    return this.projectVertex(mesh, index?.getX(i) ?? i, a, width, height)
      && this.projectVertex(mesh, index?.getX(i + 1) ?? i + 1, b, width, height)
      && this.projectVertex(mesh, index?.getX(i + 2) ?? i + 2, c, width, height);
  }

  private projectVertex(mesh: Mesh, index: number, point: Vector3, width: number, height: number): boolean {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).project(this.camera);
    if (point.z < -1 || point.z > 1) return false;
    point.set((point.x + 1) * width / 2, (1 - point.y) * height / 2, 0);
    return true;
  }

  blocksBeforeVisibleTarget(
    target: Object3D,
    x: number,
    y: number,
    sampleX: number,
    sampleY: number,
    width: number,
    height: number,
  ): boolean {
    if (width <= 0 || height <= 0 || !this.isVisible(target)) return true;
    this.camera.updateWorldMatrix(true, false);
    this.pointer.set(sampleX / width * 2 - 1, 1 - sampleY / height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targetDistance = this.distanceTo(target);
    if (!Number.isFinite(targetDistance)) return true;
    this.pointer.set(x / width * 2 - 1, 1 - y / height * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.distanceTo(this.boat, target) < targetDistance;
  }

  private distanceTo(root: Object3D, excludedRoot?: Object3D): number {
    if (!this.isVisible(root)) return Infinity;
    root.updateWorldMatrix(true, true);
    this.intersections.length = 0;
    this.intersectVisible(root, excludedRoot);
    let distance = Infinity;
    for (const hit of this.intersections) distance = Math.min(distance, hit.distance);
    return distance;
  }

  private intersectVisible(object: Object3D, excludedRoot?: Object3D): void {
    if (!object.visible || object === excludedRoot) return;
    if (object instanceof Mesh) {
      if (object instanceof SkinnedMesh) {
        object.skeleton.update();
        object.computeBoundingSphere();
        if (object.boundingBox !== null) object.computeBoundingBox();
      }
      this.raycaster.intersectObject(object, false, this.intersections);
    }
    for (const child of object.children) this.intersectVisible(child, excludedRoot);
  }

  private isVisible(object: Object3D): boolean {
    for (let current: Object3D | null = object; current !== null; current = current.parent) {
      if (!current.visible) return false;
    }
    return true;
  }
}
