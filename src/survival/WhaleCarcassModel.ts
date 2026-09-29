import {
  BufferGeometry, CatmullRomCurve3, Color, ExtrudeGeometry, Float32BufferAttribute,
  Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry, TubeGeometry, Vector3,
} from 'three';

// A bloated humpback floats belly up. The body is built upright, then rolled over as one group.
// The roll leans the belly away from the boat, so the boat sees the eye, the pleats, and the bite.
const ROLL = Math.PI + 0.45;
const SINK = 0.12;
const AXIS_Z = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
// World down, expressed in the upright body frame. The tail sinks along it.
const DOWN = new Vector3(0, -1, 0).applyAxisAngle(AXIS_Z, -ROLL);
const LENGTH_SEGMENTS = 96;
const RING_SEGMENTS = 128;
const HEAD_Z = -3.55;
const TAIL_Z = 3.6;
const WOUND_Z = -0.15;
const WOUND_ANGLE = Math.PI + 0.3;
const BACK = new Color(0x3b474c);
const BELLY = new Color(0xd2cbbb);
const PLEAT = new Color(0x8e7672);
const SCAR = new Color(0x8f9a98);
const BLUBBER = new Color(0xdcc9ae);
const FLESH = new Color(0x7c2d2b);
const CAVITY = new Color(0x2a191d);
const PROFILE = [
  [HEAD_Z, 0.05], [-3.35, 0.46], [-3, 0.8], [-2.4, 1.03], [-1.6, 1.18], [-0.6, 1.22],
  [0.4, 1.12], [1.4, 0.86], [2.4, 0.5], [3.1, 0.28], [TAIL_Z, 0.17],
] as const;

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bodyRadius(z: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [end, radius] = PROFILE[i]!;
    if (z > end) continue;
    const [start, previous] = PROFILE[i - 1]!;
    return previous + (radius - previous) * smooth(start, end, z);
  }
  return PROFILE[PROFILE.length - 1]![1];
}

function droop(z: number): number {
  return 0.5 * smooth(0.6, TAIL_Z + 0.8, z);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// Gas swells the belly between the throat and the tail stock.
function bloat(z: number, angle: number): number {
  return 1 + 0.13 * Math.max(0, -Math.sin(angle)) * smooth(-2.8, -1.4, z) * (1 - smooth(0.6, 2.2, z));
}

// Throat pleats run from the chin to the navel, across the belly.
function pleatMask(z: number, angle: number): number {
  const fromBelly = Math.abs(wrapAngle(angle + Math.PI / 2));
  return (1 - smooth(0.85, 1.25, fromBelly)) * smooth(-3.45, -3.1, z) * (1 - smooth(-1.1, -0.1, z));
}

function outerPoint(z: number, angle: number, lift: number, target: Vector3): Vector3 {
  const radius = bodyRadius(z) * bloat(z, angle) + lift;
  // The rostrum is flat on top.
  const height = 0.9 - 0.18 * (1 - smooth(-2.6, -1.6, z)) * Math.max(0, Math.sin(angle));
  return target.set(Math.cos(angle) * radius, Math.sin(angle) * radius * height, z)
    .addScaledVector(DOWN, droop(z));
}

function biteDistance(z: number, angle: number): number {
  const u = (z - WOUND_Z) / 1.35;
  const v = wrapAngle(angle - WOUND_ANGLE) / 0.72;
  const edge = Math.atan2(v, u);
  // Uneven lobes read as torn blubber, not as a row of teeth.
  // The lobes fade toward the middle, so the bowl stays smooth.
  const radius = Math.hypot(u, v);
  const rim = 0.08 * Math.sin(3 * edge + 0.6) + 0.045 * Math.sin(5 * edge + 2.1)
    + 0.025 * Math.sin(8 * edge + 4);
  return radius / (1 + rim * smooth(0.55, 0.95, radius));
}

function bodyGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const point = new Vector3();
  const color = new Color();
  for (let row = 0; row <= LENGTH_SEGMENTS; row++) {
    const z = HEAD_Z + row / LENGTH_SEGMENTS * (TAIL_Z - HEAD_Z);
    for (let col = 0; col <= RING_SEGMENTS; col++) {
      const angle = col / RING_SEGMENTS * Math.PI * 2;
      const distance = biteDistance(z, angle);
      const lip = Math.max(0, Math.min(1, (distance - 0.52) / 0.48));
      // Torn blubber curls out into a thick rim around the bite.
      const curl = smooth(0.84, 0.95, distance) * (1 - smooth(0.98, 1.12, distance));
      const depth = (distance < 1 ? 0.22 + 0.78 * lip * lip : 1) + 0.04 * curl;
      const pleats = pleatMask(z, angle);
      const groove = pleats * Math.max(0, Math.cos(wrapAngle(angle + Math.PI / 2) * 22)) ** 4;
      outerPoint(z, angle, 0, point);
      const inward = 1 - depth * (1 - 0.035 * groove);
      point.x -= Math.cos(angle) * bodyRadius(z) * inward;
      point.y -= Math.sin(angle) * bodyRadius(z) * 0.9 * inward;
      positions.push(point.x, point.y, point.z);
      const belly = smooth(0.3, 0.62, -Math.sin(angle));
      color.copy(BACK).lerp(BELLY, belly).lerp(PLEAT, groove * 0.75);
      // Pale patches of peeled skin on the flanks and back.
      const patch = Math.sin(z * 2.3 + angle * 3.1) * Math.sin(z * 5.7 - angle * 2.2 + 1.3);
      color.lerp(SCAR, smooth(0.55, 0.8, patch) * (1 - belly) * 0.6);
      color.multiplyScalar(0.93 + 0.07 * Math.sin(z * 7.3 + angle * 4.1));
      // Vertex colors keep the torn edge smooth. Per-triangle materials cut it into teeth.
      if (distance < 1) {
        color.copy(CAVITY).lerp(FLESH, smooth(0.4, 0.72, distance))
          .lerp(BLUBBER, smooth(0.84, 0.98, distance));
      }
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < LENGTH_SEGMENTS; row++) {
    for (let col = 0; col < RING_SEGMENTS; col++) {
      const a = row * (RING_SEGMENTS + 1) + col;
      const b = a + RING_SEGMENTS + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class WhaleCarcassModel {
  readonly root = new Group();
  readonly scraps = new Group();
  private readonly body = new Group();
  private readonly scrapsHome = new Vector3();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials: MeshStandardMaterial[] = [];
  private disposed = false;

  constructor() {
    this.root.name = 'whale-carcass:model';
    this.scraps.name = 'whale-carcass:scraps';
    this.body.name = 'whale-carcass:rolled-body';
    this.body.rotation.z = ROLL;
    this.body.position.y = -SINK;
    this.root.add(this.body);
    const skin = this.material(0xffffff, true);
    const flesh = this.material(0x7c2d2b);
    const fin = this.material(0xa9b0ad);
    const dark = this.material(0x2e3639);
    const shell = this.material(0xc4bba6);
    this.addMesh('whale-carcass:body', bodyGeometry(), skin);
    this.addFlippers(fin);
    this.addFlukes(dark);
    this.addFace(dark);
    this.addScars(this.material(0xb3b8b2));
    this.addBarnacles(shell, dark);
    for (let i = 0; i < 3; i++) {
      const scrap = this.addMesh(`whale-carcass:scrap-${i}`, new SphereGeometry(1, 7, 5), flesh, this.scraps);
      scrap.scale.set(0.19 + i * 0.02, 0.09, 0.27 - i * 0.03);
      scrap.position.set((i - 1) * 0.29, i * 0.04, (i % 2) * 0.22);
      scrap.rotation.set(i * 0.3, i * 0.8, i * 0.2);
    }
    // The scraps rest on the upper lip of the bite.
    outerPoint(WOUND_Z + 0.1, WOUND_ANGLE + 0.62, 0.02, this.scrapsHome)
      .applyAxisAngle(AXIS_Z, ROLL).add(this.body.position);
    this.resetScraps();
  }

  resetScraps(): void {
    this.root.add(this.scraps);
    this.scraps.position.copy(this.scrapsHome);
    this.scraps.quaternion.identity();
    this.scraps.scale.setScalar(1);
    this.scraps.visible = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.scraps.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  // Only the dense, vertex-colored body shades smooth. Flat facets would saw its torn edge into teeth.
  private material(color: number, vertexColors = false): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, vertexColors, roughness: 0.78, flatShading: !vertexColors });
    this.materials.push(material);
    return material;
  }

  private addMesh(name: string, geometry: BufferGeometry,
    material: MeshStandardMaterial | MeshStandardMaterial[], parent: Group = this.body): Mesh {
    this.geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Outline points are x, z pairs on a flat plate.
  private plate(name: string, points: readonly (readonly [number, number])[], thickness: number,
    material: MeshStandardMaterial): Mesh {
    const shape = new Shape();
    shape.moveTo(...points[0]!);
    points.slice(1).forEach(point => shape.lineTo(...point));
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.6,
      bevelSize: thickness * 0.6, bevelSegments: 1, steps: 1,
    });
    geometry.translate(0, 0, -thickness / 2);
    geometry.rotateX(Math.PI / 2);
    return this.addMesh(name, geometry, material);
  }

  // Long humpback flippers with knobbed leading edges. They hang limp from the rolled body.
  private addFlippers(material: MeshStandardMaterial): void {
    const outline = [
      [0, -0.28], [0.45, -0.3], [0.8, -0.23], [0.95, -0.24], [1.3, -0.12], [1.45, -0.12],
      [1.85, 0.06], [2, 0.08], [2.4, 0.3], [2.58, 0.5], [2.48, 0.62], [1.6, 0.42],
      [0.8, 0.3], [0, 0.32],
    ] as const;
    const anchor = new Vector3();
    ([['near', -1, 0.1, -0.15], ['far', 1, -0.15, 0.25]] as const).forEach(([name, side, hang, sweep]) => {
      const flipper = this.plate(`whale-carcass:${name}-flipper`, outline, 0.07, material);
      outerPoint(-1.55, -Math.PI / 2 + side * 0.95, -0.06, anchor);
      flipper.position.copy(anchor);
      flipper.scale.x = side;
      flipper.rotation.set(0, sweep * side, -side * hang);
    });
  }

  private addFlukes(material: MeshStandardMaterial): void {
    const flukes = this.plate('whale-carcass:flukes', [
      [0, -0.15], [0.55, 0.2], [1.5, 0.28], [1.95, 0.12], [1.72, 0.48], [1.45, 0.58], [1.3, 0.72],
      [0.95, 0.76], [0.7, 0.9], [0.32, 0.86], [0, 0.72], [-0.34, 0.9], [-0.72, 0.84], [-1, 0.96],
      [-1.4, 0.74], [-1.78, 0.56], [-2, 0.1], [-1.52, 0.3], [-0.56, 0.22],
    ], 0.06, material);
    const base = TAIL_Z - 0.2;
    flukes.position.set(0, 0, base).addScaledVector(DOWN, droop(base));
    // Tip the flukes down along the sinking tail stock.
    const slope = Math.atan((droop(base + 0.8) - droop(base)) / 0.8);
    flukes.quaternion.setFromAxisAngle(AXIS_Z.clone().cross(DOWN), slope);
  }

  private line(name: string, points: Vector3[], width: number, material: MeshStandardMaterial): void {
    this.addMesh(name, new TubeGeometry(new CatmullRomCurve3(points), 20, width, 5, false), material);
  }

  private surface(z: number, angle: number, lift = 0.012): Vector3 {
    return outerPoint(z, angle, lift, new Vector3());
  }

  private addFace(dark: MeshStandardMaterial): void {
    // The boat sees the left side of the upright whale, around angle PI.
    this.line('whale-carcass:closed-eye', [
      this.surface(-2.18, Math.PI - 0.34), this.surface(-2.05, Math.PI - 0.3), this.surface(-1.92, Math.PI - 0.34),
    ], 0.03, dark);
    this.line('whale-carcass:mouth', [
      this.surface(-3.5, Math.PI + 0.3), this.surface(-3.2, Math.PI + 0.22), this.surface(-2.8, Math.PI + 0.12),
      this.surface(-2.35, Math.PI + 0.06), this.surface(-2.12, Math.PI + 0.14),
    ], 0.028, dark);
  }

  // Parallel rake marks from old orca attacks, near the tail stock.
  private addScars(material: MeshStandardMaterial): void {
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI - 0.55 + i * 0.1;
      const points = [0.9, 1.35, 1.8, 2.2].map((z, j) => this.surface(z, angle + j * 0.05, 0.006));
      this.line(`whale-carcass:rake-scar-${i}`, points, 0.016, material);
    }
  }

  // Barnacle clusters and tubercles crust the chin, which now faces the sky.
  private addBarnacles(shell: MeshStandardMaterial, dark: MeshStandardMaterial): void {
    const geometry = new SphereGeometry(1, 6, 4);
    const normal = new Vector3();
    for (let i = 0; i < 16; i++) {
      const z = -3.38 + (i % 4) * 0.2 + (i % 3) * 0.04;
      const angle = -Math.PI / 2 + (Math.floor(i / 4) - 1.5) * 0.28 + (i % 2) * 0.07;
      const barnacle = this.addMesh(`whale-carcass:barnacle-${i}`, geometry, i % 5 === 0 ? dark : shell);
      barnacle.position.copy(this.surface(z, angle, 0));
      barnacle.scale.set(0.05 + (i % 3) * 0.015, 0.035, 0.05 + (i % 2) * 0.02);
      normal.set(Math.cos(angle), Math.sin(angle), 0);
      barnacle.quaternion.setFromUnitVectors(UP, normal);
    }
  }
}
