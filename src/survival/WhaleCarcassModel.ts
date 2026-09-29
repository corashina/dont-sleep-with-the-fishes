import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, IcosahedronGeometry,
  LatheGeometry, Mesh, MeshStandardMaterial, TubeGeometry, Vector2, Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// A bloated humpback floats belly up. The body is built upright, then rolled over as one group.
// The roll leans the belly away from the boat, so the boat sees the eye, the pleats, and the bite.
const ROLL = Math.PI + 0.45;
const SINK = 0.12;
const AXIS_Z = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
// World down, expressed in the upright body frame. The tail sinks along it.
const DOWN = new Vector3(0, -1, 0).applyAxisAngle(AXIS_Z, -ROLL);
const LENGTH_SEGMENTS = 176;
const RING_SEGMENTS = 192;
const HEAD_Z = -3.55;
const TAIL_Z = 3.6;
const WOUND_Z = -0.15;
const WOUND_ANGLE = Math.PI + 0.3;
const BACK = new Color(0x3b474c);
const BELLY = new Color(0xd2cbbb);
const PLEAT = new Color(0x8e7672);
const SCAR = new Color(0x8f9a98);
const RAKE = new Color(0xb9beb6);
const LIP = new Color(0x1f2629);
const BLUBBER = new Color(0xdcc9ae);
const FLESH = new Color(0x7c2d2b);
const CAVITY = new Color(0x2a191d);
const FIN_PALE = new Color(0xd3d5cc);
const FIN_DARK = new Color(0x323b3e);
const PROFILE = [
  [HEAD_Z, 0.05], [-3.35, 0.46], [-3, 0.8], [-2.4, 1.03], [-1.6, 1.18], [-0.6, 1.22],
  [0.4, 1.12], [1.4, 0.86], [2.4, 0.5], [3.1, 0.28], [TAIL_Z, 0.17],
] as const;
const MOUTH_START = -3.5;
const MOUTH_END = -2.12;
const EYE_Z = -2.05;
const EYE_ANGLE = Math.PI - 0.32;

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

// The mirror of a body angle across the upright centerline.
function mirror(angle: number): number {
  return Math.PI - angle;
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

// The lip line bows down to the belly at the chin and turns up at the gape.
function mouthAngle(z: number): number {
  return Math.PI + 0.06 + 0.24 * smooth(-2.5, MOUTH_START, z) + 0.08 * smooth(-2.35, MOUTH_END, z);
}

function lineMask(distance: number, width: number): number {
  return 1 - smooth(0, width, Math.abs(distance));
}

// Knobs are z, angle, radius, height. Humpbacks carry them on the rostrum and along the jaw.
const KNOBS: (readonly [number, number, number, number])[] = [];
for (let i = 0; i < 9; i++) {
  const z = -3.36 + i * 0.13;
  const angle = mouthAngle(z) + 0.14 + (i % 2) * 0.05;
  KNOBS.push([z, angle, 0.055, 0.028], [z + 0.04, mirror(angle), 0.055, 0.028]);
}
for (let row = 0; row < 3; row++) {
  for (let i = 0; i < 6; i++) {
    const z = -3.25 + i * 0.16 + row * 0.05;
    KNOBS.push([z, Math.PI / 2 + (row - 1) * 0.13, 0.05 + (i % 3) * 0.008, 0.026]);
  }
}
for (let i = 0; i < 7; i++) {
  KNOBS.push([-3.4 + (i % 4) * 0.08, -Math.PI / 2 + (i - 3) * 0.16, 0.05, 0.024]);
}
// Swollen eyelids.
KNOBS.push([EYE_Z, EYE_ANGLE, 0.14, 0.035], [EYE_Z, mirror(EYE_ANGLE), 0.14, 0.035]);

function knobHeight(z: number, angle: number): number {
  const radius = bodyRadius(z);
  let height = 0;
  for (const [knobZ, knobAngle, size, lift] of KNOBS) {
    const dz = z - knobZ;
    if (Math.abs(dz) > size) continue;
    const across = wrapAngle(angle - knobAngle) * radius;
    const reach = (dz * dz + across * across) / (size * size);
    if (reach < 1) height += lift * (1 - reach) ** 2;
  }
  return height;
}

// Parallel rake marks from old orca attacks, near the tail stock. They heal as pale, shallow grooves.
function rakeMask(z: number, angle: number): number {
  if (z < 0.85 || z > 2.3) return 0;
  const radius = bodyRadius(z);
  const fade = smooth(0.85, 1.05, z) * (1 - smooth(2.05, 2.3, z));
  let mask = 0;
  for (let i = 0; i < 4; i++) {
    const line = Math.PI - 0.55 + i * 0.1 + (z - 0.9) * 0.11 + 0.012 * Math.sin(z * 9 + i);
    mask = Math.max(mask, lineMask(wrapAngle(angle - line) * radius, 0.03));
  }
  return mask * fade;
}

function mouthMask(z: number, angle: number): number {
  const along = smooth(MOUTH_START - 0.04, MOUTH_START + 0.06, z) * (1 - smooth(MOUTH_END - 0.03, MOUTH_END + 0.04, z));
  if (along === 0) return 0;
  const radius = bodyRadius(z);
  const line = mouthAngle(z);
  const near = lineMask(wrapAngle(angle - line) * radius, 0.03);
  const far = lineMask(wrapAngle(angle - mirror(line)) * radius, 0.03);
  return Math.max(near, far) * along;
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

function pleatGroove(z: number, angle: number): number {
  return pleatMask(z, angle) * Math.max(0, Math.cos(wrapAngle(angle + Math.PI / 2) * 22)) ** 4;
}

// The full skin surface: bloat, bite, pleats, knobs, lips, and scars. Lift pushes out along the ring.
function bodyPoint(z: number, angle: number, lift: number, target: Vector3): Vector3 {
  const distance = biteDistance(z, angle);
  const lip = Math.max(0, Math.min(1, (distance - 0.52) / 0.48));
  // Torn blubber curls out into a thick rim around the bite.
  const curl = smooth(0.84, 0.95, distance) * (1 - smooth(0.98, 1.12, distance));
  const depth = (distance < 1 ? 0.22 + 0.78 * lip * lip : 1) + 0.04 * curl;
  const radius = bodyRadius(z);
  const inward = 1 - depth * (1 - 0.035 * pleatGroove(z, angle));
  // Skin relief stays off the torn flesh.
  const skin = smooth(0.96, 1.06, distance);
  const wrinkle = 0.004 * Math.sin(z * 23 + Math.sin(angle * 7) * 1.5) * Math.sin(angle * 11 - z * 3);
  const relief = skin * (knobHeight(z, angle) + wrinkle - 0.018 * mouthMask(z, angle)
    - 0.008 * rakeMask(z, angle));
  const offset = lift + relief - radius * inward;
  outerPoint(z, angle, 0, target);
  target.x += Math.cos(angle) * offset;
  target.y += Math.sin(angle) * 0.9 * offset;
  return target;
}

function bodyColor(z: number, angle: number, target: Color): Color {
  const distance = biteDistance(z, angle);
  const belly = smooth(0.3, 0.62, -Math.sin(angle));
  target.copy(BACK).lerp(BELLY, belly).lerp(PLEAT, pleatGroove(z, angle) * 0.75);
  // Pale patches of peeled skin on the flanks and back.
  const patch = Math.sin(z * 2.3 + angle * 3.1) * Math.sin(z * 5.7 - angle * 2.2 + 1.3);
  target.lerp(SCAR, smooth(0.55, 0.8, patch) * (1 - belly) * 0.6);
  // Fine mottling breaks up the large color fields.
  const mottle = Math.sin(z * 13.1 + angle * 5.3) * Math.sin(z * 7.7 - angle * 9.1 + 0.7);
  target.multiplyScalar(0.9 + 0.06 * Math.sin(z * 7.3 + angle * 4.1) + 0.05 * mottle);
  target.lerp(RAKE, rakeMask(z, angle) * 0.85);
  target.lerp(SCAR, Math.min(1, knobHeight(z, angle) * 14) * 0.35);
  target.lerp(LIP, mouthMask(z, angle) * 0.9);
  // Vertex colors keep the torn edge smooth. Per-triangle materials cut it into teeth.
  const wound = 1 - smooth(0.97, 1.05, distance);
  if (wound > 0) {
    const r = target.r;
    const g = target.g;
    const b = target.b;
    target.copy(CAVITY).lerp(FLESH, smooth(0.4, 0.72, distance)).lerp(BLUBBER, smooth(0.84, 0.98, distance));
    target.setRGB(r + (target.r - r) * wound, g + (target.g - g) * wound, b + (target.b - b) * wound);
  }
  return target;
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
      bodyPoint(z, angle, 0, point);
      bodyColor(z, angle, color);
      positions.push(point.x, point.y, point.z);
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

// A fin section is a rounded foil: blunt at the leading edge and thin at the trailing edge.
interface FinSection {
  readonly x: number;
  readonly y: number;
  readonly lead: number;
  readonly trail: number;
  readonly thickness: number;
}

// Rings of foil sections from span 0 to span 1. The ring closes on itself, so the leading edge has no seam.
function finGeometry(stations: number, around: number, section: (span: number) => FinSection,
  paint: (span: number, chord: number, top: boolean, target: Color) => void): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  for (let row = 0; row <= stations; row++) {
    const span = row / stations;
    const { x, y, lead, trail, thickness } = section(span);
    for (let col = 0; col < around; col++) {
      const turn = col / around * Math.PI * 2;
      const chord = (1 - Math.cos(turn)) / 2;
      const foil = 2.6 * Math.sqrt(chord) * (1 - chord);
      positions.push(x, y + Math.sin(turn) * thickness * foil, lead + chord * (trail - lead));
      paint(span, chord, Math.sin(turn) > 0, color);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < stations; row++) {
    for (let col = 0; col < around; col++) {
      const a = row * around + col;
      const b = row * around + (col + 1) % around;
      indices.push(a, b, a + around, b, b + around, a + around);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const FLIPPER_LENGTH = 2.6;

// Tubercles scallop the leading edge. The blade bows down under its own weight.
function flipperSection(span: number): FinSection {
  const half = 0.3 * (1 - 0.3 * span) * Math.sqrt(1 - span ** 3);
  const middle = 0.02 + 0.52 * span ** 1.8;
  const knob = 0.04 * Math.max(0, Math.sin(span * Math.PI * 9 - 0.6)) ** 2
    * smooth(0.1, 0.25, span) * (1 - smooth(0.85, 0.97, span));
  return {
    x: span * FLIPPER_LENGTH,
    y: -0.22 * span * span,
    lead: middle - half - knob,
    trail: middle + half * 0.9,
    thickness: (0.085 + knob * 0.6) * (1 - 0.65 * span),
  };
}

// Humpback flippers are pale, with a dark saddle on top near the body.
function paintFlipper(span: number, chord: number, top: boolean, target: Color): void {
  const mottle = Math.sin(span * 17 + chord * 5) * Math.sin(span * 7 - chord * 11 + 1.7);
  const saddle = top ? (1 - smooth(0.25 + 0.12 * mottle, 0.5 + 0.12 * mottle, span)) : 0;
  target.copy(FIN_PALE).lerp(FIN_DARK, saddle * 0.85);
  // Scuffed knobs and the worn tip.
  target.lerp(SCAR, (1 - smooth(0, 0.12, chord)) * 0.3 + smooth(0.9, 1, span) * 0.3);
  target.multiplyScalar(0.94 + 0.06 * Math.sin(span * 53 + chord * 17));
}

function flukeSection(span: number): FinSection {
  const side = span * 2 - 1;
  const reach = Math.abs(side);
  const lead = -0.14 + 0.36 * reach ** 1.8;
  const chord = 0.95 * Math.sqrt(1 - reach ** 2.5);
  const notch = 0.13 * (1 - smooth(0, 0.14, reach));
  const serration = 0.035 * Math.sin(reach * 34) * smooth(0.12, 0.3, reach) * (1 - smooth(0.8, 0.95, reach));
  return {
    x: side * 2,
    y: 0,
    lead,
    trail: lead + Math.max(0, chord - notch + serration),
    thickness: 0.065 * (1 - 0.7 * reach) + 0.07 * (1 - smooth(0, 0.18, reach)),
  };
}

// The top of the flukes is dark. The underside, which now faces the sky, is white with dark trailing edges.
function paintFluke(span: number, chord: number, top: boolean, target: Color): void {
  const reach = Math.abs(span * 2 - 1);
  const spots = Math.sin(span * 29 + chord * 7) * Math.sin(span * 13 - chord * 19 + 0.4);
  const dark = top ? 1 : Math.max(smooth(0.62, 0.88, chord), smooth(0.8, 0.98, reach), smooth(0.55, 0.85, spots));
  target.copy(FIN_PALE).lerp(FIN_DARK, dark);
  target.lerp(SCAR, top ? smooth(0.6, 0.9, spots) * 0.4 : 0);
  target.multiplyScalar(0.93 + 0.07 * Math.sin(span * 41 + chord * 13));
}

// A torn chunk has dark skin, a thick blubber layer, and red meat under it.
function chunkGeometry(seed: number): BufferGeometry {
  const sphere = new IcosahedronGeometry(1, 3);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  const position = geometry.getAttribute('position');
  const colors: number[] = [];
  const point = new Vector3();
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const lump = 1 + 0.16 * Math.sin(point.x * 3.1 + seed) * Math.sin(point.z * 2.7 + seed * 1.7)
      + 0.06 * Math.sin(point.y * 7 + point.x * 5 + seed * 2.3);
    // The skin side is cut flat.
    point.multiplyScalar(lump);
    point.y = Math.min(point.y, 0.9);
    position.setXYZ(i, point.x, point.y, point.z);
    color.copy(FLESH).lerp(BLUBBER, smooth(0.15, 0.35, point.y)).lerp(FIN_DARK, smooth(0.76, 0.88, point.y));
    color.multiplyScalar(0.9 + 0.1 * Math.sin(point.x * 13 + point.z * 11 + seed));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// A barnacle is a ridged cone with a crater at the top.
function barnacleGeometry(): BufferGeometry {
  return new LatheGeometry([
    new Vector2(0, 0.2), new Vector2(0.28, 0.45), new Vector2(0.42, 0.95), new Vector2(0.5, 1),
    new Vector2(0.72, 0.72), new Vector2(0.92, 0.3), new Vector2(1, 0), new Vector2(0, 0),
  ].reverse(), 10);
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
    const dark = this.material(0x2e3639);
    this.addMesh('whale-carcass:body', bodyGeometry(), skin);
    this.addFlippers(skin);
    this.addFlukes(skin);
    this.addFace(dark);
    this.addRibs(this.material(0xd8cfba));
    this.addBarnacles(this.material(0xc4bba6), dark);
    for (let i = 0; i < 3; i++) {
      const scrap = this.addMesh(`whale-carcass:scrap-${i}`, chunkGeometry(i * 2.9 + 1), skin, this.scraps);
      scrap.scale.set(0.19 + i * 0.02, 0.14, 0.27 - i * 0.03);
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

  private material(color: number, vertexColors = false): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ color, vertexColors, roughness: 0.78 });
    this.materials.push(material);
    return material;
  }

  private addMesh(name: string, geometry: BufferGeometry, material: MeshStandardMaterial,
    parent: Group = this.body): Mesh {
    this.geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Long humpback flippers hang limp from the rolled body.
  private addFlippers(material: MeshStandardMaterial): void {
    const geometry = finGeometry(72, 28, flipperSection, paintFlipper);
    const anchor = new Vector3();
    ([['near', -1, 0.1, -0.15], ['far', 1, -0.15, 0.25]] as const).forEach(([name, side, hang, sweep]) => {
      const flipper = this.addMesh(`whale-carcass:${name}-flipper`, geometry, material);
      outerPoint(-1.55, -Math.PI / 2 + side * 0.95, -0.06, anchor);
      flipper.position.copy(anchor);
      flipper.scale.x = side;
      flipper.rotation.set(0, sweep * side, -side * hang);
    });
  }

  private addFlukes(material: MeshStandardMaterial): void {
    const flukes = this.addMesh('whale-carcass:flukes', finGeometry(96, 28, flukeSection, paintFluke), material);
    const base = TAIL_Z - 0.2;
    flukes.position.set(0, 0, base).addScaledVector(DOWN, droop(base));
    // Tip the flukes down along the sinking tail stock.
    const slope = Math.atan((droop(base + 0.8) - droop(base)) / 0.8);
    flukes.quaternion.setFromAxisAngle(AXIS_Z.clone().cross(DOWN), slope);
  }

  private line(name: string, points: Vector3[], width: number, material: MeshStandardMaterial): void {
    this.addMesh(name, new TubeGeometry(new CatmullRomCurve3(points), 32, width, 8, false), material);
  }

  private addFace(dark: MeshStandardMaterial): void {
    // The boat sees the left side of the upright whale, around angle PI. The lids bulge over the slit.
    this.line('whale-carcass:closed-eye', [-0.13, -0.04, 0.04, 0.13].map((offset, i) =>
      bodyPoint(EYE_Z + offset, EYE_ANGLE + (i === 0 || i === 3 ? -0.02 : 0.015), 0.004, new Vector3())), 0.018, dark);
  }

  // Bare ribs arch across the floor of the bite and sweep back toward the tail. One is snapped short.
  private addRibs(bone: MeshStandardMaterial): void {
    [-0.72, -0.38, -0.04, 0.3, 0.62].forEach((offset, i) => {
      const points: Vector3[] = [];
      for (let step = 0; step <= 24; step++) {
        const across = step / 24;
        const angle = WOUND_ANGLE - 0.72 + across * 1.44;
        const z = WOUND_Z + offset + 0.18 * (across - 0.5);
        if (biteDistance(z, angle) > 0.9) continue;
        points.push(bodyPoint(z, angle, 0.03 + 0.05 * Math.sin(across * Math.PI), new Vector3()));
      }
      const kept = i === 3 ? points.slice(0, Math.ceil(points.length * 0.55)) : points;
      if (kept.length > 1) this.line(`whale-carcass:rib-${i}`, kept, 0.06 - Math.abs(offset) * 0.02, bone);
    });
  }

  // Barnacle clusters crust the chin knobs, which now face the sky.
  private addBarnacles(shell: MeshStandardMaterial, dark: MeshStandardMaterial): void {
    const geometry = barnacleGeometry();
    const normal = new Vector3();
    for (let i = 0; i < 26; i++) {
      const z = -3.4 + (i % 5) * 0.14 + (i % 3) * 0.035;
      const angle = -Math.PI / 2 + (Math.floor(i / 5) - 2) * 0.22 + (i % 2) * 0.08;
      const barnacle = this.addMesh(`whale-carcass:barnacle-${i}`, geometry, i % 6 === 0 ? dark : shell);
      barnacle.position.copy(bodyPoint(z, angle, -0.004, new Vector3()));
      const size = 0.035 + (i % 4) * 0.012;
      barnacle.scale.set(size, size * 0.8, size * (1 + (i % 3) * 0.15));
      normal.set(Math.cos(angle), Math.sin(angle) * 0.9, 0).normalize();
      barnacle.quaternion.setFromUnitVectors(UP, normal);
    }
  }
}
