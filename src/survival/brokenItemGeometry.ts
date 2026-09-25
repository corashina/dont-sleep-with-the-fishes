import { BufferGeometry, Float32BufferAttribute, Matrix4, Uint8BufferAttribute, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';

type Cut = (point: Vector3) => number;
interface Vertex {
  readonly point: Vector3;
  readonly attributes: readonly number[][];
}
// Coordinates use the model's longest side as one unit, before its boat pose.
const BREAKS: Partial<Record<ItemId, Cut>> = {
  compass: (p) => p.x + p.y * 0.28 + jaggedEdge(p.y) - 0.03,
  map: (p) => p.x + jaggedEdge(p.z) - 0.08,
  spyglass: (p) => p.x + jaggedEdge(p.y),
  flashlight: (p) => p.x + p.y * 0.18 + jaggedEdge(p.y),
  knife: (p) => p.x + p.y * 0.22 + jaggedEdge(p.y) - 0.02,
  anchor: (p) => p.y + jaggedEdge(p.x),
};

const NOTCHES: Partial<Record<ItemId, readonly Cut[]>> = {
  map: [(p) => -0.20 - p.x,
    (p) => (-0.20 - p.x) * 0.18 - p.z,
    (p) => (-0.20 - p.x) * 0.18 + p.z],
  spyglass: [(p) => -0.08 - p.x, (p) => p.y + p.x * 0.30 + 0.08],
  flashlight: [(p) => p.x - 0.30, (p) => p.y - 0.035, (p) => p.z + 0.04],
};

function canopyHole(points: readonly (readonly [number, number])[]): readonly Cut[] {
  return points.map(([y, z], index) => {
    const [nextY, nextZ] = points[(index + 1) % points.length]!;
    return (p: Vector3) => (nextY - y) * (p.z - z) - (nextZ - z) * (p.y - y);
  });
}

const CANOPY_TEARS: readonly (readonly Cut[])[] = [
  canopyHole([[0.14, -0.15], [0.22, -0.21], [0.32, -0.12], [0.28, -0.03], [0.17, -0.05]]),
  canopyHole([[-0.30, -0.20], [-0.20, -0.27], [-0.12, -0.18], [-0.15, -0.07], [-0.27, -0.10]]),
  canopyHole([[0.10, 0.14], [0.18, 0.10], [0.27, 0.17], [0.23, 0.27], [0.13, 0.23]]),
  canopyHole([[-0.32, 0.11], [-0.23, 0.05], [-0.14, 0.12], [-0.18, 0.22], [-0.28, 0.24]]),
  canopyHole([[-0.08, -0.34], [0.01, -0.39], [0.10, -0.30], [0.04, -0.23], [-0.05, -0.25]]),
  [(p) => p.z - 0.13, (p) => (p.z - 0.13) * 0.65 - p.y,
    (p) => (p.z - 0.13) * 0.65 + p.y],
];

// Damage enters only the front wall. The opposite wall remains visible inside each puncture.
const SCUBA_DAMAGE: readonly (readonly Cut[])[] = ([
  [[-0.156, -0.200], [-0.048, -0.326], [0.108, -0.266], [0.228, -0.098], [0.132, 0.052], [-0.084, 0.028]],
  [[-0.048, -0.296], [-0.012, -0.488], [0.078, -0.248]],
  [[-0.1675, 0.031], [-0.0355, -0.077], [0.0905, 0.067], [0.0425, 0.259], [-0.1015, 0.211]],
  [[0.012, -0.110], [0.017, -0.107], [-0.002, -0.068], [-0.006, -0.070]],
  [[-0.006, -0.070], [-0.002, -0.071], [0.009, -0.041], [0.006, -0.039]],
  [[0.006, -0.041], [0.009, -0.039], [-0.010, 0.002]],
  [[-0.048, 0.108], [-0.044, 0.110], [-0.053, 0.154]],
] as const).map((points) => [(p: Vector3) => p.z - 0.02, ...points.map(([x, y], index) => {
  const [nextX, nextY] = points[(index + 1) % points.length]!;
  return (p: Vector3) => (nextX - x) * (p.y - y) - (nextY - y) * (p.x - x);
})]);

function scubaRims(polygon: readonly Vertex[]): Vertex[][] {
  const rims: Vertex[][] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const middle = a.point.clone().lerp(b.point, 0.5);
    const opening = SCUBA_DAMAGE.findIndex((cuts) => cuts.every((cut) => cut(middle) >= -0.0000001)
      && cuts.some((cut) => Math.abs(cut(a.point)) < 0.0000001 && Math.abs(cut(b.point)) < 0.0000001));
    if (opening < 0) continue;
    const edge = SCUBA_DAMAGE[opening]!.find((cut) => (
      Math.abs(cut(a.point)) < 0.0000001 && Math.abs(cut(b.point)) < 0.0000001
    ))!;
    const inset = new Vector3(edge(middle.clone().add(new Vector3(1, 0, 0))) - edge(middle),
      edge(middle.clone().add(new Vector3(0, 1, 0))) - edge(middle), 0)
      .normalize().multiplyScalar(opening < 3 ? 0.003 : 0.0007);
    inset.z = -0.006;
    const inner = (vertex: Vertex): Vertex => ({
      point: vertex.point.clone().add(inset), attributes: vertex.attributes,
    });
    rims.push([a, b, inner(b), inner(a)]);
  }
  return rims;
}

function bucketOpening(points: readonly (readonly [number, number])[], side: number): readonly Cut[] {
  return [
    (p) => p.z * side - 0.18,
    ...points.map(([x, y], index) => {
      const [nextX, nextY] = points[(index + 1) % points.length]!;
      return (p: Vector3) => (nextX - x) * (p.y - y) - (nextY - y) * (p.x - x);
    }),
  ];
}

// Local punctures and tapered rim cracks leave the shell, bottom, and handle in place.
const BUCKET_OPENINGS: readonly (readonly Cut[])[] = [
  bucketOpening([[-0.020, -0.270], [0.130, -0.365], [0.300, -0.275], [0.335, -0.130], [0.210, -0.045], [0.035, -0.038], [-0.055, -0.150]], 1),
  bucketOpening([[-0.320, -0.260], [-0.210, -0.330], [-0.090, -0.250], [-0.073, -0.100], [-0.180, -0.042], [-0.320, -0.065], [-0.355, -0.170]], 1),
  bucketOpening([[-0.260, -0.250], [-0.110, -0.350], [0.130, -0.270], [0.230, -0.080], [0.150, 0.100], [-0.080, 0.120], [-0.290, -0.035]], -1),
  bucketOpening([[-0.14, 0.15], [-0.09, 0.27], [-0.12, 0.27]], 1),
  bucketOpening([[-0.12, 0.27], [-0.09, 0.27], [-0.10, 0.46], [-0.15, 0.46]], 1),
  bucketOpening([[0.15, 0.09], [0.20, 0.24], [0.17, 0.24]], -1),
  bucketOpening([[0.17, 0.24], [0.20, 0.24], [0.23, 0.46], [0.18, 0.46]], -1),
];

// Broad tears open the weave while the rim stays intact.
const NET_TEARS: readonly (readonly Cut[])[] = [
  [-0.035, -0.34, 0.090, 0.078],
  [0.052, -0.435, 0.050, 0.055],
].map(([x, z, width, depth]) => [
  (p: Vector3) => 1 - (p.x - x!) / width! - (p.z - z!) / depth!,
  (p: Vector3) => 1 + (p.x - x!) / width! - (p.z - z!) / depth!,
  (p: Vector3) => 1 - (p.x - x!) / width! + (p.z - z!) / depth!,
  (p: Vector3) => 1 + (p.x - x!) / width! + (p.z - z!) / depth!,
]);

function jaggedEdge(value: number): number {
  return (Math.abs(((value + 0.5) * 8) % 2 - 1) - 0.5) * 0.055;
}

function fractureSections(triangle: Vertex[], itemId: ItemId): Vertex[][] {
  if (itemId === 'fishingNet') {
    const sections: Vertex[][] = [];
    let remainder = triangle;
    for (const boundary of [-0.10, 0, 0.10, 0.20]) {
      const cut: Cut = (point) => point.z - boundary;
      sections.push(clip(remainder, cut, -1));
      remainder = clip(remainder, cut, 1);
    }
    sections.push(remainder);
    return sections;
  }
  if (itemId === 'scubaSet') return [triangle];
  if (itemId === 'umbrella') {
    // Shared bend planes keep the shaft continuous, including long source triangles.
    const sections: Vertex[][] = [];
    let remainder = triangle;
    for (const boundary of [-0.02, 0.12, 0.26]) {
      const cut: Cut = (point) => point.x - boundary;
      sections.push(clip(remainder, cut, -1));
      remainder = clip(remainder, cut, 1);
    }
    sections.push(remainder);
    return sections;
  }
  const axis = fractureAxis(itemId);
  const output: Vertex[][] = [];
  let remainder = triangle;
  // Split at each tooth before clipping, so even a two-triangle map has torn edges.
  for (let boundary = -0.375; boundary < 0.5; boundary += 0.125) {
    const cut: Cut = (point) => point[axis] - boundary;
    output.push(clip(remainder, cut, -1));
    remainder = clip(remainder, cut, 1);
  }
  output.push(remainder);
  if (itemId !== 'map') return output;
  // Both paper surfaces must share each fold boundary before triangulation.
  return output.flatMap((section) => {
    const left: Cut = (p) => p.x + 0.10;
    const right: Cut = (p) => p.x - 0.10;
    const middle = clip(section, left, 1);
    return [clip(section, left, -1), clip(middle, right, -1), clip(middle, right, 1)];
  });
}

function fractureAxis(itemId: ItemId): 'x' | 'y' | 'z' {
  if (itemId === 'map') return 'z';
  if (itemId === 'anchor') return 'x';
  return 'y';
}

function interpolate(a: Vertex, b: Vertex, t: number): Vertex {
  return {
    point: a.point.clone().lerp(b.point, t),
    attributes: a.attributes.map((values, index) => values.map(
      (value, component) => value + (b.attributes[index]![component]! - value) * t,
    )),
  };
}

function clip(vertices: readonly Vertex[], cut: Cut, side: number): Vertex[] {
  const output: Vertex[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    const da = cut(a.point) * side;
    const db = cut(b.point) * side;
    if (da >= 0) output.push(a);
    if ((da < 0) !== (db < 0)) output.push(interpolate(a, b, da / (da - db)));
  }
  return output;
}

function deform(point: Vector3, itemId: ItemId): void {
  if (itemId === 'fishingNet') {
    // Bend the connected shaft sideways. Its rim contact and grip stay in place.
    const z = point.z;
    if (z > -0.10 && z < 0) point.x += (z + 0.10) * 0.6;
    else if (z >= 0 && z < 0.10) point.x += 0.06 - z * 1.2;
    else if (z >= 0.10 && z < 0.20) point.x += -0.06 + (z - 0.10) * 0.6;
    return;
  }
  if (itemId === 'umbrella') {
    // Two opposing bends retain the shaft's centerline length and attached grip.
    const first = Math.min(0.14, Math.max(0, point.x + 0.02));
    const second = Math.min(0.14, Math.max(0, point.x - 0.12));
    const angle = Math.PI / 6;
    point.x += (first + second) * (Math.cos(angle) - 1);
    point.z += (first - second) * Math.sin(angle);
    return;
  }
  if (itemId !== 'map') return;
  point.y += Math.max(0, point.x - 0.10) * 0.12;
  point.y += Math.max(0, -point.x - 0.10) * 0.18;
}

function separateFragment(point: Vector3, itemId: ItemId, side: number): void {
  if (side <= 0) return;
  if (itemId === 'anchor') {
    const angle = -35 * Math.PI / 180;
    const x = point.x;
    point.x = x * Math.cos(angle) - point.y * Math.sin(angle) + 0.22;
    point.y = x * Math.sin(angle) + point.y * Math.cos(angle) + 0.08;
    // Separate across the model plane so both silhouettes remain visible in the boat.
    point.z += 0.8;
    return;
  }
  if (['spyglass', 'flashlight'].includes(itemId)) {
    point.x += 0.15;
    return;
  }
  if (itemId !== 'compass' && itemId !== 'knife') {
    point.x += 0.07;
    return;
  }
  // Keep both pieces close enough to read as one damaged inventory item.
  const angle = itemId === 'compass' ? -0.12 : -0.28;
  const x = point.x;
  point.x = x * Math.cos(angle) - point.y * Math.sin(angle) + 0.07;
  point.y = x * Math.sin(angle) + point.y * Math.cos(angle) - 0.035;
}

function notchSections(section: Vertex[], itemId: ItemId): Vertex[][] {
  if (itemId === 'scubaSet') {
    return SCUBA_DAMAGE.reduce<Vertex[][]>((sections, cuts) => (
      sections.flatMap((part) => subtractCuts(part, cuts)).filter((part) => part.length >= 3)
    ), [section]);
  }
  const cuts = NOTCHES[itemId];
  if (cuts === undefined) return [section];
  return subtractCuts(section, cuts);
}

function canopySections(triangle: Vertex[]): Vertex[][] {
  const a = triangle[0]!.point;
  const area = triangle[1]!.point.clone().sub(a).cross(triangle[2]!.point.clone().sub(a)).length() / 2;
  // Broad fabric panels can tear. Thin ribs and the handle stay intact.
  let sections = [triangle];
  if (area > 0.002 && triangle.every(({ point }) => point.x < -0.04)) {
    for (const cuts of CANOPY_TEARS) sections = sections.flatMap((section) => subtractCuts(section, cuts));
  }
  return sections;
}

function subtractCuts(section: Vertex[], cuts: readonly Cut[]): Vertex[][] {
  const output: Vertex[][] = [];
  let remainder = section;
  for (const cut of cuts) {
    output.push(clip(remainder, cut, -1));
    remainder = clip(remainder, cut, 1);
  }
  return output;
}

export function createBrokenGeometry(
  source: BufferGeometry,
  toUnit: Matrix4,
  itemId: ItemId,
): BufferGeometry {
  const position = source.getAttribute('position');
  // Only the bowl's weave extends below the model center. The rim and shaft stay above it.
  if (itemId === 'fishingNet') source.computeBoundingBox();
  const isNetWeave = itemId === 'fishingNet' && source.boundingBox!.clone().applyMatrix4(toUnit).min.y < 0;
  const names = Object.keys(source.attributes).filter((name) => name !== 'position' && name !== 'normal');
  const attributes = names.map((name) => source.getAttribute(name));
  const outputPositions: number[] = [];
  const outputFragments: number[] = [];
  const rims: Vertex[][] = [];
  const outputAttributes = names.map(() => [] as number[]);
  const fromUnit = toUnit.clone().invert();
  const fracture = BREAKS[itemId];
  const geometry = new BufferGeometry();
  const readVertex = (offset: number): Vertex => {
    const index = source.index?.getX(offset) ?? offset;
    return {
      point: new Vector3().fromBufferAttribute(position, index).applyMatrix4(toUnit),
      attributes: attributes.map((attribute) => Array.from(
        { length: attribute.itemSize }, (_, component) => attribute.getComponent(index, component),
      )),
    };
  };
  const emit = (polygon: readonly Vertex[], fragmentSide = 0): void => {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      for (const vertex of [polygon[0]!, polygon[index]!, polygon[index + 1]!]) {
        const point = vertex.point.clone();
        deform(point, itemId);
        separateFragment(point, itemId, fragmentSide);
        point.applyMatrix4(fromUnit);
        outputPositions.push(point.x, point.y, point.z);
        outputFragments.push(fragmentSide > 0 ? 1 : 0);
        vertex.attributes.forEach((values, attribute) => outputAttributes[attribute]!.push(...values));
      }
    }
  };
  const emitFragment = (section: Vertex[]): void => {
    if (itemId === 'scubaSet') rims.push(...scubaRims(section));
    if (fracture === undefined) {
      emit(section);
      return;
    }
    emit(clip(section, (p) => fracture(p) + 0.018, -1), -1);
    emit(clip(section, (p) => fracture(p) - 0.018, 1), 1);
  };
  const emitBody = (start: number, count: number): void => {
    for (let offset = start; offset < start + count; offset += 3) {
      const triangle = [readVertex(offset), readVertex(offset + 1), readVertex(offset + 2)];
      let sections = [triangle];
      if (isNetWeave) {
        for (const cuts of NET_TEARS) sections = sections.flatMap((section) => subtractCuts(section, cuts));
      }
      if (itemId === 'bucket') {
        for (const cuts of BUCKET_OPENINGS) {
          sections = sections.flatMap((section) => subtractCuts(section, cuts)).filter((section) => section.length >= 3);
        }
        for (const section of sections) emit(section);
        continue;
      }
      if (itemId === 'umbrella') {
        sections = canopySections(triangle);
      }
      for (const section of sections.flatMap((part) => fractureSections(part, itemId))) {
        for (const notched of notchSections(section, itemId)) emitFragment(notched);
      }
    }
  };
  const groups = source.groups.length > 0 ? source.groups : [{
    start: 0, count: source.index?.count ?? position.count, materialIndex: 0,
  }];
  for (const group of groups) {
    const start = outputPositions.length / 3;
    emitBody(group.start, group.count);
    geometry.addGroup(start, outputPositions.length / 3 - start, group.materialIndex);
  }
  if (rims.length > 0) {
    const start = outputPositions.length / 3;
    for (const rim of rims) emit(rim);
    geometry.addGroup(start, outputPositions.length / 3 - start,
      Math.max(...groups.map((group) => group.materialIndex ?? 0)) + 1);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(outputPositions, 3));
  geometry.setAttribute('damageFragment', new Uint8BufferAttribute(outputFragments, 1));
  names.forEach((name, index) => geometry.setAttribute(
    name, new Float32BufferAttribute(outputAttributes[index]!, attributes[index]!.itemSize),
  ));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
