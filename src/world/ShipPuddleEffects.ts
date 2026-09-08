import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  RGBAFormat,
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
  private readonly materials = new Set<MeshPhysicalMaterial>();
  private readonly textures = new Set<DataTexture>();
  private disposed = false;

  constructor(private readonly puddles: readonly FootprintAnchor[]) {
    this.root.name = 'ship-danger-puddle-effects';
    const geometry = this.ownGeometry(createPuddleGeometry());
    const alpha = createWetPatchMask();
    this.textures.add(alpha);
    const material = new MeshPhysicalMaterial({
      color: 0x283a37,
      transparent: true,
      opacity: 0.52,
      alphaMap: alpha,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materials.add(material);
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
    disposeResourceSets(this.geometries, this.materials, this.textures);
    this.root.clear();
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

}

function createPuddleShape(): Shape {
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
  return shape;
}

function createPuddleGeometry(): BufferGeometry {
  const geometry = new ShapeGeometry(createPuddleShape(), 4);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, (positions.getX(index) + 1) / 2, (positions.getY(index) + 1) / 2);
  }
  return geometry;
}

function createWetPatchMask(): DataTexture {
  const size = 128;
  const bytes = new Uint8Array(size * size * 4);
  const outline = createPuddleShape().getPoints(4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size * 2 - 1;
      const py = (y + 0.5) / size * 2 - 1;
      let distance = Infinity;
      for (let index = 0; index < outline.length - 1; index += 1) {
        const a = outline[index]!;
        const b = outline[index + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
        distance = Math.min(distance, Math.hypot(px - a.x - dx * t, py - a.y - dy * t));
      }
      const edge = Math.min(1, distance / 0.15);
      const patch = 0.72 + Math.sin(px * 15 + Math.cos(py * 11)) * Math.sin(py * 19) * 0.18;
      const alpha = Math.round(255 * edge * edge * (3 - 2 * edge) * patch);
      bytes.set([alpha, alpha, alpha, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(bytes, size, size, RGBAFormat);
  texture.name = 'dorothy-wet-patch-mask';
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
