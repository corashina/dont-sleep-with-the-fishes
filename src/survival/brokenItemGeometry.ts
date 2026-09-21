import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';

type Cut = (point: Vector3) => number;
interface Vertex {
  readonly point: Vector3;
  readonly attributes: readonly number[][];
}
export type DamageSurface = 'body' | 'fabric' | 'glass' | 'none';

// Coordinates use the model's longest side as one unit, before its boat pose.
const GLASS_CRACKS: Partial<Record<ItemId, Cut>> = {
  compass: (p) => p.x + p.y * 0.28 + jaggedEdge(p.y) - 0.03,
  scubaSet: (p) => p.x + p.y * 0.25 + jaggedEdge(p.y) - 0.085,
  flashlight: (p) => p.z + p.y * 0.33 + jaggedEdge(p.y),
};

function jaggedEdge(value: number): number {
  return (Math.abs(((value + 0.5) * 8) % 2 - 1) - 0.5) * 0.055;
}

function fractureSections(triangle: Vertex[], itemId: ItemId, surface: DamageSurface): Vertex[][] {
  if (itemId !== 'map' && surface !== 'glass') return [triangle];
  const axis = itemId === 'map' ? 'x' : 'y';
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
  // The map's tear ends inside the sheet. Its two sides stay joined.
  map: [(p) => p.x - 0.02,
    (p) => 0.009 + p.x * 0.04 - (p.z + 0.1 - p.x * 0.3 - jaggedEdge(p.x)),
    (p) => 0.009 + p.x * 0.04 + (p.z + 0.1 - p.x * 0.3 - jaggedEdge(p.x))],
  // A ripped basket, a leaking side wall, and a split canopy sector.
  fishingNet: [(p) => p.x + 0.06, (p) => 0.065 - p.x,
    (p) => p.z + 0.43 + p.x * 0.4, (p) => -0.29 - p.z + p.x * 0.3],
  bucket: [(p) => p.x - 0.20, (p) => p.z - 0.04,
    (p) => p.y + 0.27, (p) => 0.16 - p.y - p.z * 0.6],
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

function deform(point: Vector3, itemId: ItemId): void {
  switch (itemId) {
    case 'map':
      point.y += Math.max(0, point.x - 0.1) * Math.max(0, point.z + 0.1) * 0.55;
      break;
    case 'spyglass':
      if (point.x > 0.03) point.y -= Math.max(0, point.z - 0.10) * 0.7;
      break;
    case 'scubaSet':
      point.y -= Math.max(0, point.x) * 0.65;
      point.z += Math.max(0, point.x) * 0.25;
      break;
    case 'anchor': point.y += Math.max(0, point.x - 0.12) * 0.8; break;
    case 'flashlight': point.y += Math.max(0, point.x - 0.18) * 0.55; break;
    case 'fishingNet': point.y -= Math.max(0, 0.09 - Math.abs(point.x)) * 0.4; break;
    case 'umbrella': bendCanopy(point); break;
    case 'bucket':
      if (point.x > 0.1) point.x -= Math.max(0, point.y + 0.3) * 0.22;
      break;
  }
}

function bendCanopy(point: Vector3): void {
  if (point.x >= -0.10 || point.y <= 0) return;
  point.x += point.y * 0.42;
  point.y *= 0.48;
}

function liftCrack(point: Vector3, itemId: ItemId): void {
  // Keep the fracture on the glass surface, clear of its original transparent face.
  if (itemId === 'flashlight') point.x += 0.002;
  else point.z += itemId === 'scubaSet' ? -0.002 : 0.002;
}

export function createBrokenGeometry(
  source: BufferGeometry,
  toUnit: Matrix4,
  itemId: ItemId,
  surface: DamageSurface,
  crackMaterialIndex: number,
): BufferGeometry {
  const position = source.getAttribute('position');
  const names = Object.keys(source.attributes).filter((name) => name !== 'position' && name !== 'normal');
  const attributes = names.map((name) => source.getAttribute(name));
  const outputPositions: number[] = [];
  const outputAttributes = names.map(() => [] as number[]);
  const fromUnit = toUnit.clone().invert();
  const crack = surface === 'glass' ? GLASS_CRACKS[itemId] : undefined;
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
  const emit = (polygon: readonly Vertex[], glassCrack = false): void => {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      for (const vertex of [polygon[0]!, polygon[index]!, polygon[index + 1]!]) {
        const point = vertex.point.clone();
        if (glassCrack) liftCrack(point, itemId);
        deform(point, itemId);
        point.applyMatrix4(fromUnit);
        outputPositions.push(point.x, point.y, point.z);
        vertex.attributes.forEach((values, attribute) => outputAttributes[attribute]!.push(...values));
      }
    }
  };
  const emitBody = (start: number, count: number): void => {
    const tears = TEARS[itemId];
    for (let offset = start; offset < start + count; offset += 3) {
      const triangle = [readVertex(offset), readVertex(offset + 1), readVertex(offset + 2)];
      for (const section of fractureSections(triangle, itemId, surface)) {
        if (itemId === 'knife') {
          emit(clip(section, (p) => p.x + p.y * 0.22 - 0.23, -1));
        } else {
          for (const polygon of tears === undefined ? [section] : outsideTear(section, tears)) emit(polygon);
        }
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
  if (crack !== undefined) {
    const start = outputPositions.length / 3;
    const count = source.index?.count ?? position.count;
    for (let offset = 0; offset < count; offset += 3) {
      const triangle = [readVertex(offset), readVertex(offset + 1), readVertex(offset + 2)];
      for (const section of fractureSections(triangle, itemId, surface)) {
        const band = clip(clip(section, (p) => crack(p) + 0.004, 1), (p) => crack(p) - 0.004, -1);
        emit(band, true);
      }
    }
    geometry.addGroup(start, outputPositions.length / 3 - start, crackMaterialIndex);
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
