import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial,
  SphereGeometry, TorusGeometry,
} from 'three';
import { KrakenTentacle } from './KrakenTentacle';
import { krakenEase } from './krakenChoreography';

const ARM_HEIGHTS = [3.5, 6.3, 5.2, 2.8] as const;

export class KrakenGeometry {
  readonly root = new Group();
  readonly mantle = new Group();
  readonly arms: readonly KrakenTentacle[];
  readonly collector: KrakenTentacle;
  private readonly skin = new MeshStandardMaterial({ color: 0x455452, roughness: 0.49, vertexColors: true });
  private readonly pale = new MeshStandardMaterial({ color: 0x6b7567, roughness: 0.68 });
  private readonly dark = new MeshStandardMaterial({ color: 0x070d0d, roughness: 0.4 });
  private readonly iris = new MeshStandardMaterial({ color: 0x746649, roughness: 0.2 });
  private readonly sphere = new SphereGeometry(1, 32, 24);
  private readonly sucker = new TorusGeometry(0.2, 0.075, 6, 10);
  private readonly ownedGeometry: BufferGeometry[] = [this.sphere, this.sucker];

  constructor() {
    this.root.name = 'kraken-body';
    this.addSkinColors();
    const body = this.flesh(this.mantle, 'kraken-mantle', [0, 1.5, -2.3], [7.6, 5.7, 4.7], this.skin);
    body.geometry = this.sphere.clone();
    this.ownedGeometry.push(body.geometry);
    const positions = body.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      const x = positions.getX(index);
      const taper = 1 - Math.max(0, -y) * 0.28;
      positions.setX(index, x * taper * (1 + 0.035 * Math.sin(y * 9 + x * 4)));
      positions.setZ(index, positions.getZ(index) * taper);
    }
    body.geometry.computeVertexNormals();
    this.flesh(this.mantle, 'kraken-arm-crown', [0, -0.65, -0.7], [5.2, 2.1, 3.6], this.skin);
    this.addFace();
    this.root.add(this.mantle);
    this.arms = Array.from({ length: 7 }, (_, index) => {
      const arm = new KrakenTentacle(6, 42, 1.12, this.skin, this.sucker, this.pale);
      arm.root.name = 'kraken-arm-' + index;
      this.root.add(arm.root);
      return arm;
    });
    this.collector = new KrakenTentacle(14, 112, 0.34, this.skin, this.sucker, this.pale, 0.38);
    this.collector.root.name = 'kraken-collecting-arm';
    this.root.add(this.collector.root);
  }

  private addSkinColors(): void {
    const positions = this.sphere.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const pigment = 0.68 + 0.16 * Math.sin(x * 19 + y * 11) * Math.cos(z * 17 - y * 7)
        + 0.1 * Math.sin(y * 5 + x * 3);
      colors.set([pigment * 0.85, pigment, pigment * 0.95], index * 3);
    }
    this.sphere.setAttribute('color', new BufferAttribute(colors, 3));
  }

  private addFace(): void {
    for (const side of [-1, 1]) {
      const y = 2.5 + (side > 0 ? -0.16 : 0);
      this.flesh(this.mantle, 'kraken-eye-socket', [side * 4.05, y, 1.45], [0.84, 0.46, 0.35], this.dark);
      this.flesh(this.mantle, 'kraken-eye', [side * 4.05, y, 1.78], [0.43, 0.22, 0.14], this.iris);
      this.flesh(this.mantle, 'kraken-pupil', [side * 4.05, y, 1.91], [0.32, 0.035, 0.025], this.dark);
      const brow = this.flesh(this.mantle, 'kraken-brow', [side * 4.05, y + 0.33, 1.62], [0.98, 0.30, 0.39], this.skin);
      brow.rotation.z = side * 0.12;
      for (let ridge = 0; ridge < 4; ridge++) {
        const fold = this.flesh(this.mantle, 'kraken-mantle-fold',
          [side * (1.1 + ridge * 0.78), 4.1 - ridge * 0.17, 1.22 - ridge * 0.09],
          [0.14, 1.3 - ridge * 0.1, 0.19], this.skin);
        fold.rotation.z = side * (0.13 + ridge * 0.12);
      }
    }
    const scar = this.flesh(this.mantle, 'kraken-healed-scar', [-2.2, 3.7, 1.85], [0.045, 0.65, 0.035], this.pale);
    scar.rotation.z = -0.4;
  }

  update(time: number, rise: number, descent: number): void {
    const breath = Math.sin(time * 0.55) * 0.012;
    this.mantle.scale.set(1 + breath, 1 - breath * 0.6, 1 + breath * 0.35);
    this.mantle.rotation.z = Math.sin(time * 0.16) * 0.008;
    for (let index = 0; index < this.arms.length; index++) this.updateArm(index, time, rise, descent);
  }

  private updateArm(index: number, time: number, rise: number, descent: number): void {
    const arm = this.arms[index]!;
    const side = index < 4 ? -1 : 1;
    const rank = index % 4;
    const height = ARM_HEIGHTS[rank]!;
    const reach = 7.8 + rank * 1.1;
    const delay = 0.25 + 0.08 * rank;
    const lag = krakenEase((descent - delay) / (1 - delay));
    const lift = (1 - rise) * 4.5 + descent * 13.5 - lag * 14;
    const flex = Math.sin(time * (0.27 + index * 0.014) + index * 1.7) * 0.22;
    arm.points[0]!.set(side * (3.8 + rank * 0.35), -1.15, -1 - rank);
    arm.points[1]!.set(side * 6.2, -0.8 + lift * 0.4, 0.2 - rank);
    arm.points[2]!.set(side * reach, height * 0.35 + lift + flex, 1.2 - rank * 0.6);
    arm.points[3]!.set(side * (reach + 0.9 + flex), height + lift, 0.7 - rank * 0.7);
    arm.points[4]!.set(side * (reach - 0.35), height + 0.4 + lift + flex, 1.4 - rank * 0.7);
    arm.points[5]!.set(side * (reach - 1.1 - flex), height - 0.6 + lift, 1.8 - rank * 0.7);
    arm.update();
  }

  private flesh(parent: Group, name: string, position: [number, number, number],
    scale: [number, number, number], material: MeshStandardMaterial): Mesh {
    const mesh = new Mesh(this.sphere, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const arm of this.arms) arm.dispose();
    this.collector.dispose();
    for (const geometry of this.ownedGeometry) geometry.dispose();
    this.skin.dispose(); this.pale.dispose(); this.dark.dispose(); this.iris.dispose();
    this.root.clear();
  }
}

