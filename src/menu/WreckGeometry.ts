import {
  BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry,
  Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Quaternion,
  TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type WreckPoint = readonly [number, number, number];

/** Construction-only batches. The finished wreck has one draw call per material. */
export class WreckGeometry {
  private readonly batches = new Map<MeshStandardMaterial, BufferGeometry[]>();

  add(geometry: BufferGeometry, material: MeshStandardMaterial, tint = 0xffffff): void {
    const color = new Color(tint);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    // UVs are unused. Normalize attributes before merging the primitive and custom meshes.
    geometry.deleteAttribute('uv');
    if (!geometry.index) {
      geometry.setIndex(Array.from({ length: count }, (_, index) => index));
    }
    const batch = this.batches.get(material);
    if (batch) batch.push(geometry);
    else this.batches.set(material, [geometry]);
  }

  box(size: WreckPoint, position: WreckPoint, material: MeshStandardMaterial,
    rotation: WreckPoint = [0, 0, 0], tint = 0xffffff): void {
    const geometry = new BoxGeometry(...size);
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    this.add(geometry, material, tint);
  }

  beam(start: WreckPoint, end: WreckPoint, width: number,
    material: MeshStandardMaterial, depth = width): void {
    const from = new Vector3(...start);
    const to = new Vector3(...end);
    const direction = to.clone().sub(from);
    const geometry = new BoxGeometry(width, direction.length(), depth);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0), direction.normalize(),
    ));
    geometry.translate(...from.add(to).multiplyScalar(0.5).toArray());
    this.add(geometry, material);
  }

  cylinder(top: number, bottom: number, height: number, position: WreckPoint,
    material: MeshStandardMaterial, rotation: WreckPoint = [0, 0, 0], open = false): void {
    const geometry = new CylinderGeometry(top, bottom, height, 12, 1, open);
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    this.add(geometry, material);
  }

  panel(points: readonly WreckPoint[], material: MeshStandardMaterial, tint = 0xffffff): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i += 1) indices.push(0, i, i + 1);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.add(geometry, material, tint);
  }

  cable(points: readonly WreckPoint[], radius: number, material: MeshStandardMaterial): void {
    const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)));
    this.add(new TubeGeometry(curve, 16, radius, 5, false), material);
  }

  finish(root: Group): void {
    try {
      for (const [material, pieces] of this.batches) {
        const geometry = mergeGeometries(pieces);
        if (!geometry) throw new Error(`Cannot merge wreck material ${material.name}`);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new Mesh(geometry, material);
        mesh.name = `menu:dorothy-wreck-${material.name}`;
        root.add(mesh);
      }
    } finally {
      for (const pieces of this.batches.values()) {
        for (const geometry of pieces) geometry.dispose();
      }
      this.batches.clear();
    }
  }
}
