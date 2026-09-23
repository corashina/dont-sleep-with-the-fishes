import {
  BufferGeometry,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
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
import { FlashlightBeam } from './FlashlightBeam';
import { ShotgunBlast } from './ShotgunBlast';
import {
  LIFEBOAT_GUNWALE_SURFACE_Y,
  LIFEBOAT_PLAYER_BENCH_Z,
  lifeboatHullHalfWidthAt,
} from '../world/Lifeboat';
import type { EventItemUseSample } from './eventItemUseChoreography';

type EffectRoot = Group;

const TAPE = 'event-item-tape';
const FLARE = 'event-item-flare';
const CHAIN = 'event-item-chain';
const FLARE_MUZZLE_X = 0.34;
const FLARE_DISTANCE = 21;
const FLARE_ARC_HEIGHT = 3.2;
const FLARE_WATER_Y = 0.04;
const FLARE_FORWARD = new Vector3(1, 0, 0);
const CHAIN_LINK_AXIS = new Vector3(0, 1, 0);
const CHAIN_FALLBACK_EDGE_OFFSET = new Vector3(1.35, -0.22, -0.25);
const CHAIN_BOAT_ATTACHMENT_LOCAL = new Vector3(0, 0.29, LIFEBOAT_PLAYER_BENCH_Z);
const CHAIN_ANCHOR_SINK_DEPTH = 3;
const CHAIN_GUNWALE_Z = -0.85;
const CHAIN_GUNWALE_X = lifeboatHullHalfWidthAt(CHAIN_GUNWALE_Z) ?? 1.63;
const CHAIN_LINK_CAPACITY = 256;
const CHAIN_LINK_PITCH = 0.056;
const CHAIN_PATH_SEGMENTS = 128;
const CHAIN_SPAN_SEGMENTS = CHAIN_PATH_SEGMENTS / 2;
const CHAIN_SAG_WEIGHTS = Float64Array.from(
  { length: CHAIN_SPAN_SEGMENTS + 1 },
  (_, index) => Math.sin(Math.PI * index / CHAIN_SPAN_SEGMENTS),
);
const CHAIN_LINK_SCALE = new Vector3(1, 1, 1);
const CHAIN_GRAVITY = new Vector3(0, -1, 0);

function chainSpanLength(start: Vector3, end: Vector3, sag: number, direction = CHAIN_GRAVITY): number {
  const stepX = (end.x - start.x) / CHAIN_SPAN_SEGMENTS;
  const stepY = (end.y - start.y) / CHAIN_SPAN_SEGMENTS;
  const stepZ = (end.z - start.z) / CHAIN_SPAN_SEGMENTS;
  let length = 0;
  for (let index = 1; index <= CHAIN_SPAN_SEGMENTS; index += 1) {
    const sagStep = (CHAIN_SAG_WEIGHTS[index]! - CHAIN_SAG_WEIGHTS[index - 1]!) * sag;
    length += Math.hypot(
      stepX + sagStep * direction.x, stepY + sagStep * direction.y, stepZ + sagStep * direction.z,
    );
  }
  return length;
}

function chainSagForLength(start: Vector3, end: Vector3, length: number, direction: Vector3): number {
  if (start.distanceTo(end) >= length) return 0;
  let low = 0;
  let high = length;
  // Fixed work and no frame history: boat motion changes slack without adding links.
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const sag = (low + high) / 2;
    if (chainSpanLength(start, end, sag, direction) < length) low = sag;
    else high = sag;
  }
  return (low + high) / 2;
}

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
  private readonly flareLight: PointLight;
  private readonly heldFillLight: PointLight;
  private readonly tape: EffectRoot;
  private readonly flare: EffectRoot;
  private readonly chain: EffectRoot;
  private readonly chainLinks: InstancedMesh<BufferGeometry, Material>;
  readonly flashlight = new FlashlightBeam();
  private readonly shotgun = new ShotgunBlast();
  private binocularStrength = 0;
  private effectOpacity = 0;
  private readonly chainBoatWorld = new Vector3();
  private readonly chainGunwaleLocal = new Vector3(
    CHAIN_GUNWALE_X,
    LIFEBOAT_GUNWALE_SURFACE_Y + 0.035,
    CHAIN_GUNWALE_Z,
  );
  private readonly chainGunwaleWorld = new Vector3();
  private readonly chainAnchorWorld = new Vector3();
  private readonly chainImpactWorld = new Vector3();
  private readonly chainOutwardWorld = new Vector3();
  private readonly chainOuterSagDirection = new Vector3();
  private chainLanded = false;
  private chainDeployedLength = 0;
  private chainDeployedCount = 0;
  private readonly chainPoint = new Vector3();
  private readonly chainBefore = new Vector3();
  private readonly chainAfter = new Vector3();
  private readonly chainPath = Array.from({ length: CHAIN_PATH_SEGMENTS + 1 }, () => new Vector3());
  private readonly chainDistances = new Float64Array(CHAIN_PATH_SEGMENTS + 1);
  private readonly chainTangent = new Vector3();
  private readonly chainPreviousTangent = new Vector3();
  private readonly chainTransportRotation = new Quaternion();
  private readonly chainTwist = new Quaternion();
  private readonly chainRotation = new Quaternion();
  private readonly chainMatrix = new Matrix4();
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
    this.heldFillLight = new PointLight(0xffddad, 0, 2.8, 2);
    this.heldFillLight.name = 'event-item-held-fill';
    this.heldFillLight.position.set(-0.24, 0.36, 0.48);
    this.effects = [
      this.tape,
      this.flare,
      this.chain,
    ];
    // Keep lights outside hidden effect groups so preparation sees the animation's light count.
    this.root.add(...this.effects, this.flashlight, this.shotgun, this.heldFillLight, this.flareLight);
    this.clear();
  }

  apply(sample: Readonly<EventItemUseSample>, actor: Object3D, heldFill: boolean): void {
    if (this.disposed) return;
    this.hideEffects();
    if (sample.effectKind !== 'shotgun-blast') this.shotgun.reset();

    actor.updateWorldMatrix(true, false);
    actor.getWorldPosition(this.actorPosition);
    this.root.position.copy(this.actorPosition);
    actor.getWorldQuaternion(this.root.quaternion);
    this.applyHeldFill(sample, heldFill);

    if (sample.effectKind === 'none') return;

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
        this.applyFlare(sample, actor, primary);
        break;
      case 'chain':
        this.root.quaternion.identity();
        this.show(this.chain, primary);
        this.updateChain(actor, secondary, sample.effectTravel);
        break;
      case 'flashlight':
        this.flashlight.apply(actor, primary, secondary);
        break;
      case 'shotgun-blast':
        this.root.quaternion.identity();
        this.shotgun.apply(sample, actor);
        break;
      case 'binocular-mask':
        this.binocularStrength = primary;
        break;
    }
  }

  private applyHeldFill(sample: Readonly<EventItemUseSample>, enabled: boolean): void {
    this.heldFillLight.intensity = enabled && sample.itemVisible
      ? clamp01Unchecked(sample.cameraSpaceBlend) * 3.4
      : 0;
  }

  private applyFlare(
    sample: Readonly<EventItemUseSample>,
    actor: Object3D,
    primary: number,
  ): void {
    this.root.quaternion.identity();
    this.show(this.flare, primary);
    if (!this.flareLaunched || sample.effectTravel < this.flareTravel) {
      this.captureFlareTrajectory(actor);
    }
    this.flareLaunched = true;
    this.flareTravel = sample.effectTravel;
    this.flarePosition.lerpVectors(this.flareMuzzle, this.flareDestination, sample.effectTravel);
    this.flarePosition.y += sample.effectArc * FLARE_ARC_HEIGHT;
    this.flare.position.copy(this.flarePosition).sub(this.actorPosition);
    this.flare.quaternion.setFromUnitVectors(FLARE_FORWARD, this.flareDirection);
    this.flare.scale.setScalar(0.94 + Math.sin(sample.effectTravel * Math.PI * 32) * 0.06);
    this.flareLight.position.copy(this.flare.position);
    this.flareLight.intensity = primary > 0
      ? 7.2 + Math.sin(sample.effectTravel * Math.PI * 38)
      : 0;
  }

  clear(): void {
    this.chainLanded = false;
    this.chainDeployedLength = 0;
    this.chainDeployedCount = 0;
    this.hideEffects();
    this.shotgun.reset();
    this.flashlight.setTarget(null);
    this.flareLaunched = false;
    this.flareTravel = 0;
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
    this.flashlight.hide();
    this.shotgun.visible = false;
    if (this.flareLight) this.flareLight.intensity = 0;
    if (this.heldFillLight) this.heldFillLight.intensity = 0;
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
    this.flashlight.dispose();
    this.shotgun.dispose();
    this.flareLight.shadow.dispose();
    this.heldFillLight.shadow.dispose();
    this.chainLinks.dispose();
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
      new SphereGeometry(0.035, 10, 8),
      new MeshBasicMaterial({ color: 0xfff4c7 }),
      'event-item-flare-core',
    );
    const halo = this.mesh(
      new SphereGeometry(0.12, 10, 8),
      new MeshBasicMaterial({
        color: 0xff4b22,
        transparent: true,
        opacity: 0.38,
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

    const light = new PointLight(0xff5c27, 0, 7.5, 2);
    light.name = 'event-item-flare-light';
    flare.add(halo, flame, core);
    return [flare, light];
  }

  private createChain(): [EffectRoot, InstancedMesh<BufferGeometry, Material>] {
    const chain = new Group();
    chain.name = CHAIN;
    const linkGeometry = new TorusGeometry(0.025, 0.005, 6, 16);
    linkGeometry.scale(0.8, 1.4, 1);
    const iron = new MeshStandardMaterial({
      color: 0x45433d,
      roughness: 0.68,
      metalness: 0.78,
      flatShading: true,
    });
    this.geometries.add(linkGeometry);
    this.trackMaterial(iron);
    const links = new InstancedMesh(linkGeometry, iron, CHAIN_LINK_CAPACITY);
    links.name = 'event-item-chain-links';
    links.instanceMatrix.setUsage(DynamicDrawUsage);
    links.frustumCulled = false;
    chain.add(links);
    return [chain, links];
  }

  private updateChain(actor: Object3D, travel: number, sink: number): void {
    const parent = actor.parent;
    actor.updateWorldMatrix(true, false);
    actor.getWorldPosition(this.actorPosition);
    if (travel < 1 || !this.chainLanded) {
      this.chainImpactWorld.set(0, 0.22, 0).applyMatrix4(actor.matrixWorld);
      this.chainLanded = travel >= 1;
    }
    this.chainAnchorWorld.copy(this.chainImpactWorld);
    this.chainAnchorWorld.y -= CHAIN_ANCHOR_SINK_DEPTH * sink;
    if (parent === null) {
      this.chainOutwardWorld.set(1, 0, 0);
      this.chainBoatWorld.copy(this.actorPosition);
      this.chainGunwaleWorld
        .copy(this.chainBoatWorld)
        .add(CHAIN_FALLBACK_EDGE_OFFSET);
    } else {
      parent.updateWorldMatrix(true, false);
      this.chainBoatWorld
        .copy(CHAIN_BOAT_ATTACHMENT_LOCAL)
        .applyMatrix4(parent.matrixWorld);
      this.chainGunwaleWorld.copy(this.chainGunwaleLocal).applyMatrix4(parent.matrixWorld);
      this.chainOutwardWorld.setFromMatrixColumn(parent.matrixWorld, 0);
      this.chainOutwardWorld.y = 0;
      this.chainOutwardWorld.normalize();
    }

    // Water drag bows the submerged chain outward, without curling its tail upward.
    this.chainOuterSagDirection.copy(this.chainOutwardWorld).multiplyScalar(sink);
    this.chainOuterSagDirection.y = sink - 1;
    this.chainOuterSagDirection.normalize();
    this.updateChainPath(travel, sink);
    this.placeChainLinks();
  }

  private updateChainPath(travel: number, sink: number): void {
    let outerSag = 0.08 + travel * 0.22;
    if (this.chainLanded && this.chainDeployedLength > 0) {
      const innerLength = chainSpanLength(this.chainBoatWorld, this.chainGunwaleWorld, 0.055);
      outerSag = chainSagForLength(
        this.chainGunwaleWorld, this.chainAnchorWorld, this.chainDeployedLength - innerLength,
        this.chainOuterSagDirection,
      );
    }
    this.writeChainSpan(this.chainBoatWorld, this.chainGunwaleWorld, 0.055, 0);
    this.writeChainSpan(
      this.chainGunwaleWorld, this.chainAnchorWorld, outerSag, CHAIN_SPAN_SEGMENTS, this.chainOuterSagDirection,
    );
    if (sink >= 1 && this.chainDeployedLength === 0) {
      this.chainDeployedLength = this.chainDistances[CHAIN_PATH_SEGMENTS]!;
      this.chainDeployedCount = Math.min(
        CHAIN_LINK_CAPACITY, Math.ceil(this.chainDeployedLength / CHAIN_LINK_PITCH) + 1,
      );
    }
  }

  private writeChainSpan(start: Vector3, end: Vector3, sag: number, offset: number, direction = CHAIN_GRAVITY): void {
    for (let step = 0; step <= CHAIN_SPAN_SEGMENTS; step += 1) {
      const index = offset + step;
      const point = this.chainPath[index]!;
      point.lerpVectors(start, end, step / CHAIN_SPAN_SEGMENTS);
      point.addScaledVector(direction, CHAIN_SAG_WEIGHTS[step]! * sag);
      if (index > 0) {
        this.chainDistances[index] = this.chainDistances[index - 1]!
          + point.distanceTo(this.chainPath[index - 1]!);
      }
    }
  }

  private placeChainLinks(): void {
    const length = this.chainDistances[CHAIN_PATH_SEGMENTS]!;
    const lastIndex = this.chainDeployedCount > 0
      ? this.chainDeployedCount - 1
      : Math.min(CHAIN_LINK_CAPACITY - 1, Math.ceil(length / CHAIN_LINK_PITCH));
    const stretch = this.chainDeployedLength > 0 ? length / this.chainDeployedLength : 1;
    this.chainLinks.count = lastIndex + 1;
    for (let index = 0; index <= lastIndex; index += 1) {
      const distance = index === lastIndex ? length : Math.min(length, index * CHAIN_LINK_PITCH * stretch);
      this.sampleChainDistance(distance, this.chainPoint).sub(this.actorPosition);
      // A link straddles the curve. Use its full length to turn smoothly over the gunwale.
      this.sampleChainDistance(Math.max(0, distance - CHAIN_LINK_PITCH / 2), this.chainBefore);
      this.sampleChainDistance(Math.min(length, distance + CHAIN_LINK_PITCH / 2), this.chainAfter);
      this.chainTangent.subVectors(this.chainAfter, this.chainBefore).normalize();
      if (index === 0) {
        this.chainTransportRotation.setFromUnitVectors(CHAIN_LINK_AXIS, this.chainTangent);
      } else {
        this.chainTwist.setFromUnitVectors(this.chainPreviousTangent, this.chainTangent);
        this.chainTransportRotation.premultiply(this.chainTwist);
      }
      this.chainPreviousTangent.copy(this.chainTangent);
      this.chainRotation.copy(this.chainTransportRotation);
      if (index % 2 !== 0) {
        this.chainTwist.setFromAxisAngle(this.chainTangent, Math.PI / 2);
        this.chainRotation.premultiply(this.chainTwist);
      }
      this.chainMatrix.compose(this.chainPoint, this.chainRotation, CHAIN_LINK_SCALE);
      this.chainLinks.setMatrixAt(index, this.chainMatrix);
    }
    this.chainLinks.instanceMatrix.needsUpdate = true;
  }

  private sampleChainDistance(distance: number, output: Vector3): Vector3 {
    let low = 1;
    let high = CHAIN_PATH_SEGMENTS;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.chainDistances[middle]! < distance) low = middle + 1;
      else high = middle;
    }
    const before = this.chainDistances[low - 1]!;
    const span = this.chainDistances[low]! - before;
    return output.lerpVectors(
      this.chainPath[low - 1]!, this.chainPath[low]!, span > 0 ? (distance - before) / span : 0,
    );
  }

}
