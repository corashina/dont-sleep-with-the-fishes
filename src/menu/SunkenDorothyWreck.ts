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

export const DOROTHY_WRECK_POSITION = [4.5, -0.9, -22] as const;
export const DOROTHY_WRECK_ROTATION = [0.12, -0.55, -0.30] as const;
export const DOROTHY_WRECK_PART_NAMES = [
  'menu:dorothy-wreck-hull',
  'menu:dorothy-wreck-deck',
  'menu:dorothy-wreck-bridge',
  'menu:dorothy-wreck-funnel',
  'menu:dorothy-wreck-mast',
  'menu:dorothy-wreck-yard',
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
    const rustMaterial = this.material(0x7b4430, 1, 0.05);
    const woodMaterial = this.material(0x654735, 1, 0);

    const vertices = new Float32Array([
       0, 0.65, -7, -1.6, 0.5, -4.8, 1.6, 0.5, -4.8,
      -2.1, 0.55, 7, 2.1, 0.55, 7, 0, -0.9, -6.4,
      -0.7, -1.15, -3.8, 0.7, -1.15, -3.8,
      -1.2, -1.0, 6.8, 1.2, -1.0, 6.8,
    ]);
    const indices = [
      0, 2, 1, 1, 2, 4, 1, 4, 3,
      0, 1, 6, 0, 6, 5, 1, 3, 8, 1, 8, 6,
      0, 5, 7, 0, 7, 2, 2, 7, 9, 2, 9, 4,
      5, 6, 8, 5, 8, 9, 5, 9, 7,
      3, 4, 9, 3, 9, 8,
    ];
    const hullGeometry = this.geometry(new BufferGeometry());
    hullGeometry.setAttribute('position', new BufferAttribute(vertices, 3));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();

    this.root.name = 'menu:dorothy-wreck';
    this.root.position.set(...DOROTHY_WRECK_POSITION);
    this.root.rotation.set(...DOROTHY_WRECK_ROTATION);
    this.root.add(
      this.mesh(DOROTHY_WRECK_PART_NAMES[0], hullGeometry, hullMaterial),
      this.mesh(DOROTHY_WRECK_PART_NAMES[1], this.geometry(new BoxGeometry(3.4, 0.25, 10.8)), hullMaterial, [0, 0.76, 0.7]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[2], this.geometry(new BoxGeometry(2.5, 1.35, 2.2)), hullMaterial, [-0.15, 1.55, 1.65], [0, 0.05, 0]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[3], this.geometry(new CylinderGeometry(0.4, 0.52, 1.3, 8)), rustMaterial, [0.45, 2.55, 0.55], [0, 0, -0.14]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[4], this.geometry(new CylinderGeometry(0.08, 0.12, 4, 6)), woodMaterial, [-0.45, 2.65, -1.8], [0, 0, -0.38]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[5], this.geometry(new BoxGeometry(2.6, 0.1, 0.1)), woodMaterial, [-1, 3.38, -1.8], [0.15, 0.12, -0.18]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[6], this.geometry(new BoxGeometry(0.12, 0.9, 2.1)), rustMaterial, [-1.75, 0.2, -2.7], [0.2, 0.15, -0.25]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[7], this.geometry(new BoxGeometry(0.14, 0.75, 1.5)), rustMaterial, [1.7, 0.05, 2.9], [-0.25, -0.2, 0.22]),
      this.mesh(DOROTHY_WRECK_PART_NAMES[8], this.geometry(new BoxGeometry(1.1, 0.1, 1.6)), woodMaterial, [0.9, 0.9, 5.1], [0.18, 0.35, -0.12]),
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
