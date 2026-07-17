import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { CollisionArc, CollisionBox } from '../player/collisions';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT } from './ShipLayout';
import type { ShipDoorSpec, ShipLayoutSpec, ShipZoneId, ShipZoneSpec } from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export { FREIGHTER_DIMENSIONS } from './ShipLayout';
export type { ShipZoneId } from './ShipLayout';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  arcColliders: CollisionArc[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: { halfWidth: number; halfLength: number };
  stackOutlets: readonly [Vector3, Vector3];
  disposeGeometry(): void;
}

const HALF_WIDTH = FREIGHTER_DIMENSIONS.width / 2;
const HALF_LENGTH = FREIGHTER_DIMENSIONS.length / 2;
const ROOM_WALL_HEIGHT = 3.4;

const HULL_HEIGHT = 1.1;
const HULL_TOP_Y = 1.86;
const DECK_WIDTH = 12;
const DECK_THICKNESS = 0.28;
const DECK_LENGTH = 34;
const STRUCTURAL_DECK_TOP_Y = 2.18;
const FINISHED_FLOOR_Y = FREIGHTER_DIMENSIONS.deckY;
const END_CAP_DEPTH = 4;
const WALL_THICKNESS = 0.22;
const WINDOW_SILL_HEIGHT = 0.82;
const WINDOW_HEADER_HEIGHT = 0.52;
const WINDOW_PILLAR_WIDTH = 0.28;
const WINDOW_GLASS_THICKNESS = 0.035;
const MACHINERY_VISUAL_HEIGHT = 1.15;
const MACHINERY_COLLIDER_HEIGHT = 2.4;
const ROOM_CORNER_SIZE = 0.24;
const ROOM_ROOF_THICKNESS = 0.24;
const ROOM_ROOF_OVERHANG = 0.175;
const STACK_X = 1.35;
const STACK_OUTLET_Y = 7.1;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

const RAIL_THICKNESS = 0.2;
const RAIL_COLLIDER_THICKNESS = 0.25;
const RAIL_TOP_THICKNESS = 0.14;
const RAIL_POST_WIDTH = 0.12;
const RAIL_POST_SPACING = 2.4;
const RAIL_END_DEPTH = END_CAP_DEPTH;
const RAIL_END_SEGMENTS = 12;

interface BlockOptions {
  name: string;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  material: Material;
  collider?: boolean;
}

const boxGeometries = new WeakMap<Group, BoxGeometry>();

function sharedBoxGeometry(root: Group, geometries: Set<BufferGeometry>): BoxGeometry {
  const existing = boxGeometries.get(root);
  if (existing) return existing;
  const geometry = new BoxGeometry(1, 1, 1);
  boxGeometries.set(root, geometry);
  geometries.add(geometry);
  return geometry;
}

function toCollisionBox(
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

function addBlock(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  options: BlockOptions,
): Mesh {
  const geometry = sharedBoxGeometry(root, geometries);
  const mesh = new Mesh(geometry, options.material);
  mesh.name = options.name;
  mesh.position.set(...options.position);
  mesh.scale.set(...options.size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  if (options.collider) shellColliders.push(toCollisionBox(options.position, options.size));
  return mesh;
}

function addRotatedBlock(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  options: BlockOptions,
  rotationY: number,
): Mesh {
  const mesh = addBlock(root, geometries, shellColliders, {
    ...options,
    collider: false,
  });
  mesh.rotation.y = rotationY;
  return mesh;
}

function roundedPlanShape(width: number, length: number): Shape {
  const radius = width / 2;
  const capDepth = Math.min(END_CAP_DEPTH, length / 2);
  const straightHalfLength = length / 2 - capDepth;
  const shape = new Shape();
  shape.moveTo(-radius, -straightHalfLength);
  shape.absellipse(0, -straightHalfLength, radius, capDepth, Math.PI, Math.PI * 2, false, 0);
  shape.lineTo(radius, straightHalfLength);
  shape.absellipse(0, straightHalfLength, radius, capDepth, 0, Math.PI, false, 0);
  shape.closePath();
  return shape;
}

function rectangularFloorShape(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): Shape {
  const minShapeY = -maxZ;
  const maxShapeY = -minZ;
  const shape = new Shape();
  shape.moveTo(minX, minShapeY);
  shape.lineTo(maxX, minShapeY);
  shape.lineTo(maxX, maxShapeY);
  shape.lineTo(minX, maxShapeY);
  shape.closePath();
  return shape;
}

function rectangularFloorHole(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): Path {
  const minShapeY = -maxZ;
  const maxShapeY = -minZ;
  const path = new Path();
  path.moveTo(minX, minShapeY);
  path.lineTo(minX, maxShapeY);
  path.lineTo(maxX, maxShapeY);
  path.lineTo(maxX, minShapeY);
  path.closePath();
  return path;
}

function requiredZone(layout: ShipLayoutSpec, id: ShipZoneId): ShipZoneSpec {
  const zone = layout.zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Ship geometry requires zone ${id}`);
  return zone;
}

function cargoFloorShape(layout: ShipLayoutSpec): Shape {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const station = requiredZone(layout, 'lifeboatStation').bounds;
  const radius = (cargo.maxX - cargo.minX) / 2;
  const straightHalfLength = (cargo.maxZ - cargo.minZ) / 2 - END_CAP_DEPTH;
  const shape = new Shape();
  shape.moveTo(-radius, -straightHalfLength);
  shape.absellipse(0, -straightHalfLength, radius, END_CAP_DEPTH, Math.PI, Math.PI * 2, false, 0);
  shape.lineTo(radius, -station.maxZ);
  shape.lineTo(station.minX, -station.maxZ);
  shape.lineTo(station.minX, -station.minZ);
  shape.lineTo(radius, -station.minZ);
  shape.lineTo(radius, straightHalfLength);
  shape.absellipse(0, straightHalfLength, radius, END_CAP_DEPTH, 0, Math.PI, false, 0);
  shape.closePath();
  const crew = requiredZone(layout, 'crewCabin').bounds;
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const storage = requiredZone(layout, 'storageWorkroom').bounds;
  shape.holes.push(
    rectangularFloorHole(crew.minX, crew.maxX, crew.minZ, crew.maxZ),
    rectangularFloorHole(wheelhouse.minX, wheelhouse.maxX, wheelhouse.minZ, wheelhouse.maxZ),
    rectangularFloorHole(storage.minX, storage.maxX, storage.minZ, storage.maxZ),
  );
  return shape;
}

function addFloorSurface(
  root: Group,
  geometries: Set<BufferGeometry>,
  name: string,
  shape: Shape,
  material: Material,
): Mesh {
  const geometry = new ShapeGeometry(shape, 24);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.y = FINISHED_FLOOR_Y;
  mesh.receiveShadow = true;
  root.add(mesh);
  geometries.add(geometry);
  return mesh;
}

function addFinishedFloors(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const crew = requiredZone(layout, 'crewCabin').bounds;
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const storage = requiredZone(layout, 'storageWorkroom').bounds;
  const lifeboat = requiredZone(layout, 'lifeboatStation').bounds;
  addFloorSurface(
    root,
    geometries,
    'floor-crewCabin',
    rectangularFloorShape(crew.minX, crew.maxX, crew.minZ, crew.maxZ),
    materials.crewFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-wheelhouse',
    rectangularFloorShape(wheelhouse.minX, wheelhouse.maxX, wheelhouse.minZ, wheelhouse.maxZ),
    materials.wheelhouseFloor,
  );
  addFloorSurface(root, geometries, 'floor-cargoDeck', cargoFloorShape(layout), materials.cargoFloor);
  addFloorSurface(
    root,
    geometries,
    'floor-storageWorkroom',
    rectangularFloorShape(storage.minX, storage.maxX, storage.minZ, storage.maxZ),
    materials.storageFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-lifeboatStation',
    rectangularFloorShape(lifeboat.minX, lifeboat.maxX, lifeboat.minZ, lifeboat.maxZ),
    materials.lifeboatFloor,
  );
}

function addRoundedPrism(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  name: string,
  width: number,
  length: number,
  height: number,
  topY: number,
  material: Material,
  collider = true,
  bottomTaper?: { widthScale: number; lengthScale: number },
): Mesh {
  const geometry = new ExtrudeGeometry(roundedPlanShape(width, length), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  if (bottomTaper) {
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      if (positions.getY(index) > -height / 2) continue;
      positions.setXYZ(
        index,
        positions.getX(index) * bottomTaper.widthScale,
        positions.getY(index),
        positions.getZ(index) * bottomTaper.lengthScale,
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
  root.add(mesh);
  geometries.add(geometry);
  if (collider) {
    shellColliders.push(toCollisionBox(
      [0, topY - height / 2, 0],
      [width, height, length],
    ));
  }
  return mesh;
}

type WallEdge = 'port' | 'starboard' | 'aft' | 'forward';

interface WallSegmentSpec {
  readonly zoneId: 'crewCabin' | 'wheelhouse' | 'storageWorkroom';
  readonly edge: WallEdge;
  readonly orientation: 'x' | 'z';
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
}

function subtractDoorIntervals(
  min: number,
  max: number,
  doorSpecs: readonly ShipDoorSpec[],
  axis: 0 | 1,
): readonly { min: number; max: number }[] {
  const gaps = doorSpecs.map((door) => ({
    min: Math.max(min, door.center[axis] - door.width / 2),
    max: Math.min(max, door.center[axis] + door.width / 2),
  })).filter((gap) => gap.max > gap.min).sort((left, right) => left.min - right.min);
  const segments: { min: number; max: number }[] = [];
  let cursor = min;
  gaps.forEach((gap) => {
    if (gap.min > cursor) segments.push({ min: cursor, max: gap.min });
    cursor = Math.max(cursor, gap.max);
  });
  if (cursor < max) segments.push({ min: cursor, max });
  return segments;
}

function buildWallSegments(layout: ShipLayoutSpec): readonly WallSegmentSpec[] {
  const result: WallSegmentSpec[] = [];
  (['crewCabin', 'wheelhouse', 'storageWorkroom'] as const).forEach((zoneId) => {
    const bounds = requiredZone(layout, zoneId).bounds;
    const doors = layout.doors.filter((door) => door.zoneId === zoneId);
    const edges = [
      { edge: 'port' as const, orientation: 'z' as const, fixed: bounds.minX, min: bounds.minZ, max: bounds.maxZ, doors: doors.filter((door) => door.orientation === 'side' && door.side === 'port'), axis: 1 as const },
      { edge: 'starboard' as const, orientation: 'z' as const, fixed: bounds.maxX, min: bounds.minZ, max: bounds.maxZ, doors: doors.filter((door) => door.orientation === 'side' && door.side === 'starboard'), axis: 1 as const },
      { edge: 'aft' as const, orientation: 'x' as const, fixed: bounds.minZ, min: bounds.minX, max: bounds.maxX, doors: doors.filter((door) => door.orientation === 'aft'), axis: 0 as const },
      { edge: 'forward' as const, orientation: 'x' as const, fixed: bounds.maxZ, min: bounds.minX, max: bounds.maxX, doors: [] as ShipDoorSpec[], axis: 0 as const },
    ];
    edges.forEach((edge) => subtractDoorIntervals(edge.min, edge.max, edge.doors, edge.axis)
      .forEach((segment) => result.push({ zoneId, edge: edge.edge, orientation: edge.orientation, fixed: edge.fixed, ...segment })));
  });
  return result;
}

function segmentTransform(
  segment: WallSegmentSpec,
  height: number,
  centerY: number,
  thickness = WALL_THICKNESS,
): Pick<BlockOptions, 'size' | 'position'> {
  const length = segment.max - segment.min;
  const center = (segment.min + segment.max) / 2;
  return segment.orientation === 'z'
    ? { size: [thickness, height, length], position: [segment.fixed, centerY, center] }
    : { size: [length, height, thickness], position: [center, centerY, segment.fixed] };
}

function roomWallHeight(_zoneId: ShipZoneId): number {
  return ROOM_WALL_HEIGHT;
}

function addWallSegments(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const wallBottomY = FREIGHTER_DIMENSIONS.deckY;
  buildWallSegments(layout).forEach((segment, index) => {
    const prefix = segment.zoneId === 'crewCabin' ? 'crew-cabin'
      : segment.zoneId === 'storageWorkroom' ? 'storage-workroom' : 'wheelhouse';
    const name = `${prefix}-wall-${segment.edge}-${index}`;
    if (segment.zoneId !== 'wheelhouse') {
      const height = roomWallHeight(segment.zoneId);
      addBlock(root, geometries, shellColliders, {
        name,
        ...segmentTransform(segment, height, wallBottomY + height / 2),
        material: segment.zoneId === 'crewCabin' ? materials.paintedPanel : materials.paintedSteel,
        collider: true,
      });
      return;
    }
    const full = segmentTransform(segment, ROOM_WALL_HEIGHT, wallBottomY + ROOM_WALL_HEIGHT / 2);
    shellColliders.push(toCollisionBox(full.position, full.size));
    const windowHeight = ROOM_WALL_HEIGHT - WINDOW_SILL_HEIGHT - WINDOW_HEADER_HEIGHT;
    addBlock(root, geometries, shellColliders, {
      name: `${name}-sill`,
      ...segmentTransform(segment, WINDOW_SILL_HEIGHT, wallBottomY + WINDOW_SILL_HEIGHT / 2),
      material: materials.paintedPanel,
    });
    addBlock(root, geometries, shellColliders, {
      name: `${name}-header`,
      ...segmentTransform(segment, WINDOW_HEADER_HEIGHT, wallBottomY + ROOM_WALL_HEIGHT - WINDOW_HEADER_HEIGHT / 2),
      material: materials.paintedPanel,
    });
    addBlock(root, geometries, shellColliders, {
      name: `${name}-window-0`,
      ...segmentTransform(segment, windowHeight, wallBottomY + WINDOW_SILL_HEIGHT + windowHeight / 2, WINDOW_GLASS_THICKNESS),
      material: materials.glass,
    });
  });

  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const width = wheelhouse.maxX - wheelhouse.minX;
  const windowWidth = (width - WINDOW_PILLAR_WIDTH * 4) / 3;
  const windowHeight = ROOM_WALL_HEIGHT - WINDOW_SILL_HEIGHT - WINDOW_HEADER_HEIGHT;
  for (let pillar = 0; pillar < 4; pillar += 1) {
    const x = wheelhouse.minX + WINDOW_PILLAR_WIDTH / 2 + pillar * (windowWidth + WINDOW_PILLAR_WIDTH);
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-front-pillar-${pillar}`,
      size: [WINDOW_PILLAR_WIDTH, windowHeight, WALL_THICKNESS],
      position: [x, wallBottomY + WINDOW_SILL_HEIGHT + windowHeight / 2, wheelhouse.maxZ],
      material: materials.paintedSteel,
    });
  }
}

function addRoomCornerCaps(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    const height = roomWallHeight(zone.id);
    const material = zone.id === 'storageWorkroom'
      ? materials.paintedSteel
      : materials.paintedPanel;
    zone.polygon.forEach(([x, z], index) => {
      addBlock(root, geometries, shellColliders, {
        name: `${zone.id}-corner-${index}`,
        size: [ROOM_CORNER_SIZE, height, ROOM_CORNER_SIZE],
        position: [x, FREIGHTER_DIMENSIONS.deckY + height / 2, z],
        material,
        collider: true,
      });
    });
  });
}

function addRoomRoofs(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    const width = zone.bounds.maxX - zone.bounds.minX;
    const length = zone.bounds.maxZ - zone.bounds.minZ;
    const wallTopY = FREIGHTER_DIMENSIONS.deckY + roomWallHeight(zone.id);
    addBlock(root, geometries, shellColliders, {
      name: `${zone.id}-roof`,
      size: [
        width + ROOM_ROOF_OVERHANG * 2,
        ROOM_ROOF_THICKNESS,
        length + ROOM_ROOF_OVERHANG * 2,
      ],
      position: [
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        wallTopY + ROOM_ROOF_THICKNESS / 2,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ],
      material: materials.paintedSteel,
    });
  });
}

function addCylinder(
  root: Group,
  geometries: Set<BufferGeometry>,
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
  root.add(mesh);
  geometries.add(geometry);
  return mesh;
}

function addMachineryAndStacks(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  const closure = layout.machineryClosure;
  const machineryWidth = closure.maxX - closure.minX;
  const machineryLength = closure.maxZ - closure.minZ;
  const machineryZ = (closure.minZ + closure.maxZ) / 2;
  const machineryX = (closure.minX + closure.maxX) / 2;
  addBlock(root, geometries, shellColliders, {
    name: 'machinery-island',
    size: [machineryWidth, MACHINERY_VISUAL_HEIGHT, machineryLength],
    position: [machineryX, FREIGHTER_DIMENSIONS.deckY + MACHINERY_VISUAL_HEIGHT / 2, machineryZ],
    material: materials.paintedSteel,
  });
  shellColliders.push(toCollisionBox(
    [machineryX, FREIGHTER_DIMENSIONS.deckY + MACHINERY_COLLIDER_HEIGHT / 2, machineryZ],
    [machineryWidth, MACHINERY_COLLIDER_HEIGHT, machineryLength],
  ));
  const stackBaseY = FREIGHTER_DIMENSIONS.deckY + MACHINERY_VISUAL_HEIGHT;
  const stackHeight = STACK_OUTLET_Y - stackBaseY;
  const stackCenterY = stackBaseY + stackHeight / 2;
  const stackOutlets = [
    new Vector3(-STACK_X, STACK_OUTLET_Y, machineryZ),
    new Vector3(STACK_X, STACK_OUTLET_Y, machineryZ),
  ] as const;
  stackOutlets.forEach((outlet, index) => {
    const side = index === 0 ? 'port' : 'starboard';
    addCylinder(root, geometries, `smokestack-${side}`, STACK_RADIUS, stackHeight, [
      outlet.x,
      stackCenterY,
      outlet.z,
    ], materials.darkMetal);
    addCylinder(root, geometries, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [
      outlet.x,
      stackBaseY + STACK_COLLAR_HEIGHT / 2,
      outlet.z,
    ], materials.exposedMetal);
    addBlock(root, geometries, shellColliders, {
      name: `rust-streak-${side}-stack-collar`,
      size: [0.18, 0.7, 0.035],
      position: [outlet.x, stackBaseY - 0.2, machineryZ + STACK_RADIUS],
      material: materials.rust,
    });
  });
  return stackOutlets;
}

function addRailSegment(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  sideName: 'port' | 'starboard',
  minZ: number,
  maxZ: number,
  layout: ShipLayoutSpec,
): void {
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const x = sideName === 'port' ? -railX : railX;
  const length = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  addBlock(root, geometries, shellColliders, {
    name: `rail-${sideName}-${minZ}-top`,
    size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
    position: [x, railTopY - RAIL_TOP_THICKNESS / 2, centerZ],
    material: materials.darkMetal,
  });
  const postCount = Math.max(2, Math.ceil(length / RAIL_POST_SPACING));
  const postSpan = Math.max(0, length - RAIL_POST_WIDTH);
  for (let index = 0; index <= postCount; index += 1) {
    const z = minZ + RAIL_POST_WIDTH / 2 + (postSpan * index) / postCount;
    addBlock(root, geometries, shellColliders, {
      name: `rail-${sideName}-${minZ}-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, z],
      material: materials.darkMetal,
    });
  }
  shellColliders.push(toCollisionBox(
    [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, centerZ],
    [RAIL_COLLIDER_THICKNESS, layout.rail.height, length],
  ));
}

function addCurvedEndRail(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  arcColliders: CollisionArc[],
  materials: ShipMaterials,
  end: 'bow' | 'stern',
  z: number,
  layout: ShipLayoutSpec,
): void {
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const direction = end === 'bow' ? 1 : -1;
  const pointAt = (index: number): { x: number; z: number } => {
    const angle = (Math.PI * index) / RAIL_END_SEGMENTS;
    return {
      x: railX * Math.cos(angle),
      z: z + direction * RAIL_END_DEPTH * Math.sin(angle),
    };
  };
  for (let index = 0; index < RAIL_END_SEGMENTS; index += 1) {
    const start = pointAt(index);
    const finish = pointAt(index + 1);
    const deltaX = finish.x - start.x;
    const deltaZ = finish.z - start.z;
    const chordLength = Math.hypot(deltaX, deltaZ);
    const position = [
      (start.x + finish.x) / 2,
      railTopY - RAIL_TOP_THICKNESS / 2,
      (start.z + finish.z) / 2,
    ] as const;
    const rotationY = Math.atan2(deltaX, deltaZ);
    addRotatedBlock(root, geometries, shellColliders, {
      name: `rail-${end}-top-${index}`,
      size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, chordLength],
      position,
      material: materials.darkMetal,
    }, rotationY);
  }
  for (let index = 0; index <= RAIL_END_SEGMENTS; index += 1) {
    const point = pointAt(index);
    addBlock(root, geometries, shellColliders, {
      name: `rail-${end}-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [point.x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, point.z],
      material: materials.darkMetal,
    });
  }
  arcColliders.push({
    centerX: 0,
    centerZ: z,
    radiusX: railX,
    radiusZ: RAIL_END_DEPTH,
    end,
    thickness: RAIL_COLLIDER_THICKNESS,
    minY: FREIGHTER_DIMENSIONS.deckY,
    maxY: railTopY,
  });
}

function addRails(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  arcColliders: CollisionArc[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const minZ = cargo.minZ + RAIL_END_DEPTH;
  const maxZ = cargo.maxZ - RAIL_END_DEPTH;
  const opening = layout.rail.starboardOpening;
  const gapMinZ = opening.centerZ - opening.width / 2;
  const gapMaxZ = opening.centerZ + opening.width / 2;
  addRailSegment(root, geometries, shellColliders, materials, 'port', minZ, maxZ, layout);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', minZ, gapMinZ, layout);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', gapMaxZ, maxZ, layout);
  addCurvedEndRail(root, geometries, shellColliders, arcColliders, materials, 'bow', maxZ, layout);
  addCurvedEndRail(root, geometries, shellColliders, arcColliders, materials, 'stern', minZ, layout);
}

function addWeathering(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  addBlock(root, geometries, shellColliders, {
    name: 'rust-streak-lifeboat-rail-opening',
    size: [0.025, 0.68, 0.12],
    position: [
      layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2 + RAIL_THICKNESS / 2,
      FREIGHTER_DIMENSIONS.deckY + 0.34,
      layout.rail.starboardOpening.centerZ,
    ],
    material: materials.rust,
  });
}

export function createShipGeometry(
  materials: ShipMaterials,
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipGeometryBuild {
  const root = new Group();
  root.name = 'coastal-freighter';
  const geometries = new Set<BufferGeometry>();
  const shellColliders: CollisionBox[] = [];
  const arcColliders: CollisionArc[] = [];

  addRoundedPrism(
    root,
    geometries,
    shellColliders,
    'main-hull-body',
    HALF_WIDTH * 2,
    HALF_LENGTH * 2,
    HULL_HEIGHT,
    HULL_TOP_Y,
    materials.darkHull,
    true,
    { widthScale: 0.86, lengthScale: 0.96 },
  );
  addRoundedPrism(
    root,
    geometries,
    shellColliders,
    'timber-deck',
    DECK_WIDTH,
    DECK_LENGTH,
    DECK_THICKNESS,
    STRUCTURAL_DECK_TOP_Y,
    materials.cargoFloor,
  );
  addFinishedFloors(root, geometries, materials, layout);

  addWallSegments(root, geometries, shellColliders, materials, layout);
  addRoomCornerCaps(root, geometries, shellColliders, materials, layout);
  addRoomRoofs(root, geometries, shellColliders, materials, layout);

  const stackOutlets = addMachineryAndStacks(root, geometries, shellColliders, materials, layout);
  addRails(root, geometries, shellColliders, arcColliders, materials, layout);
  addWeathering(root, geometries, shellColliders, materials, layout);

  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const beaconRoofY = FREIGHTER_DIMENSIONS.deckY + ROOM_WALL_HEIGHT + ROOM_ROOF_THICKNESS;
  addCylinder(root, geometries, 'alarm-beacon', 0.22, 0.5, [
    (wheelhouse.minX + wheelhouse.maxX) / 2,
    beaconRoofY + 0.25,
    (wheelhouse.minZ + wheelhouse.maxZ) / 2,
  ], materials.beacon);

  const zoneCenters = new Map<ShipZoneId, Vector3>(layout.zones.map((zone) => [
    zone.id,
    new Vector3(
      (zone.bounds.minX + zone.bounds.maxX) / 2,
      FREIGHTER_DIMENSIONS.deckY + 1.5,
      (zone.bounds.minZ + zone.bounds.maxZ) / 2,
    ),
  ]));
  let disposed = false;

  return {
    root,
    shellColliders,
    arcColliders,
    zoneCenters,
    waterExclusion: {
      halfWidth: HALF_WIDTH - 0.2,
      halfLength: (requiredZone(layout, 'cargoDeck').bounds.maxZ
        - requiredZone(layout, 'cargoDeck').bounds.minZ) / 2,
    },
    stackOutlets,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
