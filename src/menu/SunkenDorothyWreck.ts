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

export const DOROTHY_WRECK_POSITION = [1.6, 0.08, -19.5] as const;
export const DOROTHY_WRECK_ROTATION = [0.06, -1.42, -0.16] as const;
export const DOROTHY_WRECK_PART_NAMES = [
  'menu:dorothy-wreck-hull',
  'menu:dorothy-wreck-deck',
  'menu:dorothy-wreck-deckhouse-aft',
  'menu:dorothy-wreck-deckhouse-forward',
  'menu:dorothy-wreck-funnel-port',
  'menu:dorothy-wreck-funnel-starboard',
  'menu:dorothy-wreck-mast',
  'menu:dorothy-wreck-yard',
  'menu:dorothy-wreck-rail-port',
  'menu:dorothy-wreck-rail-starboard',
  'menu:dorothy-wreck-torn-plate-1',
  'menu:dorothy-wreck-torn-plate-2',
  'menu:dorothy-wreck-torn-plate-3',
] as const;

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

    const hullGeometry = this.geometry(new BufferGeometry());
    hullGeometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0.55, -9, -2.3, 0.55, -6.8, 2.3, 0.55, -6.8,
      -2.65, 0.55, 8.5, 2.65, 0.55, 8.5, 0, -1.15, -8.15,
      -1.65, -1.3, -5.9, 1.65, -1.3, -5.9,
      -2.05, -1.1, 8.1, 2.05, -1.1, 8.1,
    ]), 3));
    hullGeometry.setIndex([
      0, 2, 1, 1, 2, 4, 1, 4, 3,
      0, 1, 6, 0, 6, 5, 1, 3, 8, 1, 8, 6,
      0, 5, 7, 0, 7, 2, 2, 7, 9, 2, 9, 4,
      5, 6, 8, 5, 8, 9, 5, 9, 7,
      3, 4, 9, 3, 9, 8,
    ]);
    hullGeometry.computeVertexNormals();

    this.root.name = 'menu:dorothy-wreck';
    this.root.position.set(...DOROTHY_WRECK_POSITION);
    this.root.rotation.set(...DOROTHY_WRECK_ROTATION);
    this.root.add(
      this.mesh(DOROTHY_WRECK_PART_NAMES[0], hullGeometry, hullMaterial),
      this.mesh(DOROTHY_WRECK_PART_NAMES[1], this.geometry(new BoxGeometry(4.6, 0.2, 15.2)), upperMaterial, [0, 0.7, 0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[2], this.geometry(new BoxGeometry(2.8, 1.35, 2.8)), upperMaterial, [0, 1.45, 4.1]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[3], this.geometry(new BoxGeometry(2.35, 1.15, 2.35)), upperMaterial, [0, 1.35, -2.1]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[4], this.geometry(new CylinderGeometry(0.42, 0.55, 1.8, 8)), rustMaterial, [-1.05, 2.1, 0.35], [0, 0, 0.08]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[5], this.geometry(new CylinderGeometry(0.42, 0.55, 1.8, 8)), rustMaterial, [1.05, 2.1, 0.35], [0, 0, -0.08]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[6], this.geometry(new CylinderGeometry(0.09, 0.13, 4.5, 6)), metalMaterial, [0, 2.85, -4.9], [0, 0, -0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[7], this.geometry(new BoxGeometry(3.8, 0.1, 0.1)), metalMaterial, [-0.42, 4.35, -4.9], [0, 0, -0.2]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[8], this.geometry(new BoxGeometry(0.08, 0.38, 13.6)), metalMaterial, [-2.35, 1.05, 0.35]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[9], this.geometry(new BoxGeometry(0.08, 0.38, 13.6)), metalMaterial, [2.35, 1.05, 0.35]),
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
    const material = new MeshStandardMaterial({ color, roughness, metalness });
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
