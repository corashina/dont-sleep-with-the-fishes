import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { disposeResourceSets } from '../world/SceneResources';

export const DOROTHY_WRECK_POSITION = [1.6, 1.8, -19.5] as const;
export const DOROTHY_WRECK_ROTATION = [0.06, -1.42, -0.16] as const;
export const DOROTHY_WRECK_SCALE = 2;
const HULL_STATIONS = [
  { z: -9, width: 0.15, deck: 0.35, chine: -0.35, keel: -0.72 },
  { z: -7.4, width: 1.65, deck: 0.58, chine: -0.72, keel: -1.15 },
  { z: -4.5, width: 2.35, deck: 0.68, chine: -0.92, keel: -1.32 },
  { z: 0, width: 2.65, deck: 0.72, chine: -1.02, keel: -1.38 },
  { z: 4.6, width: 2.5, deck: 0.66, chine: -0.96, keel: -1.32 },
  { z: 7.5, width: 1.75, deck: 0.55, chine: -0.7, keel: -1.1 },
  { z: 9, width: 0.3, deck: 0.42, chine: -0.3, keel: -0.72 },
] as const;
export const DOROTHY_HULL_STATION_COUNT = HULL_STATIONS.length;

export const DOROTHY_WRECK_PART_NAMES = [
  'menu:dorothy-wreck-hull',
  'menu:dorothy-wreck-deck',
  'menu:dorothy-wreck-deckhouse-aft',
  'menu:dorothy-wreck-deckhouse-forward',
  'menu:dorothy-wreck-funnel-forward',
  'menu:dorothy-wreck-funnel-aft',
  'menu:dorothy-wreck-mast',
  'menu:dorothy-wreck-yard',
  'menu:dorothy-wreck-rail-port',
  'menu:dorothy-wreck-rail-starboard',
  'menu:dorothy-wreck-torn-plate-1',
  'menu:dorothy-wreck-torn-plate-2',
  'menu:dorothy-wreck-torn-plate-3',
] as const;

const HULL_VERTICES_PER_STATION = 6;

function createHullGeometry(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of HULL_STATIONS) {
    const chineWidth = station.width * 0.82;
    const keelWidth = station.width * 0.28;
    positions.push(
      -station.width, station.deck, station.z,
      -chineWidth, station.chine, station.z,
      -keelWidth, station.keel, station.z,
      keelWidth, station.keel, station.z,
      chineWidth, station.chine, station.z,
      station.width, station.deck, station.z,
    );
  }
  for (let station = 0; station < HULL_STATIONS.length - 1; station += 1) {
    const current = station * HULL_VERTICES_PER_STATION;
    const next = current + HULL_VERTICES_PER_STATION;
    for (let edge = 0; edge < HULL_VERTICES_PER_STATION - 1; edge += 1) {
      const a = current + edge;
      const d = a + 1;
      const b = next + edge;
      const c = b + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  indices.push(0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4);
  const last = (HULL_STATIONS.length - 1) * HULL_VERTICES_PER_STATION;
  indices.push(
    last, last + 1, last + 2,
    last, last + 2, last + 3,
    last, last + 3, last + 4,
    last, last + 4, last + 5,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(4.7, 0.2, 15.4, 1, 1, 6);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const z = position.getZ(index);
    const sheer = 0.08 * Math.pow(Math.abs(z) / 7.7, 1.5);
    position.setY(index, position.getY(index) + sheer);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export class SunkenDorothyWreck implements MenuSceneComponent {
  readonly root = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor() {
    const hullMaterial = this.material(0x36565a, 0.9, 0.15);
    const upperMaterial = this.material(0x6d7265, 1, 0.05);
    const rustMaterial = this.material(0x7b4430, 1, 0.05);
    const metalMaterial = this.material(0x283536, 0.82, 0.28);

    const hullGeometry = this.geometry(createHullGeometry());
    const deckGeometry = this.geometry(createDeckGeometry());
    const funnelGeometry = this.geometry(new CylinderGeometry(0.42, 0.55, 1.8, 8));
    const funnelBaseGeometry = this.geometry(new CylinderGeometry(0.62, 0.68, 0.28, 8));
    const funnelRimGeometry = this.geometry(new CylinderGeometry(0.5, 0.5, 0.14, 8));
    const railGeometry = this.geometry(new BoxGeometry(0.08, 0.38, 13.6));

    this.root.name = 'menu:dorothy-wreck';
    this.root.position.set(...DOROTHY_WRECK_POSITION);
    this.root.rotation.set(...DOROTHY_WRECK_ROTATION);
    this.root.scale.setScalar(DOROTHY_WRECK_SCALE);
    this.root.add(
      this.mesh(DOROTHY_WRECK_PART_NAMES[0], hullGeometry, hullMaterial),
      this.mesh(DOROTHY_WRECK_PART_NAMES[1], deckGeometry, upperMaterial, [0, 0.72, 0.1]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[2], this.geometry(new BoxGeometry(2.8, 1.35, 2.8)), upperMaterial, [0, 1.47, 4.4]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[3], this.geometry(new BoxGeometry(2.35, 1.15, 2.35)), upperMaterial, [0, 1.37, -3.25]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[4], funnelGeometry, rustMaterial, [0, 1.9, -1.05], [0, 0, 0.075]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[5], funnelGeometry, rustMaterial, [0, 1.9, 1.75], [0, 0, -0.055]),
      this.mesh('menu:dorothy-wreck-funnel-forward-base', funnelBaseGeometry, metalMaterial, [0, 0.93, -1.05], [0, 0, 0.075]),
      this.mesh('menu:dorothy-wreck-funnel-aft-base', funnelBaseGeometry, metalMaterial, [0, 0.93, 1.75], [0, 0, -0.055]),
      this.mesh('menu:dorothy-wreck-funnel-forward-rim', funnelRimGeometry, metalMaterial, [0, 2.8, -1.05], [0, 0, 0.075]),
      this.mesh('menu:dorothy-wreck-funnel-aft-rim', funnelRimGeometry, metalMaterial, [0, 2.8, 1.75], [0, 0, -0.055]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[6], this.geometry(new CylinderGeometry(0.09, 0.13, 4.5, 6)), metalMaterial, [0, 2.85, -4.9], [0, 0, -0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[7], this.geometry(new BoxGeometry(3.8, 0.1, 0.1)), metalMaterial, [-0.42, 4.35, -4.9], [0, 0, -0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[8], railGeometry, metalMaterial, [-2.35, 1.05, 0.35]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[9], railGeometry, metalMaterial, [2.35, 1.05, 0.35]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[10], this.geometry(new BoxGeometry(0.14, 0.95, 2.2)), rustMaterial, [-2.45, 0.15, -5.8], [0.18, 0.08, -0.25]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[11], this.geometry(new BoxGeometry(0.14, 0.8, 1.7)), rustMaterial, [2.5, 0.1, 1.9], [-0.22, -0.12, 0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[12], this.geometry(new BoxGeometry(1.25, 0.12, 1.75)), rustMaterial, [0.8, 0.78, 7.4], [0.16, 0.28, -0.12]),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
  }

  private geometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material(color: number, roughness: number, metalness: number): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: true,
    });
    this.materials.add(material);
    return material;
  }

  private mesh(
    name: string,
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    position: readonly [number, number, number] = [0, 0, 0],
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    return mesh;
  }
}
