import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { disposeResourceSets } from './SceneResources';
import type { FootprintAnchor } from './ShipDangerLayout';

export class ShipPuddleEffects {
  readonly root = new Group();

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor(private readonly puddles: readonly FootprintAnchor[]) {
    this.root.name = 'ship-danger-puddle-effects';
    const geometry = this.ownGeometry(createPuddleGeometry());
    const material = this.ownMaterial(new MeshStandardMaterial({
      color: 0x496773,
      transparent: true,
      opacity: 0.42,
      roughness: 0.92,
      metalness: 0,
      depthWrite: false,
    }));
    puddles.forEach((anchor) => {
      const puddle = new Mesh(geometry, material);
      puddle.name = `ship-danger-puddle:${anchor.id}`;
      puddle.position.set(...anchor.position);
      puddle.rotation.set(...anchor.rotation);
      puddle.scale.set(anchor.size[0], anchor.size[1], 1);
      this.root.add(puddle);
    });
  }

  snapshotForTest(): { puddleCount: number } {
    return { puddleCount: this.puddles.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends MeshStandardMaterial>(material: T): T {
    this.materials.add(material);
    return material;
  }
}

function createPuddleGeometry(): BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0, 0.49, 0.04, 0, 0.78, 0.26, 0, 0.94, 0.58, 0,
    0.69, 0.86, 0, 0.23, 0.98, 0, -0.24, 0.87, 0, -0.7, 0.72, 0,
    -0.96, 0.31, 0, -0.82, -0.2, 0, -0.41, -0.61, 0, 0.14, -0.73, 0,
  ]);
  const indices: number[] = [];
  for (let index = 1; index < 11; index += 1) indices.push(0, index, index + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
