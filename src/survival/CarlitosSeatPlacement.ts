import {
  Box3, InstancedMesh, Material, Matrix4, Mesh, Object3D, PerspectiveCamera, Quaternion, Ray, Raycaster, SkinnedMesh, Triangle, Vector3,
} from 'three';
import {
  LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, LIFEBOAT_FLOOR_SURFACE_Y, LIFEBOAT_GUNWALE_SURFACE_Y,
  lifeboatHullHalfWidthAt,
} from '../world/Lifeboat';
import type { EventSide } from './eventVariant';

interface Seat {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly yaw: number;
}

// Seats are attached to real support surfaces. Inventory and event models can block them.
const SEATS: readonly Seat[] = [
  ...[-1, 1].flatMap(side => [
    ...[-2.8, -2.4, -1.92, -1.4, 1.6, 2.12, 2.25, 2.35].map(z => ({
      id: `rim-${z}-${side}`, x: side * lifeboatHullHalfWidthAt(z)!, z,
      surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: z < 0 ? Math.PI : 0,
    })),
    { id: `rim-forward-${side}`, x: side * 1.12, z: -2.55, surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: Math.PI },
    { id: `rim-middle-${side}`, x: side * 1.49, z: -2.08, surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: Math.PI },
    { id: `rim-near-${side}`, x: side * 1.58, z: -1.75, surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: Math.PI },
    { id: `bench-${side}`, x: side * 1.08, z: -1.58, surfaceY: LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, yaw: Math.PI },
    { id: `floor-${side}`, x: side * 0.48, z: -2.25, surfaceY: LIFEBOAT_FLOOR_SURFACE_Y, yaw: Math.PI },
    { id: `stern-${side}`, x: side * 0.65, z: 0.88, surfaceY: LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, yaw: 0 },
    { id: `stern-rib-${side}`, x: side * 0.3, z: 1.7, surfaceY: -0.2625, yaw: 0 },
  ]),
  { id: 'bow', x: 0, z: -3, surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: Math.PI },
  { id: 'stern', x: 0, z: 2.4, surfaceY: LIFEBOAT_GUNWALE_SURFACE_Y, yaw: 0 },
  { id: 'stern-rib-center', x: 0, z: 1.7, surfaceY: -0.2625, yaw: 0 },
  { id: 'stern-floor-center', x: 0, z: 2.1, surfaceY: LIFEBOAT_FLOOR_SURFACE_Y, yaw: 0 },
  { id: 'floor-center', x: 0, z: -2.3, surfaceY: LIFEBOAT_FLOOR_SURFACE_Y, yaw: Math.PI },
];
const UP = new Vector3(0, 1, 0);
const VIEW_MARGIN = 0.94;
const SUPPORT_GAP = 0.008;

function isSolidMaterial(material: Material): boolean {
  return material.visible && material.opacity > 0 && !('isShaderMaterial' in material);
}

function supportedSeats(boat: Object3D): readonly Seat[] {
  boat.updateWorldMatrix(true, true);
  const inverse = boat.matrixWorld.clone().invert();
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0).transformDirection(boat.matrixWorld);
  return SEATS.flatMap(seat => {
    ray.set(new Vector3(seat.x, seat.surfaceY + 0.04, seat.z).applyMatrix4(boat.matrixWorld), down);
    ray.far = 0.1;
    const hit = ray.intersectObject(boat, true).find(({ object }) => (
      object.name === 'lifeboat-outer-gunwale' || object.name.startsWith('lifeboat-floorboard-')
      || object.name === 'survival-rib-5'
      || object.name === 'lifeboat-display-bench-seat' || object.name === 'survival-bench-seat-1'
      || object.name === 'lifeboat-bow-cap-plate'
    ));
    return hit === undefined ? [] : [{ ...seat, surfaceY: hit.point.applyMatrix4(inverse).y }];
  });
}

/** Selects supported seats using the current skinned body, visible geometry, and camera. */
export class CarlitosSeatPlacement {
  private readonly bodyMeshes: Mesh[] = [];
  private readonly seats: readonly Seat[];
  private readonly localBounds = new Box3();
  private readonly meshBounds = new Box3();
  private readonly inverseRoot = new Matrix4();
  private readonly meshToRoot = new Matrix4();
  private readonly candidateMatrix = new Matrix4();
  private readonly candidateInverse = new Matrix4();
  private readonly meshToCandidate = new Matrix4();
  private readonly instanceMatrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly point = new Vector3();
  private readonly triangle = new Triangle();
  private readonly viewRay = new Ray();
  private viewDistance = 0;
  private currentSeat: Seat | null = null;
  private preferredSide: EventSide = 1;
  private seed = 0;

  constructor(
    private readonly root: Object3D,
    body: Object3D,
    private readonly boat: Object3D,
    private readonly scene: Object3D,
    private readonly camera: PerspectiveCamera,
  ) {
    body.traverse(object => { if (object instanceof Mesh) this.bodyMeshes.push(object); });
    this.seats = supportedSeats(boat);
  }

  setPreference(side: EventSide, seed = this.seed): void {
    if (side === this.preferredSide && seed === this.seed) return;
    this.preferredSide = side;
    this.seed = seed >>> 0;
    this.currentSeat = null;
  }

  update(): boolean {
    // SkinnedMesh.updateMatrixWorld also refreshes its attached bind matrix.
    this.scene.updateMatrixWorld(true);
    this.camera.updateWorldMatrix(true, false);
    this.measureBody();
    if (this.localBounds.isEmpty()) return false;
    if (this.currentSeat !== null && this.trySeat(this.currentSeat)) return true;
    // Prefer the event's clear side, then consider all other visible seats.
    for (let pass = 0; pass < 2; pass++) {
      for (let offset = 0; offset < this.seats.length; offset++) {
        const seat = this.seats[(this.seed + offset) % this.seats.length]!;
        const preferred = Math.sign(seat.x) === this.preferredSide;
        if (preferred !== (pass === 0)) continue;
        if (this.trySeat(seat)) return true;
      }
    }
    this.currentSeat = null;
    return false;
  }

  private measureBody(): void {
    this.inverseRoot.copy(this.root.matrixWorld).invert();
    this.localBounds.makeEmpty();
    for (const mesh of this.bodyMeshes) {
      this.meshToRoot.multiplyMatrices(this.inverseRoot, mesh.matrixWorld);
      const positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        mesh.getVertexPosition(index, this.point).applyMatrix4(this.meshToRoot);
        this.localBounds.expandByPoint(this.point);
      }
    }
    // Reserve space for small changes in the idle animation, without lifting his feet.
    this.localBounds.min.x -= 0.025;
    this.localBounds.min.z -= 0.025;
    this.localBounds.max.addScalar(0.025);
  }

  private trySeat(seat: Seat): boolean {
    this.position.set(seat.x, seat.surfaceY - this.localBounds.min.y * this.root.scale.y + SUPPORT_GAP, seat.z);
    this.rotation.setFromAxisAngle(UP, seat.yaw);
    this.candidateMatrix.compose(this.position, this.rotation, this.root.scale);
    this.candidateMatrix.premultiply(this.boat.matrixWorld);
    if (!this.fitsViewport()) return false;
    this.candidateInverse.copy(this.candidateMatrix).invert();
    // Projected bounds alone can accept a cat completely hidden behind the chest.
    this.camera.getWorldPosition(this.viewRay.origin).applyMatrix4(this.candidateInverse);
    this.localBounds.getCenter(this.point);
    this.point.y = this.localBounds.max.y - (this.localBounds.max.y - this.localBounds.min.y) * 0.15;
    this.viewRay.direction.copy(this.point).sub(this.viewRay.origin);
    this.viewDistance = this.viewRay.direction.length();
    this.viewRay.direction.normalize();
    if (this.intersectsScene(this.scene)) return false;
    this.root.position.copy(this.position);
    this.root.quaternion.copy(this.rotation);
    this.root.updateMatrixWorld(true);
    this.root.userData.seatId = seat.id;
    this.root.userData.seatSide = seat.x < 0 ? 'left' : 'right';
    this.currentSeat = seat;
    return true;
  }

  private fitsViewport(): boolean {
    const { min, max } = this.localBounds;
    for (let corner = 0; corner < 8; corner++) {
      this.point.set(corner & 1 ? max.x : min.x, corner & 2 ? max.y : min.y, corner & 4 ? max.z : min.z)
        .applyMatrix4(this.candidateMatrix).project(this.camera);
      if (Math.abs(this.point.x) > VIEW_MARGIN || Math.abs(this.point.y) > VIEW_MARGIN
        || this.point.z < -1 || this.point.z > 1) return false;
    }
    return true;
  }

  private intersectsScene(object: Object3D): boolean {
    if (object === this.root || !object.visible) return false;
    if (object instanceof Mesh && this.intersectsMesh(object)) return true;
    for (const child of object.children) {
      if (this.intersectsScene(child)) return true;
    }
    return false;
  }

  private intersectsMesh(mesh: Mesh): boolean {
    // Shader water, sky and effect shells do not represent solid models.
    if (Array.isArray(mesh.material)
      ? !mesh.material.some(isSolidMaterial)
      : !isSolidMaterial(mesh.material)) return false;
    if (mesh instanceof InstancedMesh) return this.intersectsInstances(mesh);
    this.meshToCandidate.multiplyMatrices(this.candidateInverse, mesh.matrixWorld);
    return this.intersectsTransformedMesh(mesh);
  }

  private intersectsInstances(mesh: InstancedMesh): boolean {
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, this.instanceMatrix);
      this.meshToCandidate.multiplyMatrices(this.candidateInverse, mesh.matrixWorld).multiply(this.instanceMatrix);
      if (this.intersectsTransformedMesh(mesh)) return true;
    }
    return false;
  }

  private intersectsTransformedMesh(mesh: Mesh): boolean {
    if (mesh instanceof SkinnedMesh) {
      mesh.computeBoundingBox();
      this.meshBounds.copy(mesh.boundingBox!);
    } else {
      if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
      this.meshBounds.copy(mesh.geometry.boundingBox!);
    }
    this.meshBounds.applyMatrix4(this.meshToCandidate);
    const blocksBody = this.meshBounds.intersectsBox(this.localBounds);
    const blocksView = this.viewRay.intersectBox(this.meshBounds, this.point) !== null
      && this.point.distanceTo(this.viewRay.origin) < this.viewDistance;
    if (!blocksBody && !blocksView) return false;
    if (this.meshBounds.containsBox(this.localBounds)) return true;
    return this.intersectsTriangles(mesh);
  }

  private intersectsTriangles(mesh: Mesh): boolean {
    const indices = mesh.geometry.index;
    const count = indices?.count ?? mesh.geometry.getAttribute('position').count;
    for (let index = 0; index < count; index += 3) {
      mesh.getVertexPosition(indices?.getX(index) ?? index, this.triangle.a).applyMatrix4(this.meshToCandidate);
      mesh.getVertexPosition(indices?.getX(index + 1) ?? index + 1, this.triangle.b).applyMatrix4(this.meshToCandidate);
      mesh.getVertexPosition(indices?.getX(index + 2) ?? index + 2, this.triangle.c).applyMatrix4(this.meshToCandidate);
      if (this.localBounds.intersectsTriangle(this.triangle)) return true;
      if (this.triangleBlocksView()) return true;
    }
    return false;
  }

  private triangleBlocksView(): boolean {
    return this.viewRay.intersectTriangle(this.triangle.a, this.triangle.b, this.triangle.c, false, this.point) !== null
      && this.point.distanceTo(this.viewRay.origin) < this.viewDistance;
  }
}
