import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';
import type { ChestSnapshot } from './survivalTypes';

export class ChestDisplay {
  readonly root = new Group();
  private readonly lid: Object3D;
  private readonly mimicParts = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private disposed = false;

  constructor(model?: Object3D) {
    this.root.name = 'persistent-chest';
    this.root.position.set(-0.72, 0.39, -1.38);
    this.root.rotation.y = -0.08;
    this.root.visible = false;

    const tooth = this.material(0xc7b88f, 0.88);
    const mouth = this.material(0x391b1b, 0.94);

    if (model !== undefined) {
      model.name = 'persistent-chest-model';
      this.root.add(model);
      this.lid = model.getObjectByName('Chest_Top') ?? new Group();
    } else {
      const wood = this.material(0x59402f, 0.96);
      const darkWood = this.material(0x302720, 1);
      const iron = this.material(0x4b5555, 0.72, 0.32);
      this.box(this.root, 'chest-body', [0.78, 0.38, 0.54], [0, 0, 0], wood);
      this.box(this.root, 'chest-foot-left', [0.12, 0.09, 0.5], [-0.25, -0.22, 0], darkWood);
      this.box(this.root, 'chest-foot-right', [0.12, 0.09, 0.5], [0.25, -0.22, 0], darkWood);
      this.box(this.root, 'chest-band-left', [0.09, 0.43, 0.57], [-0.25, 0.01, 0], iron);
      this.box(this.root, 'chest-band-right', [0.09, 0.43, 0.57], [0.25, 0.01, 0], iron);

      const lid = new Group();
      lid.name = 'chest-lid';
      lid.position.set(0, 0.22, 0.25);
      this.box(lid, 'chest-lid-shell', [0.82, 0.2, 0.58], [0, 0, -0.25], wood);
      this.box(lid, 'chest-lid-band', [0.1, 0.23, 0.6], [0, 0, -0.25], iron);
      this.root.add(lid);
      this.lid = lid;

      this.box(this.root, 'chest-lock', [0.16, 0.2, 0.08], [0, 0.07, 0.31], iron);
    }

    this.mimicParts.name = 'chest-mimic-parts';
    this.box(this.mimicParts, 'mimic-mouth', [0.62, 0.11, 0.08], [0, 0.17, 0.3], mouth);
    for (const x of [-0.24, -0.08, 0.08, 0.24]) {
      const geometry = new ConeGeometry(0.045, 0.14, 5);
      this.geometries.add(geometry);
      const mesh = new Mesh(geometry, tooth);
      mesh.name = 'mimic-tooth';
      mesh.position.set(x, 0.23, 0.36);
      mesh.rotation.x = Math.PI;
      this.mimicParts.add(mesh);
    }
    this.root.add(this.mimicParts);
  }

  sync(chest: ChestSnapshot): void {
    if (this.disposed) return;
    this.root.visible = chest.state !== 'none';
    const mimic = chest.state === 'mimic';
    this.mimicParts.visible = mimic;
    this.lid.rotation.x = mimic ? -0.52 : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
  }

  private material(color: number, roughness: number, metalness = 0): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: true,
    });
    this.materials.add(material);
    return material;
  }

  private box(
    parent: Group,
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: Material,
  ): void {
    const geometry = new BoxGeometry(...size);
    this.geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    parent.add(mesh);
  }
}
