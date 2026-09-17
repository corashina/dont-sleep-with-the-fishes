import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';

type Cut = (point: Vector3) => number;
interface Vertex {
  readonly point: Vector3;
  readonly attributes: readonly number[][];
}

// Coordinates use the model's longest side as one unit, before its boat pose.
const FRACTURES: Partial<Record<ItemId, Cut>> = {
  compass: (p) => p.x + p.y * 0.28 + jaggedEdge(p.y) - 0.03,
  map: (p) => p.x + p.z * 0.35 + jaggedEdge(p.z) - 0.08,
  spyglass: (p) => p.z - 0.18,
  knife: (p) => p.x - 0.24,
  scubaSet: (p) => p.y + p.x * 0.25 - 0.12,
  anchor: (p) => p.x - 0.17,
  flashlight: (p) => p.x - 0.28,
};

function jaggedEdge(value: number): number {
  return (Math.abs(((value + 0.5) * 8) % 2 - 1) - 0.5) * 0.055;
}

function fractureSections(triangle: Vertex[], itemId: ItemId): Vertex[][] {
  if (itemId !== 'map' && itemId !== 'compass') return [triangle];
  const axis = itemId === 'map' ? 'z' : 'y';
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

const TEARS: Partial<Record<ItemId, readonly Cut[]>> = {
  // A ripped basket, a leaking side wall, and a split canopy sector.
  fishingNet: [(p) => p.x + 0.065, (p) => 0.065 - p.x,
    (p) => p.z + 0.43, (p) => -0.29 - p.z],
  bucket: [(p) => p.x - 0.20, (p) => p.z - 0.04,
    (p) => p.y + 0.27, (p) => 0.08 - p.y],
  umbrella: [(p) => -0.12 - p.x, (p) => p.y - 0.14,
    (p) => p.z + 0.045, (p) => 0.045 - p.z],
};

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

function outsideTear(vertices: Vertex[], cuts: readonly Cut[]): Vertex[][] {
  const output: Vertex[][] = [];
  let remainder = vertices;
  for (const cut of cuts) {
    output.push(clip(remainder, cut, -1));
    remainder = clip(remainder, cut, 1);
  }
  return output;
}

function displaceFragment(point: Vector3, itemId: ItemId): void {
  switch (itemId) {
    case 'compass': point.x += 0.022; point.z += 0.009; break;
    case 'map':
      point.x += 0.045;
      point.y += 0.003 + Math.max(0, point.x) * 0.035;
      break;
    case 'spyglass': point.y -= 0.025 + (point.z - 0.18) * 0.38; point.z += 0.022; break;
    case 'knife': point.z += 0.02 + (point.x - 0.24) * 0.45; point.x += 0.025; break;
    case 'scubaSet': point.x += 0.04 + (point.y - 0.12) * 0.20; point.y += 0.018; break;
    case 'anchor': point.y += 0.035 + (point.x - 0.17) * 0.5; point.x += 0.028; break;
    case 'flashlight': point.y += 0.025 + (point.x - 0.28) * 0.45; point.x += 0.025; break;
  }
}

function deform(point: Vector3, itemId: ItemId): void {
  if (itemId === 'umbrella' && point.x < -0.10 && point.y > 0) {
    // Fold the damaged ribs toward the shaft, leaving the opposite canopy intact.
    point.x += point.y * 0.42;
    point.y *= 0.48;
  }
  if (itemId === 'bucket' && point.x > 0.1) {
    point.x -= Math.max(0, point.y + 0.3) * 0.22;
  }
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
  const fracture = FRACTURES[itemId];
  const tears = TEARS[itemId];
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
  const emit = (polygon: readonly Vertex[], separated: boolean): void => {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      for (const vertex of [polygon[0]!, polygon[index]!, polygon[index + 1]!]) {
        const point = vertex.point.clone();
        if (separated) displaceFragment(point, itemId);
        deform(point, itemId);
        point.applyMatrix4(fromUnit);
        outputPositions.push(point.x, point.y, point.z);
        vertex.attributes.forEach((values, attribute) => outputAttributes[attribute]!.push(...values));
      }
    }
  };
  const groups = source.groups.length > 0 ? source.groups : [{
    start: 0, count: source.index?.count ?? position.count, materialIndex: 0,
  }];
  for (const group of groups) {
    const start = outputPositions.length / 3;
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const triangle = [readVertex(offset), readVertex(offset + 1), readVertex(offset + 2)];
      if (fracture !== undefined) {
        for (const section of fractureSections(triangle, itemId)) {
          emit(clip(section, fracture, -1), false);
          emit(clip(section, fracture, 1), true);
        }
      } else {
        for (const polygon of tears === undefined ? [triangle] : outsideTear(triangle, tears)) {
          emit(polygon, false);
        }
      }
    }
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
