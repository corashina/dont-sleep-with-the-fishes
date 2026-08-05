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
export const DISTANT_ROCK_COUNT = 7;
export const DISTANT_PLANT_COUNT = 10;
export const DISTANT_DEBRIS_COUNT = 8;

const RIDGES = [
  { width: 42, depth: 10, z: -12, height: 1.05, phase: 0.2 },
  { width: 52, depth: 13, z: -22, height: 1.65, phase: 1.1 },
  { width: 64, depth: 17, z: -35, height: 2.05, phase: 2.0 },
] as const;

const ROCKS = [
  [-7.8, -0.20, -10.5, 0.75, 0.2], [7.5, -0.15, -13.5, 1.1, 1.1],
  [-11.5, -0.35, -19.0, 1.35, 0.6], [12.0, -0.30, -21.5, 0.9, 2.2],
  [-15.0, -0.40, -29.0, 1.6, 0.4], [15.5, -0.35, -33.0, 1.25, 1.8],
  [-2.0, -0.25, -37.0, 1.0, 2.7],
] as const;

const PLANTS = [
  [-6.2, -0.10, -9.8, 0.8, 0.1], [-9.0, -0.15, -14.2, 1.1, 0.5],
  [6.5, -0.12, -15.0, 0.9, 1.2], [10.0, -0.18, -18.5, 1.3, 2.0],
  [-13.0, -0.22, -22.0, 1.0, 0.8], [1.5, -0.15, -24.5, 0.75, 1.6],
  [13.8, -0.28, -27.0, 1.2, 2.4], [-17.0, -0.30, -32.0, 1.4, 0.3],
  [7.0, -0.25, -35.0, 0.9, 1.9], [-5.5, -0.30, -39.0, 1.1, 2.8],
] as const;

const DEBRIS = [
  [-3.8, -0.05, -10.2, 0.8, -0.35], [-1.8, -0.08, -13.1, 1.0, -0.5],
  [0.4, -0.10, -16.0, 0.7, -0.62], [2.5, -0.12, -19.0, 1.15, -0.72],
  [9.0, -0.10, -12.0, 0.75, 0.42], [7.6, -0.12, -15.2, 1.1, 0.28],
  [6.2, -0.14, -18.2, 0.85, 0.15], [5.0, -0.16, -20.8, 1.0, 0.05],
] as const;

type Detail = readonly [number, number, number, number, number];

export class DistantSeabed implements MenuSceneComponent {
  readonly root = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private disposed = false;

  constructor() {
    const sand = this.material(0x526d69, 1);
    const rock = this.material(0x3a4d50, 1);
    const plant = this.material(0x355d51, 0.95);
    const wood = this.material(0x5a4938, 1);
    const ridges = new Group();
    const rocks = new Group();
    const plants = new Group();
    const debris = new Group();
    ridges.name = 'menu:distant-ridges';
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

    const rockGeometry = this.geometry(new DodecahedronGeometry(0.55, 0));
    const plantGeometry = this.geometry(new ConeGeometry(0.12, 1.3, 5));
    const debrisGeometry = this.geometry(new BoxGeometry(1.25, 0.08, 0.22));
    this.addDetails(rocks, 'menu:distant-rock', ROCKS, rockGeometry, rock);
    this.addDetails(plants, 'menu:distant-plant', PLANTS, plantGeometry, plant);
    this.addDetails(debris, 'menu:distant-debris', DEBRIS, debrisGeometry, wood);

    this.root.name = 'menu:distant-seabed';
    this.root.add(ridges, rocks, plants, debris);
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
