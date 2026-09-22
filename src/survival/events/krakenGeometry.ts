import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Group, LatheGeometry, Mesh, MeshStandardMaterial,
  RingGeometry, SphereGeometry, TubeGeometry, Vector2, Vector3,
} from 'three';
import { KrakenTentacle } from './KrakenTentacle';
import { krakenEase } from './krakenChoreography';
import { createKrakenSkinTextures } from './krakenSkin';
import { createKrakenMantle } from './krakenAnatomy';

// Separate lanes surround the boat without crossing the collection arm or deck.
const ARM_POSES = ([
  [-4.4, 23.6, 2.7], [-11.8, 8.6, 5.7], [-16.3, 0.5, 4.4], [-9.4, -7.5, 6.1],
  [4.8, 24.4, 3.1], [12.7, 9.2, 5.1], [17.2, -2.4, 6.4],
] as const).map(([x, z, height], index) => {
  const distance = Math.hypot(x, 17 - z);
  return { x, z, height, wrapsBoat: index === 0 || index === 4, inwardX: -x / distance, inwardZ: (17 - z) / distance,
    phase: index * 2.39996, speed: 0.17 + (index % 3) * 0.027 };
});

export class KrakenGeometry {
  readonly root = new Group();
  readonly mantle = new Group();
  readonly arms: readonly KrakenTentacle[];
  readonly collector: KrakenTentacle;
  private readonly skinTextures = createKrakenSkinTextures();
  private readonly skin = new MeshStandardMaterial({ color: 0xffffff, map: this.skinTextures.color, roughness: 0.72,
    bumpMap: this.skinTextures.surface, bumpScale: 0.14, roughnessMap: this.skinTextures.surface, vertexColors: true });
  private readonly pale = new MeshStandardMaterial({ color: 0x9b9a83, roughness: 0.54,
    bumpMap: this.skinTextures.surface, bumpScale: 0.035, vertexColors: true });
  private readonly dark = new MeshStandardMaterial({ color: 0x070d0d, roughness: 0.4 });
  private readonly iris = new MeshStandardMaterial({ color: 0x9a8247, roughness: 0.19 });
  private readonly sphere = new SphereGeometry(1, 48, 32);
  private readonly sucker = this.createSucker();
  private readonly ownedGeometry: BufferGeometry[] = [this.sphere, this.sucker];

  constructor() {
    this.root.name = 'kraken-body';
    this.addSkinColors();
    const body = this.flesh(this.mantle, 'kraken-mantle', [0, 1.5, -2.3], [7.6, 5.7, 4.7], this.skin);
    body.geometry = createKrakenMantle();
    this.ownedGeometry.push(body.geometry);
    this.addFace();
    this.root.add(this.mantle);
    this.arms = ARM_POSES.map((_, index) => {
      const arm = new KrakenTentacle(12, 72, 1.12, this.skin, this.sucker, this.pale);
      arm.root.name = 'kraken-arm-' + index;
      this.root.add(arm.root);
      return arm;
    });
    this.collector = new KrakenTentacle(14, 112, 0.34, this.skin, this.sucker, this.pale, 0.38);
    this.collector.root.name = 'kraken-collecting-arm';
    this.root.add(this.collector.root);
  }

  private createSucker(): LatheGeometry {
    const geometry = new LatheGeometry([
      new Vector2(0.11, -0.055), new Vector2(0.19, -0.02), new Vector2(0.26, 0.035),
      new Vector2(0.29, 0.085), new Vector2(0.28, 0.13), new Vector2(0.25, 0.155),
      new Vector2(0.21, 0.15), new Vector2(0.18, 0.115), new Vector2(0.17, 0.065),
      new Vector2(0.145, 0.032), new Vector2(0.115, 0.046), new Vector2(0.085, 0.028),
      new Vector2(0.045, -0.005), new Vector2(0, -0.012),
    ], 24);
    const profile = geometry.getAttribute('position');
    for (let index = 0; index < profile.count; index++) {
      const x = profile.getX(index), z = profile.getZ(index), y = profile.getY(index);
      const angle = Math.atan2(z, x);
      const rim = Math.max(0, Math.min(1, y / 0.09));
      const corrugation = 1 + Math.sin(angle * 9) * 0.045 * rim;
      profile.setXYZ(index, x * corrugation, y + Math.sin(angle * 5) * 0.006 * rim, z * corrugation);
    }
    geometry.computeVertexNormals();
    geometry.rotateX(Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const depth = positions.getZ(index);
      const value = depth > 0.10 ? 1 : depth > 0.045 ? 0.66 : 0.25;
      colors.set([value, value * 0.94, value * 0.84], index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return geometry;
  }

  private addSkinColors(): void {
    const positions = this.sphere.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const pigment = 0.75 + 0.09 * Math.sin(x * 19 + y * 11) * Math.cos(z * 17 - y * 7)
        + 0.07 * Math.sin(y * 5 + x * 3);
      const stain = Math.max(0, Math.sin(x * 13 - z * 9 + y * 6)) * 0.09;
      colors.set([pigment * 0.87 + stain, pigment, pigment * 0.9 - stain * 0.3], index * 3);
    }
    this.sphere.setAttribute('color', new BufferAttribute(colors, 3));
  }

  private addFace(): void {
    for (const side of [-1, 1]) {
      const x = side * 3.85;
      const y = 2.55 + (side > 0 ? -0.23 : 0);
      const socket = this.flesh(this.mantle, 'kraken-eye-socket', [x, y, 1.62], [0.90, 0.46, 0.42], this.dark);
      socket.rotation.z = side * 0.19;
      this.flesh(this.mantle, 'kraken-eye', [x - side * 0.08, y, 2.01], [0.51, side > 0 ? 0.23 : 0.29, 0.18], this.iris);
      const pupil = this.flesh(this.mantle, 'kraken-pupil', [x - side * 0.12, y, 2.18], [0.055, 0.235, 0.025], this.dark);
      pupil.rotation.z = side * 0.16;
      this.addIris(x - side * 0.08, y, side);
      this.addEyelid(x, y, side, true);
      this.addEyelid(x, y, side, false);
    }
  }

  private addEyelid(x: number, y: number, side: number, upper: boolean): void {
    const points: [number, number, number][] = [];
    for (let index = 0; index <= 8; index++) {
      const u = index / 4 - 1;
      const arch = Math.sqrt(Math.max(0, 1 - u * u));
      points.push([
        x + u * 0.99,
        y + (upper ? 0.22 : -0.28) * arch + side * u * 0.09,
        2.04 - u * u * 0.26 - side * u * 0.22,
      ]);
    }
    this.addFold(points, upper ? 0.16 : 0.105, upper ? 'kraken-upper-lid' : 'kraken-lower-lid');
  }

  private addFold(points: [number, number, number][], radius: number, name: string): void {
    const curve = new CatmullRomCurve3(points.map(point => new Vector3(...point)));
    const geometry = new TubeGeometry(curve, 18, radius, 6, false);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors.set([0.69, 0.79, 0.71], index);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.ownedGeometry.push(geometry);
    const mesh = new Mesh(geometry, this.skin);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mantle.add(mesh);
  }

  private addIris(x: number, y: number, side: number): void {
    const geometry = new RingGeometry(0.09, 0.38, 40, 3);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const angle = Math.atan2(positions.getY(index), positions.getX(index));
      const radius = Math.hypot(positions.getX(index), positions.getY(index));
      const shade = 0.50 + 0.18 * Math.sin(angle * 23 + side) + 0.13 * Math.cos(angle * 37);
      const rim = radius > 0.34 ? 0.35 : 1;
      colors.set([shade * rim, shade * 0.8 * rim, shade * 0.37 * rim], index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.ownedGeometry.push(geometry);
    const iris = new Mesh(geometry, this.pale);
    iris.name = 'kraken-iris-fibres';
    iris.position.set(x, y, 2.19);
    iris.scale.y = side > 0 ? 0.53 : 0.67;
    this.mantle.add(iris);
  }

  update(time: number, rise: number, descent: number): void {
    const breath = Math.sin(time * 0.55) * 0.012;
    this.mantle.scale.set(1 + breath, 1 - breath * 0.6, 1 + breath * 0.35);
    this.mantle.rotation.z = Math.sin(time * 0.16) * 0.008;
    for (let index = 0; index < this.arms.length; index++) this.updateArm(index, time, rise, descent);
  }

  private updateArm(index: number, time: number, rise: number, descent: number): void {
    const arm = this.arms[index]!;
    const pose = ARM_POSES[index]!;
    const side = Math.sign(pose.x);
    if (pose.wrapsBoat) {
      this.updateSubmergedArm(arm, side, time * pose.speed + pose.phase, pose.z);
      return;
    }
    const delay = 0.25 + 0.035 * index;
    const lag = krakenEase((descent - delay) / (1 - delay));
    const lift = (1 - rise) * 4.5 + descent * 13.5 - lag * 14;
    const phase = time * pose.speed + pose.phase;
    const sway = Math.sin(phase) * 0.42;
    const flex = Math.sin(phase * 1.37 + 0.8) * 0.23;
    const curl = 1.3 + (index % 3) * 0.16 + Math.sin(phase * 0.81 + 1.1) * 0.16;
    const sweep = Math.PI * (1.48 + Math.sin(phase * 0.63 + index) * 0.16);
    const x = pose.x + pose.inwardZ * sway;
    const z = pose.z - pose.inwardX * sway;
    const height = pose.height + lift;
    arm.points[0]!.set(side * (3.8 + index % 3 * 0.3), -1.15, -0.8 - index % 4);
    arm.points[1]!.set(side * 6.1, -0.8 + lift * 0.4, pose.z * 0.28);
    arm.points[2]!.set(x * 0.82 - pose.inwardZ * flex, pose.height * 0.26 + lift,
      z * 0.68 + pose.inwardX * flex);
    arm.points[3]!.set(x - pose.inwardX * 0.32, height - curl * 0.95 + flex,
      z - pose.inwardZ * 0.32);
    // A shrinking spiral gives each tip a loose, slowly tightening curl.
    for (let point = 4; point < arm.points.length; point++) {
      const t = (point - 4) / (arm.points.length - 5);
      const angle = Math.PI - t * sweep;
      const radius = curl * (1 - t * 0.76);
      const inward = curl + Math.cos(angle) * radius;
      const twist = Math.sin(t * Math.PI) * Math.sin(phase * 0.72 + t * 2.1) * 0.24;
      arm.points[point]!.set(x + pose.inwardX * inward + pose.inwardZ * twist,
        height + Math.sin(angle) * radius + flex * t,
        z + pose.inwardZ * inward - pose.inwardX * twist);
    }
    arm.update();
  }

  private updateSubmergedArm(arm: KrakenTentacle, side: number, phase: number, reach: number): void {
    // Dive beside the bow, then curve inward beneath the hull and behind the player.
    arm.points[0]!.set(side * 3.8, -1.15, -0.8);
    arm.points[1]!.set(side * 6.1, -2.8, 6.5);
    arm.points[2]!.set(side * 5.1, -4.2, 12.5);
    arm.points[3]!.set(side * 3.6, -4.6, 17.5);
    for (let point = 4; point < arm.points.length; point++) {
      const t = (point - 3) / (arm.points.length - 4);
      arm.points[point]!.set(
        side * (0.65 + 2.95 * (1 - t) ** 2),
        -4.6 + Math.sin(phase + t * 2) * 0.12,
        17.5 + (reach - 17.5) * t,
      );
    }
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
    this.skinTextures.color.dispose(); this.skinTextures.surface.dispose();
    this.skin.dispose(); this.pale.dispose(); this.dark.dispose(); this.iris.dispose();
    this.root.clear();
  }
}
