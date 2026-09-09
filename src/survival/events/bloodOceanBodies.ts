import {
  BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group,
  Mesh, MeshStandardMaterial, Shape, SphereGeometry,
} from 'three';
import { disposeResourceSets } from '../../world/SceneResources';

export interface BloodOceanBody {
  readonly root: Group;
  readonly figure: Group;
  readonly head: Group;
}

/** Shared geometry and materials for five worn, clothed sailors. */
export class BloodOceanBodies {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshStandardMaterial>();
  private readonly box = this.own(new BoxGeometry(1, 1, 1));
  private readonly sphere = this.own(new SphereGeometry(1, 10, 8));
  private readonly limb = this.own(new CylinderGeometry(0.85, 1, 1, 8));
  private readonly skin = this.material(0xa7aaa0, 0.76);
  private readonly boots = this.material(0x222327, 0.86);
  private readonly seams = this.material(0x8a8272, 0.95);
  private readonly dark = this.material(0x17141a, 1);
  private readonly coats = [0x555957, 0x63534b, 0x434953, 0x64604b, 0x49423f]
    .map((color) => this.material(color, 0.94));
  private readonly coat = this.polygon([
    [-0.28, 0.46], [-0.16, 0.58], [0.14, 0.56], [0.29, 0.42],
    [0.25, -0.24], [0.29, -0.45], [0.12, -0.42], [0.07, -0.52],
    [-0.04, -0.44], [-0.19, -0.5], [-0.28, -0.39], [-0.23, -0.16],
  ], 0.24);
  private readonly lapel = this.polygon([
    [0, 0], [0.18, -0.05], [0.08, -0.35], [-0.04, -0.2],
  ], 0.025);

  private own<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material(color: number, roughness: number): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color, roughness, flatShading: true, emissive: color, emissiveIntensity: 0.12,
    });
    this.materials.add(material);
    return material;
  }

  private polygon(points: readonly (readonly [number, number])[], depth: number): ExtrudeGeometry {
    const shape = new Shape();
    points.forEach(([x, y], index) => index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.02, bevelThickness: 0.015,
    });
    geometry.translate(0, 0, -depth / 2);
    return this.own(geometry);
  }

  private part(
    parent: Group, name: string, geometry: BufferGeometry, material: MeshStandardMaterial,
    x: number, y: number, z: number, sx: number, sy: number, sz: number,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  create(index: number): BloodOceanBody {
    const root = new Group();
    root.name = `blood-ocean-body-${index + 1}`;
    const figure = new Group();
    figure.rotation.x = -Math.PI / 2;
    root.add(figure);
    const coat = this.coats[index]!;
    this.part(figure, 'torn-coat', this.coat, coat, 0, 0, 0, 1, 1, 1);
    this.part(figure, 'left-lapel', this.lapel, this.seams, -0.16, 0.52, 0.14, 1, 1, 1);
    this.part(figure, 'right-lapel', this.lapel, coat, 0.16, 0.52, 0.15, -1, 1, 1);
    this.part(figure, 'coat-placket', this.box, this.dark, 0.015, -0.02, 0.132, 0.028, 0.6, 0.008);
    for (let button = 0; button < 4; button += 1) {
      this.part(figure, 'dull-button', this.sphere, this.seams, 0.04, 0.22 - button * 0.15, 0.15, 0.019, 0.019, 0.009);
    }
    this.part(figure, 'pocket-flap', this.box, this.seams, -0.15, -0.15, 0.14, 0.13, 0.026, 0.012);
    this.part(figure, 'pocket', this.box, coat, -0.15, -0.22, 0.14, 0.14, 0.13, 0.022);
    for (const side of [-1, 1]) {
      const arm = new Group();
      arm.position.set(side * 0.26, 0.38, 0);
      arm.rotation.z = side * (0.2 + index * 0.045);
      arm.rotation.x = side * 0.14;
      figure.add(arm);
      this.part(arm, 'sleeve', this.limb, coat, 0, -0.22, 0, 0.115, 0.48, 0.105);
      this.part(arm, 'wet-cuff', this.limb, this.dark, 0, -0.47, 0, 0.094, 0.075, 0.09);
      this.part(arm, 'limp-hand', this.sphere, this.skin, 0, -0.56, 0, 0.074, 0.11, 0.038);
      for (let finger = 0; finger < 3; finger += 1) {
        const hand = this.part(arm, 'finger', this.box, this.skin, (finger - 1) * 0.037, -0.66, 0.005,
          0.023, 0.09 - Math.abs(finger - 1) * 0.018, 0.026);
        hand.rotation.x = 0.28 + finger * 0.11;
      }
      const leg = new Group();
      leg.position.set(side * 0.14, -0.35, -0.015);
      leg.rotation.z = side * (0.08 + index * 0.025);
      figure.add(leg);
      this.part(leg, 'trouser-leg', this.limb, coat, 0, -0.28, 0, 0.115, 0.65, 0.105);
      this.part(leg, 'boot', this.box, this.boots, 0, -0.64, 0.035, 0.17, 0.2, 0.27);
      this.part(leg, 'boot-sole', this.box, this.dark, 0, -0.74, 0.04, 0.18, 0.03, 0.29);
    }
    this.part(figure, 'neck', this.limb, this.skin, 0, 0.57, 0, 0.075, 0.13, 0.075);
    const head = new Group();
    head.name = 'turning-head';
    head.position.set(0, 0.62, 0);
    figure.add(head);
    this.part(head, 'face', this.sphere, this.skin, 0, 0.14, 0, 0.155, 0.205, 0.145);
    this.part(head, 'wet-hair', this.sphere, this.dark, 0, 0.22, -0.052, 0.16, 0.14, 0.113);
    for (const side of [-1, 1]) {
      this.part(head, 'sunken-eye', this.sphere, this.dark, side * 0.061, 0.155, 0.124, 0.044, 0.018, 0.019);
      this.part(head, 'ear', this.sphere, this.skin, side * 0.153, 0.13, 0, 0.025, 0.055, 0.025);
    }
    this.part(head, 'nose', this.box, this.skin, 0, 0.11, 0.147, 0.042, 0.075, 0.06);
    this.part(head, 'mouth', this.box, this.dark, 0, 0.048, 0.133, 0.064, 0.014, 0.009);
    return { root, figure, head };
  }

  createTin(): Group {
    const tin = new Group();
    tin.name = 'blood-ocean-sealed-tin';
    const metal = this.material(0xa7a19a, 0.4);
    const label = this.material(0xa89969, 0.92);
    this.part(tin, 'tin-can', this.limb, metal, 0, 0, 0, 0.1, 0.16, 0.1);
    this.part(tin, 'weathered-label', this.limb, label, 0, 0, 0, 0.102, 0.11, 0.102);
    this.part(tin, 'sealed-lid', this.limb, metal, 0, 0.085, 0, 0.104, 0.018, 0.104);
    return tin;
  }

  dispose(): void {
    disposeResourceSets(this.geometries, this.materials);
  }
}
