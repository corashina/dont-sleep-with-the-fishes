import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { clamp01Unchecked } from './animationMath';
import {
  LIFEBOAT_GUNWALE_SURFACE_Y,
  lifeboatHullHalfWidthAt,
} from '../world/Lifeboat';
import type { EventItemUseSample } from './eventItemUseChoreography';

type EffectRoot = Group;

const TAPE = 'event-item-tape';
const FLARE = 'event-item-flare';
const CHAIN = 'event-item-chain';
const FLASHLIGHT = 'event-item-flashlight-beam';
const SHOTGUN_SMOKE = 'event-item-shotgun-smoke';
const FLARE_MUZZLE_X = 0.34;
const FLARE_DISTANCE = 18;
const FLARE_ARC_HEIGHT = 3.2;
const FLARE_WATER_Y = 0.04;
const FLARE_FORWARD = new Vector3(1, 0, 0);
const CHAIN_LINK_AXIS = new Vector3(0, 1, 0);
const CHAIN_FALLBACK_EDGE_OFFSET = new Vector3(1.35, -0.22, -0.25);
const CHAIN_GUNWALE_Z = 0.55;
const CHAIN_GUNWALE_X = lifeboatHullHalfWidthAt(CHAIN_GUNWALE_Z) ?? 1.63;
const CHAIN_SEGMENT_SPLIT = 0.44;
const CHAIN_LINK_COUNT = 36;

/** Owns the short-lived visual cues for survival item use. */
export class EventItemEffects {
  readonly root = new Group();

  private readonly effects: readonly EffectRoot[];
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly baseOpacities = new Map<Material, number>();
  private readonly actorPosition = new Vector3();
  private readonly flarePosition = new Vector3();
  private readonly flareMuzzle = new Vector3();
  private readonly flareDirection = new Vector3();
  private readonly flareDestination = new Vector3();
  private flareLaunched = false;
  private flareTravel = 0;
  private readonly flashlightLight: PointLight;
  private readonly flareLight: PointLight;
  private readonly heldFillLight: PointLight;
  private readonly tape: EffectRoot;
  private readonly flare: EffectRoot;
  private readonly chain: EffectRoot;
  private readonly chainLinks: readonly Mesh<BufferGeometry, Material>[];
  private readonly flashlight: EffectRoot;
  private readonly shotgunSmoke: EffectRoot;
  private binocularStrength = 0;
  private effectOpacity = 0;
  private chainCaptured = false;
  private chainParent: Object3D | null = null;
  private readonly chainHandLocal = new Vector3();
  private readonly chainHandWorld = new Vector3();
  private readonly chainGunwaleLocal = new Vector3(
    CHAIN_GUNWALE_X,
    LIFEBOAT_GUNWALE_SURFACE_Y + 0.035,
    CHAIN_GUNWALE_Z,
  );
  private readonly chainGunwaleWorld = new Vector3();
  private readonly chainAnchorWorld = new Vector3();
  private readonly chainPoint = new Vector3();
  private readonly chainBefore = new Vector3();
  private readonly chainAfter = new Vector3();
  private readonly chainTangent = new Vector3();
  private readonly chainTwist = new Quaternion();
  private readonly applyEffectOpacity = (object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    if (Array.isArray(object.material)) {
      for (const material of object.material) this.setMaterialOpacity(material);
      return;
    }
    this.setMaterialOpacity(object.material);
  };
  private disposed = false;

  constructor() {
    this.root.name = 'event-item-effects';
    this.tape = this.createTape();
    [this.flare, this.flareLight] = this.createFlare();
    [this.chain, this.chainLinks] = this.createChain();
    [this.flashlight, this.flashlightLight] = this.createFlashlight();
    this.shotgunSmoke = this.createShotgunSmoke();
    this.heldFillLight = new PointLight(0xffddad, 0, 2.8, 2);
    this.heldFillLight.name = 'event-item-held-fill';
    this.heldFillLight.position.set(-0.24, 0.36, 0.48);
    this.effects = [
      this.tape,
      this.flare,
      this.chain,
      this.flashlight,
      this.shotgunSmoke,
    ];
    this.root.add(...this.effects, this.heldFillLight);
    this.clear();
  }

  apply(sample: Readonly<EventItemUseSample>, actor: Object3D): void {
    if (this.disposed) return;
    this.hideEffects();

    actor.updateWorldMatrix(true, false);
    actor.getWorldPosition(this.actorPosition);
    this.root.position.copy(this.actorPosition);
    actor.getWorldQuaternion(this.root.quaternion);
    this.heldFillLight.visible = sample.cameraSpaceBlend > 0 && sample.itemVisible;
    this.heldFillLight.intensity = sample.itemVisible
      ? clamp01Unchecked(sample.cameraSpaceBlend) * 3.4
      : 0;

    if (sample.effectKind === 'none' || sample.effectKind === 'bucket-cover') return;

    const primary = clamp01Unchecked(sample.primaryEffect);
    const secondary = clamp01Unchecked(sample.secondaryEffect);
    switch (sample.effectKind) {
      case 'tape':
        this.show(this.tape, primary);
        this.tape.position.set(-0.06, 0.1, -0.52);
        this.tape.rotation.z = 0.08;
        this.tape.scale.set(0.72 + primary * 0.76, 0.9, 1);
        break;
      case 'flare':
        this.root.quaternion.identity();
        this.show(this.flare, primary);
        if (!this.flareLaunched || sample.effectTravel < this.flareTravel) {
          this.captureFlareTrajectory(actor);
        }
        this.flareLaunched = true;
        this.flareTravel = sample.effectTravel;
        this.flarePosition
          .lerpVectors(this.flareMuzzle, this.flareDestination, sample.effectTravel);
        this.flarePosition.y += sample.effectArc * FLARE_ARC_HEIGHT;
        this.flare.position.copy(this.flarePosition).sub(this.actorPosition);
        this.flare.quaternion.setFromUnitVectors(FLARE_FORWARD, this.flareDirection);
        this.flare.scale.setScalar(
          0.94 + Math.sin(sample.effectTravel * Math.PI * 32) * 0.06,
        );
        this.flareLight.intensity = 5.4
          + Math.sin(sample.effectTravel * Math.PI * 38) * 0.8;
        break;
      case 'chain':
        this.root.quaternion.identity();
        this.show(this.chain, primary);
        this.updateChain(actor, secondary);
        break;
      case 'flashlight':
        this.show(this.flashlight, primary);
        this.flashlight.position.set(0, 0, 0);
        this.flashlight.rotation.set(0, 0, 0);
        this.flashlight.scale.setScalar(0.8 + primary * 0.28);
        this.flashlightLight.intensity = primary
          * (1.1 + primary * 3.2 + secondary * 2.5);
        break;
      case 'shotgun-smoke':
        this.show(this.shotgunSmoke, primary);
        this.shotgunSmoke.position.set(0.015, 0.025, -0.54 - secondary * 0.14);
        this.shotgunSmoke.rotation.set(0.02, -0.04, -0.04);
        for (let index = 0; index < this.shotgunSmoke.children.length; index += 1) {
          const puff = this.shotgunSmoke.children[index]!;
          const side = index % 2 === 0 ? -1 : 1;
          const spread = secondary * (0.035 + index * 0.012);
          puff.position.x = side * 0.006;
          puff.position.y = side * spread + secondary * (0.02 + index * 0.006);
          puff.position.z = -index * 0.024 - secondary * (0.06 + index * 0.018);
          puff.rotation.z = side * (0.12 + secondary * (0.22 + index * 0.04));
          puff.scale.setScalar(0.72 + index * 0.13 + secondary * (0.8 + index * 0.12));
        }
        break;
      case 'binocular-mask':
        this.binocularStrength = primary;
        break;
    }
  }

  clear(): void {
    this.hideEffects();
    this.flareLaunched = false;
    this.flareTravel = 0;
    this.chainCaptured = false;
    this.chainParent = null;
  }

  private hideEffects(): void {
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    for (const effect of this.effects) {
      effect.visible = false;
      effect.position.set(0, 0, 0);
      effect.rotation.set(0, 0, 0);
      effect.scale.set(1, 1, 1);
    }
    for (const material of this.baseOpacities.keys()) material.opacity = 0;
    this.binocularStrength = 0;
    if (this.flashlightLight) this.flashlightLight.intensity = 0;
    if (this.flareLight) this.flareLight.intensity = 0;
    if (this.heldFillLight) {
      this.heldFillLight.visible = false;
      this.heldFillLight.intensity = 0;
    }
  }

  private captureFlareTrajectory(actor: Object3D): void {
    this.flareMuzzle
      .set(FLARE_MUZZLE_X, 0, 0)
      .applyMatrix4(actor.matrixWorld);
    this.flareDirection
      .set(1, 0, 0)
      .transformDirection(actor.matrixWorld);
    this.flareDirection.y = 0;
    if (this.flareDirection.lengthSq() < 0.0001) {
      this.flareDirection.set(0, 0, -1);
    } else {
      this.flareDirection.normalize();
    }
    this.flareDestination
      .copy(this.flareMuzzle)
      .addScaledVector(this.flareDirection, FLARE_DISTANCE);
    this.flareDestination.y = FLARE_WATER_Y;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.flashlightLight.shadow.dispose();
    this.flareLight.shadow.dispose();
    this.heldFillLight.shadow.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.baseOpacities.clear();
    this.root.clear();
  }

  get binocularMaskStrength(): number {
    return this.binocularStrength;
  }

  private show(effect: EffectRoot, weight: number): void {
    this.effectOpacity = weight;
    effect.visible = weight > 0;
    effect.traverse(this.applyEffectOpacity);
  }

  private setMaterialOpacity(material: Material): void {
    material.opacity = (this.baseOpacities.get(material) ?? 1) * this.effectOpacity;
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
    material.transparent = true;
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

  private createFlare(): [EffectRoot, PointLight] {
    const flare = new Group();
    flare.name = FLARE;
    const core = this.mesh(
      new SphereGeometry(0.045, 10, 8),
      new MeshBasicMaterial({ color: 0xfff4c7 }),
      'event-item-flare-core',
    );
    const halo = this.mesh(
      new SphereGeometry(0.14, 10, 8),
      new MeshBasicMaterial({
        color: 0xff4b22,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
      'event-item-flare-halo',
    );
    const flame = this.mesh(
      new ConeGeometry(0.052, 0.34, 8, 1, true),
      new MeshBasicMaterial({
        color: 0xff7a28,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
      'event-item-flare-flame',
    );
    flame.position.x = -0.17;
    flame.rotation.z = -Math.PI / 2;

    const smokeGeometry = new SphereGeometry(0.055, 7, 5);
    const smokeMaterial = new MeshBasicMaterial({
      color: 0x8b8178,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    for (let index = 0; index < 4; index += 1) {
      const smoke = this.mesh(
        smokeGeometry,
        smokeMaterial,
        `event-item-flare-smoke-${index}`,
      );
      smoke.position.set(-0.34 - index * 0.1, (index % 2 - 0.5) * 0.035, 0);
      smoke.scale.setScalar(0.72 + index * 0.2);
      flare.add(smoke);
    }

    const light = new PointLight(0xff5c27, 0, 5.5, 2);
    light.name = 'event-item-flare-light';
    flare.add(halo, flame, core, light);
    return [flare, light];
  }

  private createChain(): [EffectRoot, readonly Mesh<BufferGeometry, Material>[]] {
    const chain = new Group();
    chain.name = CHAIN;
    const links: Mesh<BufferGeometry, Material>[] = [];
    const linkGeometry = new TorusGeometry(0.022, 0.005, 4, 8);
    linkGeometry.scale(0.72, 1.18, 1);
    const iron = new MeshStandardMaterial({
      color: 0x45433d,
      roughness: 0.68,
      metalness: 0.78,
      flatShading: true,
    });
    for (let index = 0; index < CHAIN_LINK_COUNT; index += 1) {
      const link = this.mesh(linkGeometry, iron, `event-item-chain-link-${index}`);
      links.push(link);
      chain.add(link);
    }
    return [chain, links];
  }

  private updateChain(actor: Object3D, travel: number): void {
    const parent = actor.parent;
    if (!this.chainCaptured || this.chainParent !== parent) {
      actor.updateWorldMatrix(true, false);
      actor.getWorldPosition(this.chainHandLocal);
      if (parent !== null) parent.worldToLocal(this.chainHandLocal);
      this.chainParent = parent;
      this.chainCaptured = true;
    }

    actor.updateWorldMatrix(true, false);
    actor.getWorldPosition(this.actorPosition);
    this.chainAnchorWorld.set(0, 0.22, 0).applyMatrix4(actor.matrixWorld);
    if (parent === null) {
      this.chainHandWorld.copy(this.chainHandLocal);
      this.chainGunwaleWorld
        .copy(this.chainHandWorld)
        .add(CHAIN_FALLBACK_EDGE_OFFSET);
    } else {
      parent.updateWorldMatrix(true, false);
      this.chainHandWorld.copy(this.chainHandLocal).applyMatrix4(parent.matrixWorld);
      this.chainGunwaleWorld.copy(this.chainGunwaleLocal).applyMatrix4(parent.matrixWorld);
    }

    const lastIndex = this.chainLinks.length - 1;
    for (let index = 0; index <= lastIndex; index += 1) {
      const progress = index / lastIndex;
      this.sampleChainPoint(progress, travel, this.chainPoint);
      this.sampleChainPoint(Math.max(0, progress - 0.02), travel, this.chainBefore);
      this.sampleChainPoint(Math.min(1, progress + 0.02), travel, this.chainAfter);
      this.chainTangent.subVectors(this.chainAfter, this.chainBefore).normalize();
      const link = this.chainLinks[index]!;
      link.position.copy(this.chainPoint).sub(this.actorPosition);
      link.quaternion.setFromUnitVectors(CHAIN_LINK_AXIS, this.chainTangent);
      if (index % 2 !== 0) {
        this.chainTwist.setFromAxisAngle(this.chainTangent, Math.PI / 2);
        link.quaternion.premultiply(this.chainTwist);
      }
    }
  }

  private sampleChainPoint(progress: number, travel: number, output: Vector3): void {
    if (progress <= CHAIN_SEGMENT_SPLIT) {
      const segmentProgress = progress / CHAIN_SEGMENT_SPLIT;
      output.lerpVectors(this.chainHandWorld, this.chainGunwaleWorld, segmentProgress);
      output.y -= Math.sin(Math.PI * segmentProgress) * 0.055;
      return;
    }
    const segmentProgress = (progress - CHAIN_SEGMENT_SPLIT) / (1 - CHAIN_SEGMENT_SPLIT);
    output.lerpVectors(this.chainGunwaleWorld, this.chainAnchorWorld, segmentProgress);
    output.y -= Math.sin(Math.PI * segmentProgress) * (0.08 + travel * 0.22);
  }

  private createFlashlight(): [EffectRoot, PointLight] {
    const flashlight = new Group();
    flashlight.name = FLASHLIGHT;
    const beam = this.mesh(
      new ConeGeometry(0.42, 4.2, 10, 1, true),
      new MeshBasicMaterial({ color: 0xffefb8, transparent: true, opacity: 0.16, depthWrite: false, side: 2 }),
      'event-item-flashlight-cone',
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.x = 2.1;
    const light = new PointLight(0xffedb5, 0, 4.8, 2);
    light.name = 'event-item-flashlight-light';
    light.position.x = 0.16;
    flashlight.add(beam, light);
    return [flashlight, light];
  }

  private createShotgunSmoke(): EffectRoot {
    const smoke = new Group();
    smoke.name = SHOTGUN_SMOKE;
    const smokeGeometry = new SphereGeometry(0.065, 7, 5);
    const smokeMaterial = new MeshBasicMaterial({
      color: 0xb8b9af,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: 2,
    });
    for (let index = 0; index < 6; index += 1) {
      const puff = this.mesh(
        smokeGeometry,
        smokeMaterial,
        `event-item-shotgun-smoke-puff-${index}`,
      );
      puff.position.set(index % 2 === 0 ? -0.006 : 0.006, 0, -index * 0.024);
      puff.rotation.z = index % 2 === 0 ? -0.12 : 0.12;
      puff.scale.setScalar(0.72 + index * 0.13);
      smoke.add(puff);
    }
    return smoke;
  }

}
