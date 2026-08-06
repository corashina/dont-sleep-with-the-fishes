import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';
import type { MenuSceneComponent } from './MenuSceneComponent';

export const DISTANT_RIDGE_COUNT = 3;
export const DISTANT_MOUNTAIN_COUNT = 3;
export const DISTANT_ROCK_COUNT = 24;
export const DISTANT_PLANT_COUNT = 36;
export const DISTANT_DEBRIS_COUNT = 20;

const RIDGES = [
  { width: 76, depth: 16, z: -16, height: 0.9, phase: 0.2 },
  { width: 96, depth: 22, z: -32, height: 1.35, phase: 1.1 },
  { width: 118, depth: 28, z: -50, height: 1.9, phase: 2.0 },
] as const;

const MOUNTAINS = [
  { width: 104, depth: 18, z: -34, height: 6.2, phase: 0.35 },
  { width: 138, depth: 24, z: -50, height: 10.8, phase: 1.25 },
  { width: 172, depth: 30, z: -72, height: 17.5, phase: 2.1 },
] as const;

const ROCKS = [
  [-11.0, -0.20, -5.5, 0.8, 0.2], [10.5, -0.15, -7.5, 1.0, 1.1],
  [-16.0, -0.25, -11.0, 1.15, 0.6], [16.5, -0.22, -12.5, 0.9, 2.2],
  [-21.5, -0.30, -17.0, 1.45, 0.4], [22.0, -0.28, -19.5, 1.2, 1.8],
  [-27.0, -0.34, -25.0, 1.0, 2.7], [28.5, -0.32, -27.5, 1.55, 0.9],
  [-34.0, -0.40, -34.0, 1.35, 0.3], [35.5, -0.38, -37.0, 1.7, 1.5],
  [-42.0, -0.45, -46.0, 1.8, 2.5], [43.0, -0.42, -49.0, 1.35, 0.7],
  [-18.0, -0.35, -39.0, 1.25, 1.2], [17.0, -0.32, -43.0, 1.5, 2.1],
  [-7.0, -0.28, -30.0, 0.85, 0.4], [8.5, -0.30, -35.0, 1.1, 1.7],
  [-52.0, -0.48, -58.0, 2.0, 0.8], [53.0, -0.45, -61.0, 1.7, 2.4],
  [-60.0, -0.48, -64.0, 1.8, 0.4], [61.0, -0.47, -67.0, 1.65, 1.6],
  [-68.0, -0.50, -52.0, 1.55, 2.2], [69.0, -0.48, -55.0, 1.85, 0.8],
  [-74.0, -0.52, -40.0, 1.4, 1.1], [75.0, -0.50, -44.0, 1.6, 2.6],
] as const;

const PLANTS = [
  [-9.0, -0.10, -7.0, 0.8, 0.1], [-13.0, -0.12, -10.0, 1.1, 0.5],
  [11.5, -0.10, -9.0, 0.9, 1.2], [15.5, -0.14, -13.5, 1.3, 2.0],
  [-17.5, -0.18, -15.0, 1.0, 0.8], [19.0, -0.16, -17.5, 0.75, 1.6],
  [-24.0, -0.22, -21.0, 1.2, 2.4], [25.0, -0.22, -23.0, 1.4, 0.3],
  [-30.0, -0.25, -28.0, 0.9, 1.9], [31.5, -0.25, -30.0, 1.1, 2.8],
  [-36.0, -0.28, -36.0, 1.45, 0.4], [37.0, -0.28, -39.0, 1.2, 1.4],
  [-47.0, -0.32, -44.0, 1.6, 2.2], [47.0, -0.32, -46.0, 1.3, 0.7],
  [-50.0, -0.36, -55.0, 1.75, 1.1], [51.0, -0.36, -58.0, 1.5, 2.5],
  [-5.0, -0.18, -18.0, 0.85, 0.2], [7.0, -0.20, -22.0, 1.0, 1.8],
  [-12.0, -0.22, -27.0, 1.3, 2.7], [13.5, -0.22, -31.0, 1.2, 0.6],
  [-19.0, -0.26, -34.0, 1.0, 1.5], [21.0, -0.28, -38.0, 1.4, 2.9],
  [-27.0, -0.30, -43.0, 1.5, 0.9], [29.0, -0.32, -47.0, 1.2, 2.0],
  [-8.0, -0.30, -50.0, 1.25, 0.3], [10.0, -0.32, -54.0, 1.4, 1.7],
  [-34.0, -0.35, -57.0, 1.6, 2.4], [36.0, -0.36, -61.0, 1.5, 0.8],
  [-58.0, -0.38, -47.0, 1.35, 0.5], [59.0, -0.38, -50.0, 1.55, 1.4],
  [-64.0, -0.40, -38.0, 1.25, 2.1], [65.0, -0.40, -41.0, 1.45, 0.8],
  [-71.0, -0.42, -30.0, 1.5, 2.7], [72.0, -0.42, -33.0, 1.3, 1.7],
  [-78.0, -0.44, -22.0, 1.2, 0.3], [79.0, -0.44, -25.0, 1.4, 2.4],
] as const;

const DEBRIS = [
  [-14.0, -0.05, -8.0, 0.8, -0.35], [13.0, -0.08, -11.0, 1.0, -0.5],
  [-19.0, -0.10, -15.0, 0.7, -0.62], [20.0, -0.12, -18.0, 1.15, -0.72],
  [-25.0, -0.10, -23.0, 0.75, 0.42], [26.0, -0.12, -26.0, 1.1, 0.28],
  [-31.0, -0.14, -31.0, 0.85, 0.15], [32.0, -0.16, -34.0, 1.0, 0.05],
  [-38.0, -0.18, -40.0, 1.2, -0.4], [39.0, -0.18, -43.0, 0.9, 0.6],
  [-45.0, -0.20, -49.0, 1.3, -0.8], [46.0, -0.20, -52.0, 1.0, 0.9],
  [-11.0, -0.16, -38.0, 0.8, 0.25], [12.0, -0.18, -45.0, 1.1, -0.15],
  [-57.0, -0.22, -57.0, 0.9, -0.25], [58.0, -0.22, -60.0, 1.05, 0.35],
  [-66.0, -0.24, -46.0, 1.0, 0.6], [67.0, -0.24, -49.0, 1.15, -0.5],
  [-76.0, -0.25, -34.0, 1.1, -0.7], [77.0, -0.25, -37.0, 0.95, 0.75],
] as const;

type Detail = readonly [number, number, number, number, number];

export class DistantSeabed implements MenuSceneComponent {
  readonly root = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor() {
    const sand = this.material(0x526d69, 1);
    const mountainSand = this.material(0x3e5958, 1);
    mountainSand.flatShading = true;
    const rock = this.material(0x3a4d50, 1);
    const plant = this.material(0x355d51, 0.95);
    const wood = this.material(0x5a4938, 1);
    const ridges = new Group();
    const rocks = new Group();
    const plants = new Group();
    const debris = new Group();
    const mountains = new Group();
    ridges.name = 'menu:distant-ridges';
    mountains.name = 'menu:distant-mountains';
    rocks.name = 'menu:distant-rocks';
    plants.name = 'menu:distant-plants';
    debris.name = 'menu:distant-debris';

    RIDGES.forEach((spec, index) => {
      const geometry = this.geometry(new PlaneGeometry(spec.width, spec.depth, 12, 6));
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        const wave = Math.sin(x * 0.19 + spec.phase) * 0.48
          + Math.cos(z * 0.23 - spec.phase) * 0.32
          + Math.sin((x + z) * 0.11) * 0.2;
        position.setY(vertex, Math.max(-0.15, wave) * spec.height - 0.25);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, sand);
      mesh.name = `menu:distant-ridge-${index + 1}`;
      mesh.position.z = spec.z;
      ridges.add(mesh);
    });

    MOUNTAINS.forEach((spec, index) => {
      const geometry = this.geometry(new PlaneGeometry(spec.width, spec.depth, 24, 10));
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = position.getX(vertex);
        const z = position.getZ(vertex);
        const depth = (spec.depth * 0.5 - z) / spec.depth;
        const ridgeCrest = Math.max(0, 1 - Math.abs(depth - 0.64) / 0.64);
        const peaks = 0.5
          + Math.abs(Math.sin(x * 0.11 + spec.phase)) * 0.28
          + Math.abs(Math.sin(x * 0.27 - spec.phase)) * 0.16
          + Math.cos((x + z) * 0.13) * 0.06;
        const sideFade = Math.max(0.2, 1 - Math.abs(x) / (spec.width * 0.58));
        position.setY(vertex, -0.35 + Math.max(0, peaks) * sideFade
          * Math.pow(ridgeCrest, 1.3) * spec.height);
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, mountainSand);
      mesh.name = `menu:distant-mountain-${index + 1}`;
      mesh.position.z = spec.z;
      mountains.add(mesh);
    });

    const rockGeometry = this.geometry(new DodecahedronGeometry(0.55, 0));
    const plantGeometry = this.geometry(new ConeGeometry(0.12, 1.3, 5));
    const debrisGeometry = this.geometry(new BoxGeometry(1.25, 0.08, 0.22));
    this.addDetails(rocks, 'menu:distant-rock', ROCKS, rockGeometry, rock);
    this.addDetails(plants, 'menu:distant-plant', PLANTS, plantGeometry, plant);
    this.addDetails(debris, 'menu:distant-debris', DEBRIS, debrisGeometry, wood);

    this.root.name = 'menu:distant-seabed';
    this.root.add(ridges, mountains, rocks, plants, debris);
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

  private material(color: number, roughness: number): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    this.materials.add(material);
    return material;
  }

  private addDetails(
    group: Group,
    name: string,
    details: readonly Detail[],
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ): void {
    details.forEach(([x, y, z, scale, yaw], index) => {
      const mesh = new Mesh(geometry, material);
      mesh.name = `${name}-${index + 1}`;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      mesh.rotation.y = yaw;
      group.add(mesh);
    });
  }
}
