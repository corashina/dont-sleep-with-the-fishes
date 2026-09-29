import { MathUtils, Matrix3, Quaternion, Raycaster, Vector3, type Object3D } from 'three';
import { LIFEBOAT_FLOOR_SURFACE_Y, lifeboatHullHalfWidthAt } from '../../world/Lifeboat';

const UP = new Vector3(0, 1, 0);
const ease = (t: number) => t * t * (3 - 2 * t);

/** Stage-time contact queries in boat coordinates. */
export class CrabSurface {
  readonly wood: Object3D[];
  readonly origin = new Vector3();
  readonly direction = new Vector3();
  readonly normal = new Vector3();
  private readonly ray = new Raycaster();
  private readonly worldNormal = new Matrix3();
  private readonly boatNormal: Matrix3;

  constructor(private readonly boat: Object3D) {
    this.wood = ['lifeboat-hull-planks', 'survival-gunwale'].map(name => this.object(name));
    boat.updateWorldMatrix(true, true);
    this.boatNormal = new Matrix3().getNormalMatrix(boat.matrixWorld).invert();
  }

  object(name: string): Object3D {
    const object = this.boat.getObjectByName(name);
    if (!object) throw new Error(`Crab paths require ${name}.`);
    return object;
  }

  project(position: Vector3, targets = this.wood): void {
    this.boat.localToWorld(this.origin);
    this.direction.transformDirection(this.boat.matrixWorld);
    this.ray.set(this.origin, this.direction);
    this.ray.far = 2.5;
    const hit = this.ray.intersectObjects(targets, true)[0];
    if (!hit?.face) throw new Error('Missing crab timber contact.');
    this.worldNormal.getNormalMatrix(hit.object.matrixWorld);
    this.normal.copy(hit.face.normal).applyMatrix3(this.worldNormal).applyMatrix3(this.boatNormal).normalize();
    position.copy(hit.point);
    this.boat.worldToLocal(position);
    position.addScaledVector(this.normal, 0.008);
    // Feet span the plank seams. Their bevels must not pitch the whole body up and down.
    if (hit.object.name.startsWith('lifeboat-hull-strake-')) this.normal.setY(0).normalize();
  }
}

/** Turn from a wall onto the floor while keeping actual body vertices clear of both planes. */
export class CrabFloorLanding {
  readonly z = -0.85;
  private readonly y = LIFEBOAT_FLOOR_SURFACE_Y;
  private readonly x: number;
  private readonly targets: Object3D[];
  private readonly corner = new Vector3();
  private readonly inward = new Vector3();
  private readonly normal = new Vector3();
  private readonly point = new Vector3();
  private readonly turn: Quaternion;

  constructor(private readonly side: number, yaw: number,
    private readonly bodyPoints: readonly Vector3[], private readonly surface: CrabSurface) {
    this.x = side < 0 ? -0.65 : 0.26;
    this.targets = [surface.object('lifeboat-floorboards'), surface.object('survival-floor')];
    this.turn = new Quaternion().setFromAxisAngle(UP, yaw);
    surface.origin.set(0, this.y + 0.06, this.z);
    surface.direction.set(side, 0, 0);
    surface.project(this.corner);
    this.inward.copy(surface.normal);
  }

  private cornerPose(angle: number, position: Vector3, rotation: Quaternion): void {
    this.normal.copy(this.inward).multiplyScalar(Math.cos(angle)).addScaledVector(UP, Math.sin(angle));
    rotation.setFromUnitVectors(UP, this.normal).multiply(this.turn);
    let wallMin = Infinity;
    let floorMin = Infinity;
    for (const vertex of this.bodyPoints) {
      this.point.copy(vertex).applyQuaternion(rotation);
      wallMin = Math.min(wallMin, this.point.dot(this.inward));
      floorMin = Math.min(floorMin, this.point.y);
    }
    position.copy(this.corner).addScaledVector(this.inward, -wallMin);
    position.y = this.y + 0.008 - floorMin;
  }

  sample(travel: number, position: Vector3, rotation: Quaternion): void {
    if (travel < 0.75) {
      this.cornerPose(0, position, rotation);
      this.surface.origin.set(this.side * (lifeboatHullHalfWidthAt(this.z)! - 2),
        MathUtils.lerp(0.39, position.y, (travel - 0.55) / 0.2), this.z);
      this.surface.direction.set(this.side, 0, 0);
      this.surface.project(position);
      rotation.setFromUnitVectors(UP, this.surface.normal).multiply(this.turn);
    } else if (travel < 0.88) {
      this.cornerPose(ease((travel - 0.75) / 0.13) * Math.PI / 2, position, rotation);
    } else {
      this.cornerPose(Math.PI / 2, position, rotation);
      this.surface.origin.copy(position);
      this.surface.origin.x = MathUtils.lerp(position.x, this.x, ease((travel - 0.88) / 0.12));
      this.surface.origin.y = this.y + 1;
      this.surface.direction.set(0, -1, 0);
      this.surface.project(position, this.targets);
      // The feet span the floorboard gaps; do not drop the body into each gap.
      position.y = Math.max(position.y, this.y + 0.008);
      rotation.copy(this.turn);
    }
  }
}
