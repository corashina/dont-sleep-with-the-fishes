import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { disposeResourceSets } from './SceneResources';
import {
  SHIP_PUDDLE_OUTLINE,
  type FootprintAnchor,
} from './ShipDangerLayout';

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
  const first = SHIP_PUDDLE_OUTLINE[0]!;
  const last = SHIP_PUDDLE_OUTLINE[SHIP_PUDDLE_OUTLINE.length - 1]!;
  const shape = new Shape();
  shape.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  SHIP_PUDDLE_OUTLINE.forEach((point, index) => {
    const next = SHIP_PUDDLE_OUTLINE[(index + 1) % SHIP_PUDDLE_OUTLINE.length]!;
    shape.quadraticCurveTo(
      point[0],
      point[1],
      (point[0] + next[0]) / 2,
      (point[1] + next[1]) / 2,
    );
  });
  shape.closePath();
  return new ShapeGeometry(shape, 4);
}
