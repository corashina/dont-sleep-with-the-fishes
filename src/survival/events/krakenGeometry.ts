import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Group, InstancedMesh, LatheGeometry, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PointLight, RingGeometry, SphereGeometry, TubeGeometry,
  Vector2, Vector3,
} from 'three';
import { KrakenTentacle } from './KrakenTentacle';
import {
  KRAKEN_BOAT_DISTANCE, KRAKEN_EMERGE_SECONDS, KRAKEN_EYES_OPEN_AT, KRAKEN_EYES_OPEN_SECONDS,
  KRAKEN_HEAD_RISE_START, krakenEase, krakenHeave,
} from './krakenChoreography';
import { createKrakenSkinTextures } from './krakenSkin';
import { createKrakenMantle } from './krakenAnatomy';

const HEAD_SCALE = 1.75;
const HIDDEN_DEPTH = 34;
const DESCENT_DEPTH = 30;
const BOAT_Z = KRAKEN_BOAT_DISTANCE;
const BODY_POSITION = [0, 1.5, -2.3] as const;
const BODY_SCALE = [7.6, 5.7, 4.7] as const;
const UP = new Vector3(0, 1, 0);

// Each arm has its own lane around the boat. The two towers hang their tips over the bow.
const ARM_POSES = ([
  // x, z, height, curl, radius, emerge time, sweep
  [-2.6, BOAT_Z + 6.5, 0, 0, 1.0, 0, 0],
  [2.9, BOAT_Z + 7, 0, 0, 1.0, 0, 0],
  [-10, 11.5, 6.8, 2.6, 1.6, 0.25, 1.45],
  [11, 10.5, 7.8, 2.9, 1.65, 0.85, 1.4],
  [-17, 9, 3.8, 2.2, 1.3, 1.5, 1.8],
  [18, 7, 5.5, 2.0, 1.3, 0.55, 1.6],
  [-12.5, 17, 2.8, 1.6, 1.15, 1.95, 1.9],
  [13.5, 16, 3.6, 1.7, 1.2, 1.2, 1.7],
  [-11, -2, 12, 2.4, 1.45, 2.45, 1.3],
  [11.5, -1, 13.5, 2.6, 1.5, 1.85, 1.35],
] as const).map(([x, z, height, curl, radius, emerge, sweep], index) => {
  const distance = Math.hypot(x, BOAT_Z - z);
  return { x, z, height, curl, radius, emerge, sweep, wrapsBoat: height === 0,
    inwardX: -x / distance, inwardZ: (BOAT_Z - z) / distance,
    phase: index * 2.39996, speed: 0.5 + (index % 3) * 0.09 };
});

interface KrakenEye {
  readonly side: number;
  readonly lid: Group;
  readonly pupil: Mesh;
  readonly iris: Mesh;
  readonly pupilX: number;
  readonly irisX: number;
}

export class KrakenGeometry {
  readonly root = new Group();
  /** Moves the whole head. It carries the collecting arm, so the basket sinks with it. */
  readonly head = new Group();
  readonly mantle = new Group();
  readonly arms: readonly KrakenTentacle[];
  readonly collector: KrakenTentacle;
  private readonly skinTextures = createKrakenSkinTextures();
  private readonly skin = new MeshPhysicalMaterial({ color: 0xffffff, map: this.skinTextures.color, roughness: 0.6,
    bumpMap: this.skinTextures.surface, bumpScale: 0.22, roughnessMap: this.skinTextures.surface, vertexColors: true,
    clearcoat: 0.3, clearcoatRoughness: 0.45 });
  private readonly pale = new MeshStandardMaterial({ color: 0x9b9a83, roughness: 0.5,
    bumpMap: this.skinTextures.surface, bumpScale: 0.035, vertexColors: true });
  private readonly dark = new MeshStandardMaterial({ color: 0x050909, roughness: 0.25 });
  private readonly eyeball = new MeshStandardMaterial({ color: 0x8f7a3a, roughness: 0.15,
    emissive: 0xc9b248, emissiveIntensity: 0 });
  private readonly irisFibres = new MeshStandardMaterial({ roughness: 0.2, vertexColors: true,
    emissive: 0x9d8a2c, emissiveIntensity: 0 });
  private readonly shell = new MeshStandardMaterial({ color: 0x8e9189, roughness: 0.92, vertexColors: true });
  private readonly sphere = new SphereGeometry(1, 48, 32);
  private readonly sucker = this.createSucker();
  private readonly barnacle = this.createBarnacle();
  private readonly ownedGeometry: BufferGeometry[] = [this.sphere, this.sucker, this.barnacle];
  private readonly eyes: KrakenEye[] = [];
  private readonly eyeLight = new PointLight(0xd8cd68, 0, 30, 1.4);
  /** Wet points on the upper mantle, in mantle space, where water runs off. */
  private readonly runoff: Float32Array;
  private shells: InstancedMesh | null = null;

  constructor() {
    this.root.name = 'kraken-body';
    this.addSkinColors();
    this.mantle.scale.setScalar(HEAD_SCALE);
    const body = this.flesh(this.mantle, 'kraken-mantle', [...BODY_POSITION], [...BODY_SCALE], this.skin);
    body.geometry = createKrakenMantle();
    this.ownedGeometry.push(body.geometry);
    this.runoff = this.addBarnacles(body.geometry);
    this.addFace();
    this.eyeLight.position.set(0, 2.6, 7);
    this.mantle.add(this.eyeLight);
    this.head.add(this.mantle);
    this.root.add(this.head);
    this.arms = ARM_POSES.map((pose, index) => {
      const arm = new KrakenTentacle(12, 80, pose.radius, this.skin, this.sucker, this.pale);
      arm.root.name = 'kraken-arm-' + index;
      this.root.add(arm.root);
      return arm;
    });
    this.collector = new KrakenTentacle(14, 112, 0.46, this.skin, this.sucker, this.pale, 0.38);
    this.collector.root.name = 'kraken-collecting-arm';
    this.head.add(this.collector.root);
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
      // Hooked teeth line the inner rim of each cup.
      const teeth = Math.max(0, Math.sin(angle * 14)) ** 6 * rim * 0.05;
      const corrugation = 1 + Math.sin(angle * 9) * 0.045 * rim - teeth;
      profile.setXYZ(index, x * corrugation, y + Math.sin(angle * 5) * 0.006 * rim + teeth * 0.5, z * corrugation);
    }
    geometry.computeVertexNormals();
    geometry.rotateX(Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const depth = positions.getZ(index);
      const value = depth > 0.10 ? 1 : depth > 0.045 ? 0.62 : 0.18;
      colors.set([value, value * 0.9, value * 0.8], index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    return geometry;
  }

  private createBarnacle(): LatheGeometry {
    const geometry = new LatheGeometry([
      new Vector2(1, 0), new Vector2(0.92, 0.3), new Vector2(0.62, 0.78), new Vector2(0.44, 0.92),
      new Vector2(0.36, 0.82), new Vector2(0.3, 0.5), new Vector2(0, 0.46),
    ], 7);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      const value = y > 0.84 ? 1 : y < 0.55 && Math.hypot(positions.getX(index), positions.getZ(index)) < 0.4 ? 0.2 : 0.78;
      colors.set([value, value, value * 0.94], index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Crust the crown with barnacle clusters. Returns wet runoff points on the upper mantle. */
  private addBarnacles(body: BufferGeometry): Float32Array {
    const positions = body.getAttribute('position');
    const normals = body.getAttribute('normal');
    const placements: number[] = [];
    const runoff: number[] = [];
    for (let index = 0; index < positions.count; index += 7) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      if (y < 0.42) continue;
      const hash = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
      if (hash < 0.05 && runoff.length < 64 * 3) runoff.push(x, y, z);
      const cluster = Math.sin(x * 9 + 1) * Math.sin(y * 7 + 2) * Math.sin(z * 8 + 0.5);
      if (cluster > 0.3 && hash < 0.2 && placements.length < 180) placements.push(index);
    }
    const shells = new InstancedMesh(this.barnacle, this.shell, placements.length);
    shells.name = 'kraken-barnacles';
    const placement = new Object3D();
    const normal = new Vector3();
    placements.forEach((index, instance) => {
      placement.position.set(
        BODY_POSITION[0] + positions.getX(index) * BODY_SCALE[0],
        BODY_POSITION[1] + positions.getY(index) * BODY_SCALE[1],
        BODY_POSITION[2] + positions.getZ(index) * BODY_SCALE[2]);
      normal.set(normals.getX(index) / BODY_SCALE[0], normals.getY(index) / BODY_SCALE[1],
        normals.getZ(index) / BODY_SCALE[2]).normalize();
      placement.quaternion.setFromUnitVectors(UP, normal);
      const size = 0.07 + (Math.abs(Math.sin(index * 7.13)) ** 2) * 0.13;
      placement.scale.set(size, size * (0.7 + (index % 5) * 0.12), size);
      placement.position.addScaledVector(normal, -size * 0.2);
      placement.updateMatrix();
      shells.setMatrixAt(instance, placement.matrix);
    });
    this.shells = shells;
    shells.castShadow = true;
    shells.receiveShadow = true;
    this.mantle.add(shells);
    for (let index = 0; index < runoff.length; index += 3) {
      runoff[index] = BODY_POSITION[0] + runoff[index]! * BODY_SCALE[0];
      runoff[index + 1] = BODY_POSITION[1] + runoff[index + 1]! * BODY_SCALE[1];
      runoff[index + 2] = BODY_POSITION[2] + runoff[index + 2]! * BODY_SCALE[2];
    }
    return new Float32Array(runoff);
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
      this.flesh(this.mantle, 'kraken-eye', [x - side * 0.08, y, 2.01], [0.51, side > 0 ? 0.23 : 0.29, 0.18], this.eyeball);
      // A horizontal bar pupil. It dilates in the dark and closes to a slit in the lantern light.
      const pupil = this.flesh(this.mantle, 'kraken-pupil', [x - side * 0.1, y, 2.18], [0.31, 0.13, 0.025], this.dark);
      pupil.rotation.z = side * 0.16;
      const iris = this.addIris(x - side * 0.08, y, side);
      this.addEyelid(x, y, side, true);
      this.addEyelid(x, y, side, false);
      const lid = new Group();
      lid.name = 'kraken-eyelid';
      lid.position.set(x, y + 0.27, 2.0);
      lid.rotation.z = side * 0.19;
      this.flesh(lid, 'kraken-eyelid-skin', [0, -0.29, 0.02], [0.98, 0.37, 0.36], this.skin);
      this.mantle.add(lid);
      this.eyes.push({ side, lid, pupil, iris, pupilX: pupil.position.x, irisX: iris.position.x });
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
    this.addFold(points, upper ? 0.17 : 0.11, upper ? 'kraken-upper-lid' : 'kraken-lower-lid');
  }

  private addFold(points: [number, number, number][], radius: number, name: string): void {
    const curve = new CatmullRomCurve3(points.map(point => new Vector3(...point)));
    const geometry = new TubeGeometry(curve, 18, radius, 6, false);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors.set([0.6, 0.68, 0.62], index);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.ownedGeometry.push(geometry);
    const mesh = new Mesh(geometry, this.skin);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mantle.add(mesh);
  }

  private addIris(x: number, y: number, side: number): Mesh {
    const geometry = new RingGeometry(0.09, 0.38, 40, 3);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const angle = Math.atan2(positions.getY(index), positions.getX(index));
      const radius = Math.hypot(positions.getX(index), positions.getY(index));
      const shade = 0.55 + 0.2 * Math.sin(angle * 23 + side) + 0.14 * Math.cos(angle * 37);
      const rim = radius > 0.34 ? 0.25 : 1;
      // Burst vessels spread from the outer rim.
      const vessel = radius > 0.26 && Math.sin(angle * 11 + side * 2) > 0.93 ? 0.5 : 0;
      colors.set([(shade + vessel) * rim, shade * 0.86 * rim, shade * 0.3 * rim], index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.ownedGeometry.push(geometry);
    const iris = new Mesh(geometry, this.irisFibres);
    iris.name = 'kraken-iris-fibres';
    iris.position.set(x, y, 2.19);
    iris.scale.y = side > 0 ? 0.53 : 0.67;
    this.mantle.add(iris);
    return iris;
  }

  /** Write a wet point above the water in root space. Returns false when the point is under water. */
  runoffPoint(seed: number, target: Vector3): boolean {
    if (seed % 3 === 0) {
      const index = (seed * 7 % (this.runoff.length / 3)) * 3;
      target.set(this.runoff[index]!, this.runoff[index + 1]!, this.runoff[index + 2]!);
      this.mantle.localToWorld(target);
      this.root.worldToLocal(target);
    } else {
      const arm = this.arms[2 + seed % (this.arms.length - 2)]!;
      target.copy(arm.points[3 + seed % 7]!);
    }
    return target.y + this.root.position.y > 0.4;
  }

  update(time: number, revealTime: number, descent: number): void {
    const rise = krakenHeave((revealTime - KRAKEN_HEAD_RISE_START) / (KRAKEN_EMERGE_SECONDS - KRAKEN_HEAD_RISE_START));
    const stare = krakenEase((revealTime - KRAKEN_EMERGE_SECONDS) / 3);
    const roarTime = revealTime - KRAKEN_EYES_OPEN_AT;
    const roar = roarTime > 0 && roarTime < 2.6 ? Math.sin(Math.PI * roarTime / 2.6) : 0;
    this.head.position.y = -HIDDEN_DEPTH * (1 - rise) - DESCENT_DEPTH * krakenHeave(descent);
    this.head.position.z = stare * 1.4 - descent * 2;
    // Face up while rising, rear back for the roar, then loom over the boat.
    this.head.rotation.x = -0.14 * (1 - rise) - roar * 0.06 + stare * 0.1 - descent * 0.12;
    this.head.rotation.z = Math.sin(time * 0.21) * 0.015 + Math.sin(time * 0.37 + 1) * 0.035 * stare;
    this.head.rotation.y = Math.sin(time * 0.13) * 0.02;
    const breath = Math.sin(time * 1.5) * 0.02 + roar * 0.045;
    this.mantle.scale.set(HEAD_SCALE * (1 + breath), HEAD_SCALE * (1 - breath * 0.4), HEAD_SCALE * (1 + breath * 0.5));
    this.updateEyes(time, revealTime, descent);
    for (let index = 0; index < this.arms.length; index++) this.updateArm(index, time, revealTime, descent);
  }

  private updateEyes(time: number, revealTime: number, descent: number): void {
    const sinceOpen = revealTime - KRAKEN_EYES_OPEN_AT;
    const open = krakenEase(sinceOpen / KRAKEN_EYES_OPEN_SECONDS) * (1 - krakenEase((descent - 0.5) / 0.25));
    const glow = open * (1.25 + Math.sin(time * 2.3) * 0.2);
    this.eyeball.emissiveIntensity = glow * 0.35;
    this.irisFibres.emissiveIntensity = glow * 0.5;
    this.eyeLight.intensity = open * 14;
    const pupil = 0.14 - 0.1 * krakenEase((sinceOpen - 0.35) / 1.3);
    // The eyes search the deck, then lock onto the player.
    const search = 1 - krakenEase((revealTime - 6.7) / 0.5);
    for (const eye of this.eyes) {
      eye.lid.scale.y = 1 - open * 0.93;
      const look = search * Math.sin(time * 1.9 + 0.4) * 0.09 - (1 - search) * eye.side * 0.05;
      eye.pupil.position.x = eye.pupilX + look;
      eye.iris.position.x = eye.irisX + look * 0.8;
      eye.pupil.scale.y = pupil * (eye.side > 0 ? 0.8 : 1);
    }
  }

  private updateArm(index: number, time: number, revealTime: number, descent: number): void {
    const arm = this.arms[index]!;
    const pose = ARM_POSES[index]!;
    const side = Math.sign(pose.x);
    const delay = 0.06 + 0.045 * index;
    const lag = krakenHeave((descent - delay) / (1 - delay));
    if (pose.wrapsBoat) {
      this.updateSubmergedArm(arm, side, time * 0.6 + pose.phase, pose.z, lag);
      return;
    }
    const emerged = krakenHeave((revealTime - pose.emerge) / 2.6);
    const lift = -(1 - emerged + lag) * (pose.height + 8);
    // Arms thrash as they breach, then settle into slow, heavy coils.
    const thrash = 1 - krakenEase((revealTime - pose.emerge - 1.2) / 3.5) + lag * 0.6;
    const phase = time * pose.speed + pose.phase;
    const sway = Math.sin(phase) * (0.6 + thrash * 1.1);
    const flex = Math.sin(phase * 1.37 + 0.8) * (0.35 + thrash * 0.5);
    const curl = pose.curl * (1 + Math.sin(phase * 0.81 + 1.1) * 0.12);
    const sweep = Math.PI * (pose.sweep + Math.sin(phase * 0.63 + index) * 0.1);
    const x = pose.x + pose.inwardZ * sway;
    const z = pose.z - pose.inwardX * sway;
    const height = pose.height + lift;
    const baseX = side * (3.2 + index % 3 * 0.45), baseZ = 1 + index % 4 * 0.8;
    arm.points[0]!.set(baseX, -3.6, baseZ);
    arm.points[1]!.set(baseX + (x - baseX) * 0.3, -2.4 + lift * 0.25, baseZ + (z - baseZ) * 0.3);
    arm.points[2]!.set(baseX + (x - baseX) * 0.78 - pose.inwardZ * flex, pose.height * 0.35 + lift,
      baseZ + (z - baseZ) * 0.78 + pose.inwardX * flex);
    arm.points[3]!.set(x - pose.inwardX * 0.4, height - curl * 0.7 + flex,
      z - pose.inwardZ * 0.4);
    // A shrinking spiral curls each tip. A slow wave runs toward it.
    for (let point = 4; point < arm.points.length; point++) {
      const t = (point - 4) / (arm.points.length - 5);
      const angle = Math.PI - t * sweep;
      const radius = curl * (1 - t * 0.72);
      const inward = curl + Math.cos(angle) * radius;
      const wave = Math.sin(t * 4.2 - time * 1.8 + pose.phase) * (0.25 + thrash * 0.45) * (0.3 + t);
      const twist = Math.sin(t * Math.PI) * Math.sin(phase * 0.72 + t * 2.1) * 0.3 + wave;
      arm.points[point]!.set(x + pose.inwardX * inward + pose.inwardZ * twist,
        height + Math.sin(angle) * radius + flex * t + wave * 0.5,
        z + pose.inwardZ * inward - pose.inwardX * twist);
    }
    arm.update();
  }

  private updateSubmergedArm(arm: KrakenTentacle, side: number, phase: number, reach: number, lag: number): void {
    // Dive beside the bow, then curve inward beneath the hull and behind the player.
    const depth = lag * 7;
    arm.points[0]!.set(side * 3.5, -3.6 - depth, 2);
    arm.points[1]!.set(side * 7.2, -3.4 - depth, 8.5);
    arm.points[2]!.set(side * 6.4, -3.6 - depth, 14.5);
    arm.points[3]!.set(side * 4.2, -3.2 - depth, BOAT_Z - 4.5);
    for (let point = 4; point < arm.points.length; point++) {
      const t = (point - 3) / (arm.points.length - 4);
      arm.points[point]!.set(
        side * (0.7 + 3.5 * (1 - t) ** 2),
        -3.2 - depth + Math.sin(phase + t * 2) * 0.15 + t * 0.6,
        BOAT_Z - 4.5 + (reach - BOAT_Z + 4.5) * t,
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
    for (const material of [this.skin, this.pale, this.dark, this.eyeball, this.irisFibres, this.shell]) material.dispose();
    this.eyeLight.dispose();
    this.shells?.dispose();
    this.root.clear();
  }
}
