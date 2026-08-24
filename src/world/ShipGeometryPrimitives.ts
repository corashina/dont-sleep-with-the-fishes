import {
  BoxGeometry,
  type BufferGeometry,
  type Group,
  type Material,
  Mesh,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import type { ShipMaterials } from './ShipMaterials';

export interface ShipGeometryBuildContext {
  root: Group;
  geometries: Set<BufferGeometry>;
  shellColliders: CollisionBox[];
  materials: ShipMaterials;
}

export interface ShipBlockOptions {
  name: string;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  material: Material;
}

const boxGeometries = new WeakMap<Group, BoxGeometry>();

function sharedBoxGeometry(
  context: ShipGeometryBuildContext,
  parent: Group,
): BoxGeometry {
  const existing = boxGeometries.get(parent);
  if (existing) return existing;
  const geometry = new BoxGeometry(1, 1, 1);
  boxGeometries.set(parent, geometry);
  context.geometries.add(geometry);
  return geometry;
}

export function toCollisionBox(
  position: readonly [number, number, number],
  size: readonly [number, number, number],
): CollisionBox {
  return {
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
  };
}

export function toOrientedCollisionBox(
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  rotationY: number,
): CollisionBox {
  const halfWidth = size[0] / 2;
  const halfDepth = size[2] / 2;
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  const extentX = Math.abs(cosine) * halfWidth + Math.abs(sine) * halfDepth;
  const extentZ = Math.abs(sine) * halfWidth + Math.abs(cosine) * halfDepth;
  return {
    minX: position[0] - extentX,
    maxX: position[0] + extentX,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    minZ: position[2] - extentZ,
    maxZ: position[2] + extentZ,
    orientedFootprint: {
      centerX: position[0],
      centerZ: position[2],
      halfWidth,
      halfDepth,
      rotationY,
    },
  };
}

export function addBlock(
  context: ShipGeometryBuildContext,
  parent: Group,
  options: ShipBlockOptions,
): Mesh {
  const geometry = sharedBoxGeometry(context, parent);
  const mesh = new Mesh(geometry, options.material);
  mesh.name = options.name;
  mesh.position.set(...options.position);
  mesh.scale.set(...options.size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
