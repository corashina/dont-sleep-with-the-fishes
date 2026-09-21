import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
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
  scubaSet: (p) => p.y + jaggedEdge(p.x) + 0.08,
  flashlight: (p) => p.x + p.y * 0.18 + jaggedEdge(p.y),
  knife: (p) => p.x + p.y * 0.22 + jaggedEdge(p.y) - 0.02,
  bucket: (p) => p.x + p.y * 0.16 + jaggedEdge(p.y),
  anchor: (p) => p.y + jaggedEdge(p.x) + 0.08,
  fishingNet: (p) => p.z + jaggedEdge(p.x) - 0.03,
  umbrella: (p) => p.x + jaggedEdge(p.y),
};

const NOTCHES: Partial<Record<ItemId, readonly Cut[]>> = {
  map: [(p) => -0.20 - p.x,
    (p) => (-0.20 - p.x) * 0.18 - p.z,
    (p) => (-0.20 - p.x) * 0.18 + p.z],
  spyglass: [(p) => -0.08 - p.x, (p) => p.z - 0.22, (p) => p.y + p.x * 0.30 + 0.015],
};

function jaggedEdge(value: number): number {
  return (Math.abs(((value + 0.5) * 8) % 2 - 1) - 0.5) * 0.055;
}

function fractureSections(triangle: Vertex[], itemId: ItemId): Vertex[][] {
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
  return output;
}

function fractureAxis(itemId: ItemId): 'x' | 'y' | 'z' {
  if (itemId === 'map') return 'z';
  if (itemId === 'scubaSet' || itemId === 'anchor' || itemId === 'fishingNet') return 'x';
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
  switch (itemId) {
    case 'map':
      point.y += Math.max(0, point.x - 0.1) * Math.max(0, point.z + 0.1) * 0.55;
      point.y += Math.max(0, -point.x - 0.10) * (0.14 + Math.abs(point.z)) * 0.75;
      break;
    case 'spyglass':
      if (point.x > 0.03) point.y -= Math.max(0, point.z - 0.10) * 0.7;
      break;
    case 'umbrella':
      if (point.x < 0.08) {
        point.x = Math.min(-0.08, point.x + Math.hypot(point.y, point.z) * 0.45);
        point.y *= 0.16;
        point.z *= 0.16;
      }
      break;
  }
}

function separateFragment(point: Vector3, itemId: ItemId, side: number): void {
  if (itemId === 'spyglass' && side < 0) {
    const x = point.x;
    point.x = x * Math.cos(0.12) - point.y * Math.sin(0.12) - 0.025;
    point.y = x * Math.sin(0.12) + point.y * Math.cos(0.12) + 0.03;
  }
  if (side <= 0) return;
  if (itemId === 'fishingNet') {
    const z = point.z;
    point.z = z * Math.cos(0.24) - point.x * Math.sin(0.24) + 0.08;
    point.x = z * Math.sin(0.24) + point.x * Math.cos(0.24) + 0.08;
    return;
  }
  // Keep both pieces close enough to read as one damaged inventory item.
  const angle = itemId === 'compass' ? -0.12 : -0.28;
  const x = point.x;
  point.x = x * Math.cos(angle) - point.y * Math.sin(angle) + 0.07;
  point.y = x * Math.sin(angle) + point.y * Math.cos(angle) - 0.035;
  if (itemId === 'scubaSet' || itemId === 'anchor') point.y += 0.16;
}

function notchSections(section: Vertex[], itemId: ItemId): Vertex[][] {
  const cuts = NOTCHES[itemId];
  if (cuts === undefined) return [section];
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
  const names = Object.keys(source.attributes).filter((name) => name !== 'position' && name !== 'normal');
  const attributes = names.map((name) => source.getAttribute(name));
  const outputPositions: number[] = [];
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
        vertex.attributes.forEach((values, attribute) => outputAttributes[attribute]!.push(...values));
      }
    }
  };
  const emitFragment = (section: Vertex[]): void => {
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
      for (const section of fractureSections(triangle, itemId)) {
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
  geometry.setAttribute('position', new Float32BufferAttribute(outputPositions, 3));
  names.forEach((name, index) => geometry.setAttribute(
    name, new Float32BufferAttribute(outputAttributes[index]!, attributes[index]!.itemSize),
  ));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
