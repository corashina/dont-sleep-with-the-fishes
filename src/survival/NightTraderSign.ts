import {
  BoxGeometry, BufferGeometry, DoubleSide, ExtrudeGeometry, Group, Material,
  Mesh, MeshStandardMaterial, Shape, ShapeGeometry,
} from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { itemArtwork } from '../ui/uiArtwork';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { ItemId } from '../game/ItemState';
import type { NightTraderTrade } from './nightTraderTrades';

const ROW_HEIGHT = 0.43;
const ICON_SCALE = 0.0064;
const PAINT = {
  primary: '#d7c49b', secondary: '#a59876', light: '#ead9b2',
  ink: '#392c20', cutout: '#614630',
} as const;

function paintedArtwork(id: ItemId): string {
  return itemArtwork(id).replace(/class="([^"]*)"/g, (_match, classNames: string) => {
    const names = classNames.split(' ');
    const color = Object.entries(PAINT).find(([name]) => names.includes(`item-artwork__${name}`))?.[1] ?? PAINT.primary;
    const stroke = names.some((name) => name.startsWith('item-artwork__stroke'));
    return stroke ? `fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="${color}"`;
  });
}

/** A boat-mounted sign. Drawings reuse the game's illustrated item silhouettes. */
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
    const lanternArm = new Mesh(new BoxGeometry(0.52, 0.055, 0.07), endGrain);
    lanternArm.position.set(0.88, 1.08, -0.03);
    const lanternHook = new Mesh(new BoxGeometry(0.05, 0.055, 0.45), nail);
    lanternHook.position.set(1.1, 1.08, 0.16);
    this.root.add(lanternArm, lanternHook);
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
      const paint = new MeshStandardMaterial({ color: PAINT.light, roughness: 1, side: DoubleSide });
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
    const { paths } = loader.parse(paintedArtwork(id));
    paths.forEach((path, index) => {
      const style = path.userData!.style;
      if (style.fill !== undefined && style.fill !== 'none') {
        const shape = new ShapeGeometry(SVGLoader.createShapes(path), 10);
        const geometry = shape.toNonIndexed();
        shape.dispose();
        this.addPaint(batches, geometry, style.fill, x, y, index);
      }
      if (style.stroke !== undefined && style.stroke !== 'none') {
        for (const subPath of path.subPaths) {
          const geometry = SVGLoader.pointsToStroke(subPath.getPoints(12), style, 6);
          this.addPaint(batches, geometry, style.stroke, x, y, index);
        }
      }
    });
  }

  private addPaint(batches: Map<string, BufferGeometry[]>, geometry: BufferGeometry, color: string, x: number, y: number, layer: number): void {
    geometry.translate(-40, -36, 0);
    geometry.scale(ICON_SCALE, -ICON_SCALE, 1);
    // SVG Y points down. Recompute normals after reflection so the paint receives front lighting.
    geometry.computeVertexNormals();
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
