import {
  BoxGeometry, BufferGeometry, DoubleSide, ExtrudeGeometry, Group, Material,
  Mesh, MeshStandardMaterial, Shape, ShapeGeometry,
} from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nightTraderArtwork } from './nightTraderArtwork';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { ItemId } from '../game/ItemState';
import type { NightTraderTrade } from './nightTraderTrades';

const ROW_HEIGHT = 0.51;
const ICON_SCALE = 0.0072;
const PAINT_COLOR = '#f0dfb7';

function facePaintForward(geometry: BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i += 3) {
    const ax = positions.getX(i + 1) - positions.getX(i);
    const ay = positions.getY(i + 1) - positions.getY(i);
    const bx = positions.getX(i + 2) - positions.getX(i);
    const by = positions.getY(i + 2) - positions.getY(i);
    if (ax * by - ay * bx <= 0) continue;
    const x = positions.getX(i + 1);
    const y = positions.getY(i + 1);
    positions.setXYZ(i + 1, positions.getX(i + 2), positions.getY(i + 2), 0);
    positions.setXYZ(i + 2, x, y, 0);
    const u = uv.getX(i + 1);
    const v = uv.getY(i + 1);
    uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
    uv.setXY(i + 2, u, v);
  }
  geometry.computeVertexNormals();
}

/** A boat-mounted sign with painted illustrations readable at trade distance. */
export class NightTraderSign {
  readonly root = new Group();
  private readonly drawings = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();

  constructor() {
    this.root.name = 'night-trader-sign';
    this.drawings.name = 'night-trader-sign-drawings';
    const wood = new MeshStandardMaterial({ color: 0x614630, roughness: 0.98, flatShading: true });
    const endGrain = new MeshStandardMaterial({ color: 0x3e3025, roughness: 1 });
    const nail = new MeshStandardMaterial({ color: 0x584a3c, roughness: 0.8, metalness: 0.35 });
    for (const x of [-0.62, 0.62]) {
      const post = new Mesh(new BoxGeometry(0.085, 4.2, 0.11), endGrain);
      post.position.set(x, -0.85, -0.09);
      this.root.add(post);
    }
    for (let row = 0; row < 5; row++) {
      const y = (2 - row) * ROW_HEIGHT;
      const edge = row % 2 === 0 ? 0.025 : -0.015;
      const outline = new Shape();
      outline.moveTo(-0.9, -0.193);
      outline.lineTo(0.89 + edge, -0.2);
      outline.lineTo(0.915, 0.176);
      outline.lineTo(0.56, 0.193);
      outline.lineTo(-0.88 + edge, 0.198);
      outline.lineTo(-0.905, -0.05);
      outline.closePath();
      const plank = new Mesh(new ExtrudeGeometry(outline, {
        depth: 0.075, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1, steps: 1,
      }), wood);
      plank.name = `night-trader-sign-plank-${row + 1}`;
      plank.scale.y = 1.18;
      plank.position.set(0, y, -0.075);
      this.root.add(plank);
      for (const x of [-0.78, 0.78]) {
        const fastener = new Mesh(new BoxGeometry(0.026, 0.027, 0.016), nail);
        fastener.position.set(x, y + 0.1, 0.012);
        fastener.rotation.z = row * 0.3;
        this.root.add(fastener);
        const split = new Mesh(new BoxGeometry(0.18, 0.007, 0.003), endGrain);
        split.position.set(x * 0.86, y - 0.143, 0.012);
        split.rotation.z = 0.035 * (row - 2);
        this.root.add(split);
      }
      const arrow = new Shape();
      arrow.moveTo(-0.15, -0.02);
      arrow.lineTo(0.05, -0.02);
      arrow.lineTo(0.035, -0.085);
      arrow.lineTo(0.17, 0.008);
      arrow.lineTo(0.035, 0.087);
      arrow.lineTo(0.05, 0.028);
      arrow.lineTo(-0.15, 0.022);
      arrow.closePath();
      const paint = new MeshStandardMaterial({ color: PAINT_COLOR, roughness: 1, side: DoubleSide });
      const arrowMesh = new Mesh(new ShapeGeometry(arrow), paint);
      arrowMesh.position.set(0, y, 0.019);
      this.root.add(arrowMesh);
    }
    this.root.add(this.drawings);
  }

  setOffers(offers: readonly NightTraderTrade[]): void {
    this.clearDrawings();
    const batches = new Map<string, BufferGeometry[]>();
    const loader = new SVGLoader();
    offers.forEach(({ payment, reward }, row) => {
      this.addIcon(loader, batches, payment, -0.47, (2 - row) * ROW_HEIGHT);
      this.addIcon(loader, batches, reward, 0.47, (2 - row) * ROW_HEIGHT);
    });
    for (const [color, parts] of batches) {
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      const material = new MeshStandardMaterial({ color, roughness: 1, side: DoubleSide });
      this.drawings.add(new Mesh(geometry, material));
    }
    collectMeshResources(this.drawings, this.geometries, this.materials);
    this.root.userData.offers = offers.map(({ id, payment, reward }) => ({ id, payment, reward }));
  }

  dispose(): void {
    this.clearDrawings();
  }

  private addIcon(loader: SVGLoader, batches: Map<string, BufferGeometry[]>, id: ItemId, x: number, y: number): void {
    const { paths } = loader.parse(nightTraderArtwork(id));
    paths.forEach((path, index) => {
      const style = path.userData!.style;
      if (style.fill !== undefined && style.fill !== 'none') {
        const shape = new ShapeGeometry(SVGLoader.createShapes(path), 10);
        const geometry = shape.toNonIndexed();
        shape.dispose();
        this.addPaint(batches, geometry, style.fill, x, y, index * 2);
      }
      if (style.stroke !== undefined && style.stroke !== 'none') {
        for (const subPath of path.subPaths) {
          const geometry = SVGLoader.pointsToStroke(subPath.getPoints(12), style, 6);
          this.addPaint(batches, geometry, style.stroke, x, y, index * 2 + 1);
        }
      }
    });
  }

  private addPaint(batches: Map<string, BufferGeometry[]>, geometry: BufferGeometry, color: string, x: number, y: number, layer: number): void {
    geometry.translate(-40, -36, 0);
    geometry.scale(ICON_SCALE, -ICON_SCALE, 1);
    // SVG Y points down; round stroke joins can also contain reversed triangles.
    facePaintForward(geometry);
    geometry.translate(x, y, 0.018 + layer * 0.001);
    const batch = batches.get(color) ?? [];
    batch.push(geometry);
    batches.set(color, batch);
  }

  private clearDrawings(): void {
    disposeResourceSets(this.geometries, this.materials);
    this.drawings.clear();
  }
}
