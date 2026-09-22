import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function addStrip(parts: BoxGeometry[], x: number, y: number, z: number,
  w: number, h: number, d: number): void {
  const geometry = new BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  parts.push(geometry);
}

/** A shallow reed basket with a lowered front lip and an uncovered interior. */
export class HeartBasket {
  readonly root = new Group();
  private readonly meshes: Mesh[] = [];

  constructor(width: number, depth: number) {
    this.root.name = 'heart-basket';
    const reeds: BoxGeometry[] = [];
    const bindings: BoxGeometry[] = [];
    const add = addStrip;
    // The closed base supports every piece; crossed strips explain the weave.
    add(bindings, 0, 0.009, 0, width, 0.018, depth);
    for (let x = -width / 2 + 0.012; x < width / 2; x += 0.023) {
      add(reeds, x, 0.020, 0, 0.018, 0.005, depth - 0.012);
    }
    for (let z = -depth / 2 + 0.012; z < depth / 2; z += 0.023) {
      add(bindings, 0, 0.024, z, width - 0.012, 0.004, 0.009);
    }
    this.addWalls(width, depth, reeds, bindings);
    for (const [parts, color] of [[reeds, 0x8d7047], [bindings, 0x645036]] as const) {
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.95 }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.root.add(mesh);
    }
  }

  private addWalls(width: number, depth: number, reeds: BoxGeometry[], bindings: BoxGeometry[]): void {
    const add = addStrip;
    for (let row = 0; row < 6; row++) {
      const y = 0.034 + row * 0.018;
      const parts = row % 2 ? bindings : reeds;
      add(parts, 0, y, -depth / 2, width, 0.013, 0.012);
      if (row < 3) add(parts, 0, y, depth / 2, width, 0.013, 0.012);
      // The side walls step down toward the player.
      const length = depth * (row < 3 ? 1 : (6 - row) / 4);
      for (const sign of [-1, 1]) {
        add(parts, sign * width / 2, y, (length - depth) / 2,
          0.012, 0.013, length);
      }
    }
    for (let x = -width / 2; x <= width / 2 + 0.001; x += width / 8) {
      add(bindings, x, 0.079, -depth / 2, 0.009, 0.118, 0.018);
      add(bindings, x, 0.052, depth / 2, 0.009, 0.064, 0.018);
    }
    for (const sign of [-1, 1]) {
      for (let index = 0; index <= 6; index++) {
        const z = -depth / 2 + depth * index / 6;
        const height = index <= 1 ? 0.118 : index <= 3 ? 0.100 : index <= 4 ? 0.082 : 0.064;
        add(bindings, sign * width / 2, 0.02 + height / 2, z,
          0.018, height, 0.009);
      }
    }
    add(reeds, 0, 0.140, -depth / 2, width + 0.020, 0.020, 0.022);
    add(reeds, 0, 0.084, depth / 2, width + 0.020, 0.020, 0.022);
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
