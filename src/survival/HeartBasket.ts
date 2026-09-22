import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Group,
  Mesh, MeshStandardMaterial, Shape, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function outline(width: number, depth: number, radius: number): Shape {
  const x = width / 2, z = depth / 2;
  const shape = new Shape();
  shape.moveTo(-x + radius, -z);
  shape.lineTo(x - radius, -z);
  shape.quadraticCurveTo(x, -z, x, -z + radius);
  shape.lineTo(x, z - radius);
  shape.quadraticCurveTo(x, z, x - radius, z);
  shape.lineTo(-x + radius, z);
  shape.quadraticCurveTo(-x, z, -x, z - radius);
  shape.lineTo(-x, -z + radius);
  shape.quadraticCurveTo(-x, -z, -x + radius, -z);
  return shape;
}

function reed(parts: BufferGeometry[], points: Vector3[], radius: number, closed = false): void {
  parts.push(new TubeGeometry(new CatmullRomCurve3(points, closed), points.length * 2, radius, 5, closed));
}

function strip(parts: BufferGeometry[], x: number, y: number, z: number,
  width: number, height: number, depth: number): void {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  parts.push(geometry);
}

/** An open woven tray with a low front, rounded corners, and a bound rim. */
export class HeartBasket {
  readonly root = new Group();
  private readonly meshes: Mesh[] = [];

  constructor(width: number, depth: number) {
    this.root.name = 'heart-basket';
    const reeds: BufferGeometry[] = [];
    const bindings: BufferGeometry[] = [];
    const lining: BufferGeometry[] = [];
    const floor = new ExtrudeGeometry(outline(width - 0.012, depth - 0.012, 0.022), {
      depth: 0.012, bevelEnabled: false, curveSegments: 5,
    });
    floor.rotateX(Math.PI / 2);
    floor.translate(0, 0.018, 0);
    lining.push(floor);
    for (let x = -width / 2 + 0.025; x < width / 2 - 0.015; x += 0.021) {
      strip(reeds, x, 0.020, 0, 0.013, 0.004, depth - 0.035);
    }
    for (let z = -depth / 2 + 0.025; z < depth / 2 - 0.015; z += 0.021) {
      strip(lining, 0, 0.024, z, width - 0.035, 0.004, 0.009);
    }
    this.addWeave(width, depth, reeds, bindings, lining);
    const layers = [
      [reeds, 0x9b7d50, 'basket-woven-reeds'],
      [bindings, 0x6e5333, 'basket-rim-bindings'],
      [lining, 0xb09163, 'basket-inner-weave'],
    ] as const;
    for (const [parts, color, name] of layers) {
      const unindexed = parts.map(part => part.index === null ? part : part.toNonIndexed());
      const geometry = mergeGeometries(unindexed);
      for (const part of new Set([...parts, ...unindexed])) part.dispose();
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.92 }));
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.root.add(mesh);
    }
  }

  private addWeave(width: number, depth: number, reeds: BufferGeometry[],
    bindings: BufferGeometry[], lining: BufferGeometry[]): void {
    const count = 72;
    const perimeter = outline(width, depth, 0.027).getSpacedPoints(count).slice(0, count);
    const normals = perimeter.map((_, index) => {
      const before = perimeter[(index + count - 1) % count]!;
      const after = perimeter[(index + 1) % count]!;
      return new Vector3(after.y - before.y, 0, before.x - after.x).normalize();
    });
    const heights = perimeter.map(point => {
      const back = Math.max(0, Math.min(1, (depth / 2 - point.y) / depth));
      return 0.050 + 0.075 * back * back * (3 - 2 * back);
    });
    // Continuous reeds pass alternately inside and outside the upright stakes.
    for (let row = 0; row < 6; row++) {
      const points = perimeter.map((point, index) => {
        const y = 0.030 + (heights[index]! - 0.037) * row / 5;
        const offset = Math.cos(index * Math.PI / 2 + row * Math.PI) * 0.0025;
        return new Vector3(point.x, y, point.y).addScaledVector(normals[index]!, offset);
      });
      reed(row % 3 === 0 ? lining : reeds, points, 0.0025, true);
    }
    for (let index = 0; index < count; index += 2) {
      const point = perimeter[index]!;
      reed(bindings, [
        new Vector3(point.x, 0.022, point.y),
        new Vector3(point.x, heights[index]! * 0.58, point.y),
        new Vector3(point.x, heights[index]!, point.y),
      ], 0.0023);
    }
    const rim = perimeter.map((point, index) => new Vector3(point.x, heights[index]!, point.y));
    reed(reeds, rim, 0.006, true);
    reed(lining, rim.map(point => point.clone().add(new Vector3(0, 0.004, 0))), 0.0018, true);
    // Lashings secure the rolled rim to the stakes without covering the opening.
    for (let index = 0; index < count; index += 6) {
      const points: Vector3[] = [];
      for (let step = 0; step < 10; step++) {
        const angle = step / 10 * Math.PI * 2;
        points.push(rim[index]!.clone().addScaledVector(normals[index]!, Math.cos(angle) * 0.007)
          .add(new Vector3(0, Math.sin(angle) * 0.007, 0)));
      }
      reed(bindings, points, 0.0014, true);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.root.clear();
    this.root.removeFromParent();
  }
}
