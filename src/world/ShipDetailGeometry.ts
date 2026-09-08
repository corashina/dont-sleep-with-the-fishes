import {
  BufferGeometry, CatmullRomCurve3, CylinderGeometry, Group, Material, Mesh,
  Quaternion, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = readonly [number, number, number];

/** Bake small static fittings into one mesh per material. Build-time use only. */
export class ShipDetailGeometry {
  private readonly parts = new Map<Material, BufferGeometry[]>();

  constructor(private readonly owned: Set<BufferGeometry>) {}

  box(material: Material, size: Point, position: Point, rotationY = 0, radius = 0.025): void {
    this.add(new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map((v) => v / 3))),
      material, position, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotationY));
  }

  rod(material: Material, start: Point, end: Point, radius: number): void {
    const from = new Vector3(...start);
    const to = new Vector3(...end);
    const direction = to.clone().sub(from);
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
    this.add(new CylinderGeometry(radius, radius, direction.length(), 8), material,
      from.add(to).multiplyScalar(0.5).toArray(), rotation);
  }

  ring(material: Material, position: Point, radius: number, thickness: number, horizontal = false): void {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), horizontal ? Math.PI / 2 : 0);
    this.add(new TorusGeometry(radius, thickness, 6, 16), material, position, rotation);
  }

  tube(material: Material, points: readonly Point[], radius: number): void {
    const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
    this.add(new TubeGeometry(curve, Math.max(12, points.length * 4), radius, 6, false), material, [0, 0, 0]);
  }

  finish(parent: Group | Mesh, name: string): void {
    try {
      for (const [material, parts] of this.parts) {
        const geometry = mergeGeometries(parts, false);
        if (!geometry) throw new Error(`Cannot merge Dorothy details: ${name}`);
        this.owned.add(geometry);
        const mesh = new Mesh(geometry, material);
        mesh.name = `${name}:${parent.children.length}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    } finally {
      for (const parts of this.parts.values()) parts.forEach((part) => part.dispose());
      this.parts.clear();
    }
  }

  private add(geometry: BufferGeometry, material: Material, position: Point, rotation = new Quaternion()): void {
    geometry.applyQuaternion(rotation);
    geometry.translate(...position);
    // RoundedBoxGeometry is non-indexed. Normalize other primitives for merging.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const parts = this.parts.get(material);
    if (parts) parts.push(flat);
    else this.parts.set(material, [flat]);
  }
}
