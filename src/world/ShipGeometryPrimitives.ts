import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  Shape,
} from 'three';
import type { CollisionBox } from '../player/collisions';
import {
  SHIP_STERN_CHAMFER,
  SHIP_STERN_Z,
} from './shipLayoutData';
import { FREIGHTER_DIMENSIONS } from './ShipLayoutTypes';
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
  collider?: boolean;
}

export interface ShipRoundedPrismBottomTaper {
  widthScale: number;
  lengthScale: number;
  chine?: {
    depthFraction: number;
    widthScale: number;
    lengthScale: number;
  };
}

const DECK_LENGTH = FREIGHTER_DIMENSIONS.length - 0.8;
const BOW_DEPTH = 8.5;
const BOW_NOSE_CONTROL_WIDTH_SCALE = 0.5;
const BOW_SHOULDER_CONTROL_DEPTH_SCALE = 0.38;

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

export function applyWallPlanarUvs(
  geometry: BufferGeometry,
  horizontalOffset: number,
  verticalOffset: number,
): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    const normalX = Math.abs(normals.getX(index));
    const normalZ = Math.abs(normals.getZ(index));
    const u = normalZ >= normalX ? positions.getX(index) : positions.getZ(index);
    const v = positions.getY(index);
    uvs.setXY(index, u + horizontalOffset, v + verticalOffset);
  }
  uvs.needsUpdate = true;
}

export function applyRoofPlanarUvs(
  geometry: BufferGeometry,
  xOffset: number,
  zOffset: number,
): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index += 1) {
    const normalX = Math.abs(normals.getX(index));
    const normalY = Math.abs(normals.getY(index));
    const normalZ = Math.abs(normals.getZ(index));
    if (normalY >= normalX && normalY >= normalZ) {
      uvs.setXY(
        index,
        positions.getX(index) + xOffset,
        positions.getZ(index) + zOffset,
      );
    } else if (normalZ >= normalX) {
      uvs.setXY(index, positions.getX(index) + xOffset, positions.getY(index));
    } else {
      uvs.setXY(index, positions.getZ(index) + zOffset, positions.getY(index));
    }
  }
  uvs.needsUpdate = true;
}

export function createWallBoxGeometry(
  context: ShipGeometryBuildContext,
  width: number,
  height: number,
  depth: number,
  horizontalOffset: number,
  verticalOffset: number,
): BoxGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  applyWallPlanarUvs(geometry, horizontalOffset, verticalOffset);
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
  if (options.collider) {
    context.shellColliders.push(toCollisionBox(options.position, options.size));
  }
  return mesh;
}

export function addRotatedBlock(
  context: ShipGeometryBuildContext,
  parent: Group,
  options: ShipBlockOptions,
  rotationY: number,
): Mesh {
  const mesh = addBlock(context, parent, {
    ...options,
    collider: false,
  });
  mesh.rotation.y = rotationY;
  return mesh;
}

export function appendRoundedBow(
  shape: Shape,
  halfWidth: number,
  shoulderZ: number,
  tipZ: number,
): void {
  const bowDepth = tipZ - shoulderZ;
  const shoulderControlZ = shoulderZ + bowDepth * BOW_SHOULDER_CONTROL_DEPTH_SCALE;
  const noseControlX = halfWidth * BOW_NOSE_CONTROL_WIDTH_SCALE;
  shape.bezierCurveTo(halfWidth, shoulderControlZ, noseControlX, tipZ, 0, tipZ);
  shape.bezierCurveTo(-noseControlX, tipZ, -halfWidth, shoulderControlZ, -halfWidth, shoulderZ);
}

export function roundedBowPoint(
  halfWidth: number,
  shoulderZ: number,
  tipZ: number,
  progress: number,
): { x: number; z: number } {
  const firstSide = progress <= 0.5;
  const t = firstSide ? progress * 2 : (progress - 0.5) * 2;
  const inverseT = 1 - t;
  const bowDepth = tipZ - shoulderZ;
  const startX = firstSide ? halfWidth : 0;
  const startZ = firstSide ? shoulderZ : tipZ;
  const firstControlX = firstSide
    ? halfWidth
    : -halfWidth * BOW_NOSE_CONTROL_WIDTH_SCALE;
  const firstControlZ = firstSide
    ? shoulderZ + bowDepth * BOW_SHOULDER_CONTROL_DEPTH_SCALE
    : tipZ;
  const secondControlX = firstSide
    ? halfWidth * BOW_NOSE_CONTROL_WIDTH_SCALE
    : -halfWidth;
  const secondControlZ = firstSide
    ? tipZ
    : shoulderZ + bowDepth * BOW_SHOULDER_CONTROL_DEPTH_SCALE;
  const endX = firstSide ? 0 : -halfWidth;
  const endZ = firstSide ? tipZ : shoulderZ;
  return {
    x: inverseT ** 3 * startX
      + 3 * inverseT ** 2 * t * firstControlX
      + 3 * inverseT * t ** 2 * secondControlX
      + t ** 3 * endX,
    z: inverseT ** 3 * startZ
      + 3 * inverseT ** 2 * t * firstControlZ
      + 3 * inverseT * t ** 2 * secondControlZ
      + t ** 3 * endZ,
  };
}

export function shipPlanShape(width: number, length: number): Shape {
  const radius = width / 2;
  const sternOverhang = Math.max(0, (length - DECK_LENGTH) / 2);
  const sternZ = SHIP_STERN_Z - sternOverhang;
  const sternChamfer = Math.min(SHIP_STERN_CHAMFER, radius);
  const bowDepth = Math.min(BOW_DEPTH, length / 2);
  const bowShoulderZ = length / 2 - bowDepth;
  const shape = new Shape();
  shape.moveTo(-radius + sternChamfer, sternZ);
  shape.lineTo(radius - sternChamfer, sternZ);
  shape.lineTo(radius, sternZ + sternChamfer);
  shape.lineTo(radius, bowShoulderZ);
  appendRoundedBow(shape, radius, bowShoulderZ, length / 2);
  shape.lineTo(-radius, sternZ + sternChamfer);
  shape.closePath();
  return shape;
}

export function addRoundedPrism(
  context: ShipGeometryBuildContext,
  name: string,
  width: number,
  length: number,
  height: number,
  topY: number,
  material: Material,
  collider = true,
  bottomTaper?: ShipRoundedPrismBottomTaper,
): Mesh {
  const geometry = new ExtrudeGeometry(shipPlanShape(width, length), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
    steps: bottomTaper?.chine ? 2 : 1,
  });
  geometry.rotateX(Math.PI / 2);
  if (bottomTaper) {
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const depthFraction = Math.min(1, Math.max(0, -positions.getY(index) / height));
      if (depthFraction === 0) continue;
      const chine = bottomTaper.chine;
      let widthScale: number;
      let lengthScale: number;
      if (chine && depthFraction <= chine.depthFraction) {
        const progress = depthFraction / chine.depthFraction;
        widthScale = 1 + (chine.widthScale - 1) * progress;
        lengthScale = 1 + (chine.lengthScale - 1) * progress;
      } else if (chine) {
        const progress = (depthFraction - chine.depthFraction) / (1 - chine.depthFraction);
        widthScale = chine.widthScale
          + (bottomTaper.widthScale - chine.widthScale) * progress;
        lengthScale = chine.lengthScale
          + (bottomTaper.lengthScale - chine.lengthScale) * progress;
      } else {
        widthScale = 1 + (bottomTaper.widthScale - 1) * depthFraction;
        lengthScale = 1 + (bottomTaper.lengthScale - 1) * depthFraction;
      }
      positions.setXYZ(
        index,
        positions.getX(index) * widthScale,
        positions.getY(index),
        positions.getZ(index) * lengthScale,
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.y = topY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  context.root.add(mesh);
  context.geometries.add(geometry);
  if (collider) {
    context.shellColliders.push(toCollisionBox(
      [0, topY - height / 2, 0],
      [width, height, length],
    ));
  }
  return mesh;
}

export function addCylinder(
  context: ShipGeometryBuildContext,
  parent: Group,
  name: string,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  material: Material,
): Mesh {
  const geometry = new CylinderGeometry(radius, radius * 1.08, height, 12);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  context.geometries.add(geometry);
  return mesh;
}
