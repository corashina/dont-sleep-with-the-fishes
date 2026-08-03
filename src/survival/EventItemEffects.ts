import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { EventItemUseSample } from './eventItemUseChoreography';

type EffectRoot = Group;

const TAPE = 'event-item-tape';
const NET = 'event-item-net';
const FLARE = 'event-item-flare';
const CHAIN = 'event-item-chain';
const UMBRELLA = 'event-item-umbrella';
const FLASHLIGHT = 'event-item-flashlight-beam';
const HARPOON = 'event-item-harpoon';
const BINOCULAR_MASK = 'event-item-binocular-mask';

function clampEffect(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Owns the short-lived visual cues for survival item use. */
export class EventItemEffects {
  readonly root = new Group();

  private readonly effects: readonly EffectRoot[];
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly baseOpacities = new Map<Material, number>();
  private readonly actorPosition = new Vector3();
  private readonly flareLight: PointLight;
  private readonly flashlightLight: PointLight;
  private readonly tape: EffectRoot;
  private readonly net: EffectRoot;
  private readonly flare: EffectRoot;
  private readonly chain: EffectRoot;
  private readonly umbrella: EffectRoot;
  private readonly flashlight: EffectRoot;
  private readonly harpoon: EffectRoot;
  private readonly binocularMask: EffectRoot;
  private disposed = false;

  constructor() {
    this.root.name = 'event-item-effects';
    this.tape = this.createTape();
    this.net = this.createNet();
    [this.flare, this.flareLight] = this.createFlare();
    this.chain = this.createChain();
    this.umbrella = this.createUmbrella();
    [this.flashlight, this.flashlightLight] = this.createFlashlight();
    this.harpoon = this.createHarpoon();
    this.binocularMask = this.createBinocularMask();
    this.effects = [
      this.tape,
      this.net,
      this.flare,
      this.chain,
      this.umbrella,
      this.flashlight,
      this.harpoon,
      this.binocularMask,
    ];
    this.root.add(...this.effects);
    this.clear();
  }

  apply(sample: Readonly<EventItemUseSample>, actor: Object3D): void {
    if (this.disposed) return;
    this.clear();
    if (sample.effectKind === 'none' || sample.effectKind === 'bucket-cover') return;

    actor.updateWorldMatrix(true, false);
    actor.getWorldPosition(this.actorPosition);
    this.root.position.copy(this.actorPosition);
    actor.getWorldQuaternion(this.root.quaternion);

    const primary = clampEffect(sample.primaryEffect);
    const secondary = clampEffect(sample.secondaryEffect);
    switch (sample.effectKind) {
      case 'tape':
        this.show(this.tape);
        this.tape.position.set(-0.06, 0.1, -0.52);
        this.tape.rotation.z = 0.08;
        this.tape.scale.set(0.72 + primary * 0.76, 0.9, 1);
        break;
      case 'net':
        this.show(this.net);
        this.net.position.set(0.26 + primary * 0.35, 0.14, -0.58);
        this.net.rotation.set(0.08, -0.24, -0.18 - primary * 0.2);
        this.net.scale.setScalar(0.7 + primary * 0.42);
        break;
      case 'flare':
        this.show(this.flare);
        this.flare.position.set(0.36, 0.22 + primary * 0.34, -0.48);
        this.flare.scale.setScalar(0.7 + primary * 0.42);
        this.flareLight.intensity = 1.8 + primary * 5.4;
        break;
      case 'chain':
        this.show(this.chain);
        this.chain.position.set(0.13, -0.18 - primary * 0.75, -0.36);
        this.chain.rotation.z = 0.1 + primary * 0.22;
        this.chain.scale.y = 0.58 + primary * 0.72;
        break;
      case 'umbrella':
        this.show(this.umbrella);
        this.umbrella.position.set(0.04, 0.38 + primary * 0.42, -0.38 - primary * 0.14);
        this.umbrella.rotation.set(-0.16 - primary * 0.24, 0.06, 0.04);
        this.umbrella.scale.setScalar(0.76 + primary * 0.3);
        break;
      case 'flashlight':
        this.show(this.flashlight);
        this.flashlight.position.set(0.18, -0.02, -0.38);
        this.flashlight.rotation.set(0.02, -0.14, 0);
        this.flashlight.scale.setScalar(0.8 + primary * 0.28);
        this.flashlightLight.intensity = 1.1 + primary * 3.2 + secondary * 2.5;
        break;
      case 'harpoon':
        this.show(this.harpoon);
        this.harpoon.position.set(0.08, 0.04, -0.42 - primary * 1.2);
        this.harpoon.rotation.set(0.02, -0.08, -0.04);
        this.harpoon.scale.setScalar(0.84 + primary * 0.24);
        break;
      case 'binocular-mask':
        this.show(this.binocularMask);
        this.binocularMask.position.set(0, 0.02, -1.05);
        this.binocularMask.scale.setScalar(0.76 + primary * 0.26);
        this.binocularMask.rotation.y = Math.PI;
        break;
    }
  }

  clear(): void {
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    for (const effect of this.effects) {
      effect.visible = false;
      effect.position.set(0, 0, 0);
      effect.rotation.set(0, 0, 0);
      effect.scale.set(1, 1, 1);
    }
    for (const [material, opacity] of this.baseOpacities) material.opacity = opacity;
    if (this.flareLight) this.flareLight.intensity = 0;
    if (this.flashlightLight) this.flashlightLight.intensity = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.baseOpacities.clear();
    this.root.clear();
  }

  private show(effect: EffectRoot): void {
    effect.visible = true;
  }

  private mesh(
    geometry: BufferGeometry,
    material: Material,
    name: string,
  ): Mesh<BufferGeometry, Material> {
    this.geometries.add(geometry);
    this.trackMaterial(material);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  private trackMaterial(material: Material): void {
    this.materials.add(material);
    this.baseOpacities.set(material, material.opacity);
  }

  private createTape(): EffectRoot {
    const tape = new Group();
    tape.name = TAPE;
    const outline = new Shape([
      new Vector2(-0.56, -0.09),
      new Vector2(-0.17, -0.12),
      new Vector2(0.08, -0.085),
      new Vector2(0.57, -0.11),
      new Vector2(0.53, 0.09),
      new Vector2(0.15, 0.12),
      new Vector2(-0.13, 0.075),
      new Vector2(-0.55, 0.1),
    ]);
    const paper = new MeshStandardMaterial({ color: 0xb7a86e, roughness: 0.94, metalness: 0 });
    const strip = this.mesh(new ShapeGeometry(outline), paper, 'event-item-tape-strip');
    strip.rotation.y = Math.PI;
    tape.add(strip);
    return tape;
  }

  private createNet(): EffectRoot {
    const net = new Group();
    net.name = NET;
    const geometry = new BufferGeometry();
    const positions = new Float32Array([
      -0.56, -0.45, 0, -0.29, -0.5, 0, 0, -0.46, 0, 0.31, -0.49, 0, 0.55, -0.42, 0,
      -0.6, -0.16, 0, -0.31, -0.2, 0, 0.02, -0.15, 0, 0.29, -0.18, 0, 0.61, -0.12, 0,
      -0.55, 0.15, 0, -0.27, 0.12, 0, -0.03, 0.19, 0, 0.33, 0.14, 0, 0.57, 0.2, 0,
      -0.48, 0.47, 0, -0.24, 0.51, 0, 0.04, 0.46, 0, 0.28, 0.53, 0, 0.5, 0.43, 0,
    ]);
    const indices: number[] = [];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const index = row * 5 + column;
        if (column < 4) indices.push(index, index + 1);
        if (row < 3) indices.push(index, index + 5);
      }
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const cord = new LineBasicMaterial({ color: 0x54766d, transparent: true, opacity: 0.82 });
    this.geometries.add(geometry);
    this.trackMaterial(cord);
    const grid = new LineSegments(geometry, cord);
    grid.name = 'event-item-net-grid';
    net.add(grid);
    return net;
  }

  private createFlare(): [EffectRoot, PointLight] {
    const flare = new Group();
    flare.name = FLARE;
    const core = this.mesh(
      new SphereGeometry(0.075, 8, 6),
      new MeshBasicMaterial({ color: 0xffd1a0 }),
      'event-item-flare-core',
    );
    const halo = this.mesh(
      new RingGeometry(0.11, 0.28, 9),
      new MeshBasicMaterial({ color: 0xff7350, transparent: true, opacity: 0.48, depthWrite: false }),
      'event-item-flare-halo',
    );
    halo.rotation.y = Math.PI;
    const light = new PointLight(0xff724b, 0, 4.2, 2);
    light.name = 'event-item-flare-light';
    flare.add(core, halo, light);
    return [flare, light];
  }

  private createChain(): EffectRoot {
    const chain = new Group();
    chain.name = CHAIN;
    const linkGeometry = new TorusGeometry(0.075, 0.016, 4, 7);
    const iron = new MeshStandardMaterial({ color: 0x4d4a43, roughness: 0.76, metalness: 0.66 });
    for (let index = 0; index < 7; index += 1) {
      const link = this.mesh(linkGeometry, iron, `event-item-chain-link-${index}`);
      link.position.y = -index * 0.14;
      link.rotation.x = Math.PI / 2;
      link.rotation.z = index % 2 === 0 ? 0 : Math.PI / 2;
      chain.add(link);
    }
    return chain;
  }

  private createUmbrella(): EffectRoot {
    const umbrella = new Group();
    umbrella.name = UMBRELLA;
    const cloth = new MeshStandardMaterial({ color: 0x445c68, roughness: 0.9, metalness: 0, side: 2 });
    const canopy = this.mesh(new ConeGeometry(0.52, 0.28, 7, 1, true), cloth, 'event-item-umbrella-canopy');
    canopy.rotation.x = Math.PI;
    const ribGeometry = new CylinderGeometry(0.01, 0.012, 0.52, 4);
    const ribMaterial = new MeshStandardMaterial({ color: 0x312e2a, roughness: 0.72, metalness: 0.5 });
    umbrella.add(canopy);
    for (let index = 0; index < 4; index += 1) {
      const rib = this.mesh(ribGeometry, ribMaterial, `event-item-umbrella-rib-${index}`);
      rib.rotation.z = (index - 1.5) * 0.52;
      rib.rotation.x = Math.PI / 2;
      rib.position.y = -0.04;
      umbrella.add(rib);
    }
    return umbrella;
  }

  private createFlashlight(): [EffectRoot, PointLight] {
    const flashlight = new Group();
    flashlight.name = FLASHLIGHT;
    const beam = this.mesh(
      new ConeGeometry(0.24, 1.6, 8, 1, true),
      new MeshBasicMaterial({ color: 0xf2e4b3, transparent: true, opacity: 0.18, depthWrite: false, side: 2 }),
      'event-item-flashlight-cone',
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = -0.8;
    const light = new PointLight(0xffedb5, 0, 4.8, 2);
    light.name = 'event-item-flashlight-light';
    light.position.z = -0.16;
    flashlight.add(beam, light);
    return [flashlight, light];
  }

  private createHarpoon(): EffectRoot {
    const harpoon = new Group();
    harpoon.name = HARPOON;
    const shaft = this.mesh(
      new CylinderGeometry(0.025, 0.032, 1.12, 6),
      new MeshStandardMaterial({ color: 0x6f513b, roughness: 0.86 }),
      'event-item-harpoon-shaft',
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.56;
    const point = this.mesh(
      new ConeGeometry(0.065, 0.22, 4),
      new MeshStandardMaterial({ color: 0x8a8980, roughness: 0.48, metalness: 0.72 }),
      'event-item-harpoon-point',
    );
    point.rotation.x = -Math.PI / 2;
    point.position.z = -1.18;
    const smoke = new Group();
    smoke.name = 'event-item-harpoon-smoke';
    const smokeGeometry = new CircleGeometry(0.06, 6);
    const smokeMaterial = new MeshBasicMaterial({ color: 0xc4c8c0, transparent: true, opacity: 0.38, depthWrite: false });
    for (let index = 0; index < 4; index += 1) {
      const puff = this.mesh(smokeGeometry, smokeMaterial, `event-item-harpoon-smoke-${index}`);
      puff.position.set((index - 1.5) * 0.055, 0.03 + index * 0.045, -0.04 - index * 0.05);
      puff.scale.setScalar(1 + index * 0.3);
      smoke.add(puff);
    }
    harpoon.add(shaft, point, smoke);
    return harpoon;
  }

  private createBinocularMask(): EffectRoot {
    const mask = new Group();
    mask.name = BINOCULAR_MASK;
    const rimGeometry = new RingGeometry(0.22, 0.29, 12);
    const rimMaterial = new MeshBasicMaterial({ color: 0x1b2021, transparent: true, opacity: 0.9, depthWrite: false, side: 2 });
    const glassGeometry = new CircleGeometry(0.215, 12);
    const glassMaterial = new MeshBasicMaterial({ color: 0x243333, transparent: true, opacity: 0.5, depthWrite: false, side: 2 });
    for (const [index, x] of [-0.25, 0.25].entries()) {
      const lens = new Group();
      lens.name = `event-item-binocular-lens-${index}`;
      const rim = this.mesh(rimGeometry, rimMaterial, `event-item-binocular-rim-${index}`);
      const glass = this.mesh(glassGeometry, glassMaterial, `event-item-binocular-glass-${index}`);
      glass.position.z = -0.002;
      lens.position.x = x;
      lens.add(rim, glass);
      mask.add(lens);
    }
    return mask;
  }
}
