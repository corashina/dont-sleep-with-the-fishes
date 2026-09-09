import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { smoothstepUnchecked } from './animationMath';

function createPlankGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -1.00, 0.08, -0.18,
    1.08, 0.08, -0.13,
    0.94, 0.08, 0.20,
    -0.90, 0.08, 0.16,
    -1.00, -0.08, -0.18,
    1.08, -0.08, -0.13,
    0.94, -0.08, 0.20,
    -0.90, -0.08, 0.16,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    7, 6, 5, 7, 5, 4,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 30, 1);
  geometry.computeVertexNormals();
  return geometry;
}


const PLACEMENTS = [
  [-1.5, 0.04, 1.9, 0.34, 0.82],
  [0, 0.07, 1.6, -0.46, 0.88],
  [1.4, 0.02, 0.4, 0.72, 0.92],
  [-1.2, 0.10, 0.5, 0.18, 0.95],
  [0.2, 0.06, -1, -0.62, 0.78],
  [1.5, 0.08, -1.4, 1.02, 0.7],
  [-1.1, 0.03, -2, -0.2, 0.62],
  [0.5, 0.12, -2.7, 0.58, 0.56],
] as const;

export class DriftingDebris {
  readonly root = new Group();
  private readonly geometry = createPlankGeometry();
  private readonly materials = [
    new MeshStandardMaterial({ color: 0x8a5a35, roughness: 0.92, flatShading: true }),
    new MeshStandardMaterial({ color: 0x5f3a24, roughness: 0.96, flatShading: true }),
  ];

  constructor(box: Group, crate: Group, pallet: Group) {
    this.root.name = 'wreckage-surface-debris';
    this.root.add(box, crate, pallet);
    for (let index = 3; index < PLACEMENTS.length; index += 1) {
      const plank = new Mesh(this.geometry, this.materials);
      plank.name = `wreckage-plank-${index - 3}`;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.root.add(plank);
    }
  }

  setPose(side: -1 | 1, progress: number): void {
    for (let index = 0; index < PLACEMENTS.length; index += 1) {
      const [x, y, z, yaw, scale] = PLACEMENTS[index]!;
      const part = this.root.children[index]!;
      const sink = smoothstepUnchecked(Math.max(0, Math.min(1, (progress - index * 0.025) / 0.825)));
      part.position.set(x * side, y - 2 * sink, z);
      part.rotation.set(0.03, yaw * side, -0.04 * side + sink * 0.12);
      part.scale.setScalar(scale);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
