import { Matrix4, Mesh, Object3D, Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export const NET_BASKET_CENTER = [0, 0.03, -0.56] as const;
export const NET_CATCH_CLEARANCE = 0.008;

function vertices(root: Object3D, transform = new Matrix4()): Vector3[] {
  root.updateWorldMatrix(true, true);
  const points: Vector3[] = [];
  const matrix = new Matrix4();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    matrix.multiplyMatrices(transform, object.matrixWorld);
    const position = object.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      points.push(new Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix));
    }
  });
  return points;
}

/** Measures the production basket once. Catch placement runs only when loading a catch. */
export class NetCatchPlacement {
  private hull: ConvexHull | null = null;

  constructor(private readonly net: Object3D) {}

  place(catchModel: Object3D): void {
    const hull = this.hull ??= this.createHull();
    const points = vertices(catchModel);
    let lower = -Infinity;
    let upper = Infinity;
    for (const face of hull.faces) {
      let support = -Infinity;
      for (const point of points) support = Math.max(support, face.normal.dot(point));
      const remaining = face.constant - NET_CATCH_CLEARANCE - support;
      if (Math.abs(face.normal.y) < 1e-7) {
        if (remaining < 0) throw new Error(`Catch exceeds net width: ${catchModel.name}`);
      } else if (face.normal.y > 0) {
        upper = Math.min(upper, remaining / face.normal.y);
      } else {
        lower = Math.max(lower, remaining / face.normal.y);
      }
    }
    if (!Number.isFinite(lower) || lower > upper) {
      throw new Error(`Catch exceeds net basket: ${catchModel.name}`);
    }
    catchModel.position.y += lower;
    catchModel.updateMatrixWorld(true);
  }

  private createHull(): ConvexHull {
    const bag = this.net.getObjectByName('FishingNet_3');
    if (!bag) throw new Error('Fishing net is missing its basket mesh.');
    this.net.updateWorldMatrix(true, true);
    const parentInverse = this.net.parent?.matrixWorld.clone().invert() ?? new Matrix4();
    const toBasket = new Matrix4().makeTranslation(
      -NET_BASKET_CENTER[0], -NET_BASKET_CENTER[1], -NET_BASKET_CENTER[2],
    ).multiply(parentInverse);
    // Weld repeated GLB vertices at micrometre precision before building the hull.
    const unique = new Map<string, Vector3>();
    for (const point of vertices(bag, toBasket)) {
      point.set(Math.round(point.x * 1e6) / 1e6, Math.round(point.y * 1e6) / 1e6, Math.round(point.z * 1e6) / 1e6);
      unique.set(point.toArray().join(','), point);
    }
    return new ConvexHull().setFromPoints([...unique.values()]);
  }
}
