import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Material,
  Mesh,
  Path,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import {
  PLAYER_BODY_HEIGHT,
  type CollisionArc,
  type CollisionBox,
} from '../player/collisions';
import type { LadderClimbZone, LadderEntryArea } from '../player/LadderTraversal';
import type { WaterExclusionHeightProfile } from '../ocean/WaterExclusion';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
  deckHatchRect,
} from './ShipLayout';
import type {
  ShipBalconySpec,
  ShipDoorSpec,
  ShipLadderSpec,
  ShipLayoutSpec,
  ShipTransverseEdge,
  ShipZoneId,
  ShipZoneSpec,
} from './ShipLayout';
import type { ShipMaterials } from './ShipMaterials';

export { FREIGHTER_DIMENSIONS } from './ShipLayout';
export type { ShipZoneId } from './ShipLayout';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  arcColliders: CollisionArc[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: {
    halfWidth: number;
    halfLength: number;
    taperStart: number;
    minimumLocalY: number;
    heightProfile: WaterExclusionHeightProfile;
  };
  stackOutlets: readonly [Vector3, Vector3];
  climbZones: readonly LadderClimbZone[];
  disposeGeometry(): void;
}

const HALF_WIDTH = FREIGHTER_DIMENSIONS.width / 2;
const HALF_LENGTH = FREIGHTER_DIMENSIONS.length / 2;
const ROOM_WALL_HEIGHT = SHIP_ROOM_WALL_HEIGHT;

const DECK_WIDTH = FREIGHTER_DIMENSIONS.width - 0.5;
const DECK_LENGTH = FREIGHTER_DIMENSIONS.length - 0.8;
const DECK_HALF_WIDTH = DECK_WIDTH / 2;
const END_CAP_DEPTH = 5.2;
const HULL_HEIGHT = 4.6;
const HULL_TOP_Y = 1.98;
const HULL_BOTTOM_TAPER = {
  widthScale: 0.1,
  lengthScale: 0.58,
  chine: {
    depthFraction: 0.5,
    widthScale: 0.7,
    lengthScale: 0.78,
  },
} as const;
const HULL_EXCLUSION_LOWER_SCALE = { width: 0.4, length: 0.58 } as const;
const UPPER_HULL_BOTTOM_TAPER = { widthScale: 0.96, lengthScale: 0.94 } as const;
const DECK_THICKNESS = 0.28;
const STRUCTURAL_DECK_TOP_Y = 2.18;
const FINISHED_FLOOR_Y = FREIGHTER_DIMENSIONS.deckY;
const UPPER_HULL_BASE_HEIGHT = 0.9;
const UPPER_HULL_TOP_GAP = 0.03;
const UPPER_HULL_HEIGHT = UPPER_HULL_BASE_HEIGHT - UPPER_HULL_TOP_GAP;
const UPPER_HULL_TOP_Y = STRUCTURAL_DECK_TOP_Y - UPPER_HULL_TOP_GAP;
const WATERLINE_HEIGHT = 0.14;
const WATERLINE_TOP_Y = STRUCTURAL_DECK_TOP_Y - UPPER_HULL_BASE_HEIGHT + 0.03;
const WALL_THICKNESS = SHIP_ROOM_WALL_THICKNESS;
const WALL_HALF_THICKNESS = WALL_THICKNESS / 2;
const WINDOW_SILL_HEIGHT = 0.82;
const WINDOW_HEADER_HEIGHT = 0.52;
const WINDOW_GLASS_THICKNESS = 0.035;
const WHEELHOUSE_CHAMFER_DEPTH = 1.3;
const WHEELHOUSE_CHAMFER_WIDTH = 1.3;
const WHEELHOUSE_TAPER_ANGLE = Math.PI / 90;
const WHEELHOUSE_ROOF_OVERHANG = 0.28;
const WHEELHOUSE_FRAME_WIDTH = 0.18;
const WHEELHOUSE_PROFILE_HEIGHT = 0.07;
const WHEELHOUSE_PROFILE_DEPTH = 0.05;
const PORTHOLE_CENTER_HEIGHT = PLAYER_BODY_HEIGHT;
const PORTHOLE_OPENING_RADIUS = 0.48;
const PORTHOLE_GLASS_RADIUS = 0.46;
const PORTHOLE_GASKET_OUTER_RADIUS = 0.51;
const PORTHOLE_FRAME_OUTER_RADIUS = 0.66;
const PORTHOLE_BOLT_RADIUS = 0.045;
const PORTHOLE_BOLT_ORBIT = 0.575;
const PORTHOLE_SEGMENTS = 24;
const MACHINERY_VISUAL_HEIGHT = 1.15;
const MACHINERY_COLLIDER_HEIGHT = 2.4;
const ROOM_ROOF_THICKNESS = 0.24;
const STACK_X = 1.35;
const STACK_OUTLET_Y = 7.1;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

const BALCONY_DECK_THICKNESS = 0.1;
const BALCONY_RAIL_MEMBER_THICKNESS = 0.12;
const BALCONY_RAIL_POST_SPACING = 2.2;

const LADDER_RAIL_WIDTH = 0.08;
const LADDER_RAIL_DEPTH = 0.1;
const LADDER_RUNG_HEIGHT = 0.065;
const LADDER_RUNG_DEPTH = 0.11;
const LADDER_CLIMB_CLEARANCE = PLAYER_LAYOUT_RADIUS + LADDER_RUNG_DEPTH / 2 + 0.03;
const LADDER_GRAB_RISE = 0.72;
const LADDER_ENTRY_DEPTH = 0.9;
const LADDER_DISMOUNT_DISTANCE = 0.75;

const RAIL_THICKNESS = 0.2;
const RAIL_COLLIDER_THICKNESS = 0.25;
const RAIL_TOP_THICKNESS = 0.14;
const RAIL_POST_WIDTH = 0.12;
const RAIL_POST_SPACING = 2.4;
const RAIL_END_DEPTH = END_CAP_DEPTH + RAIL_COLLIDER_THICKNESS / 2;
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
  const station = requiredZone(layout, 'lifeboatStation').bounds;
  const radius = DECK_HALF_WIDTH;
  const straightHalfLength = DECK_LENGTH / 2 - END_CAP_DEPTH;
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
    materials.timberFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-wheelhouse',
    rectangularFloorShape(wheelhouse.minX, wheelhouse.maxX, wheelhouse.minZ, wheelhouse.maxZ),
    materials.timberFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-cargoDeck',
    cargoFloorShape(layout),
    materials.timberFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-storageWorkroom',
    rectangularFloorShape(storage.minX, storage.maxX, storage.minZ, storage.maxZ),
    materials.timberFloor,
  );
  addFloorSurface(
    root,
    geometries,
    'floor-lifeboatStation',
    rectangularFloorShape(lifeboat.minX, DECK_HALF_WIDTH, lifeboat.minZ, lifeboat.maxZ),
    materials.timberFloor,
  );

  const stripeOuterInset = 0.1;
  const stripeWidth = 0.2;
  const stripeShape = rectangularFloorShape(
    lifeboat.minX + stripeOuterInset,
    DECK_HALF_WIDTH,
    lifeboat.minZ + stripeOuterInset,
    lifeboat.maxZ - stripeOuterInset,
  );
  stripeShape.holes.push(rectangularFloorHole(
    lifeboat.minX + stripeOuterInset + stripeWidth,
    DECK_HALF_WIDTH - stripeWidth,
    lifeboat.minZ + stripeOuterInset + stripeWidth,
    lifeboat.maxZ - stripeOuterInset - stripeWidth,
  ));
  const stripe = addFloorSurface(
    root,
    geometries,
    'lifeboat-station-emergency-border',
    stripeShape,
    materials.emergencyStripe,
  );
  stripe.position.y += 0.008;
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
  bottomTaper?: {
    widthScale: number;
    lengthScale: number;
    chine?: {
      depthFraction: number;
      widthScale: number;
      lengthScale: number;
    };
  },
): Mesh {
  const geometry = new ExtrudeGeometry(roundedPlanShape(width, length), {
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

type PortholeZoneId = 'crewCabin' | 'storageWorkroom';
type PortholeEdge = 'aft' | 'forward';

interface PortholeSpec {
  readonly zoneId: PortholeZoneId;
  readonly edge: PortholeEdge;
  readonly index: 1 | 2;
  readonly centerX: number;
}

const PORTHOLE_SPECS: readonly PortholeSpec[] = [
  { zoneId: 'crewCabin', edge: 'aft', index: 1, centerX: -2.2 },
  { zoneId: 'crewCabin', edge: 'aft', index: 2, centerX: 2.2 },
  { zoneId: 'crewCabin', edge: 'forward', index: 1, centerX: -2.2 },
  { zoneId: 'crewCabin', edge: 'forward', index: 2, centerX: 2.2 },
  { zoneId: 'storageWorkroom', edge: 'aft', index: 1, centerX: -2.2 },
  { zoneId: 'storageWorkroom', edge: 'aft', index: 2, centerX: 2.2 },
  { zoneId: 'storageWorkroom', edge: 'forward', index: 1, centerX: -2.2 },
  { zoneId: 'storageWorkroom', edge: 'forward', index: 2, centerX: 2.2 },
];

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
      { edge: 'aft' as const, orientation: 'x' as const, fixed: bounds.minZ, min: bounds.minX + WALL_THICKNESS, max: bounds.maxX - WALL_THICKNESS, doors: doors.filter((door) => door.orientation === 'aft'), axis: 0 as const },
      { edge: 'forward' as const, orientation: 'x' as const, fixed: bounds.maxZ, min: bounds.minX + WALL_THICKNESS, max: bounds.maxX - WALL_THICKNESS, doors: [] as ShipDoorSpec[], axis: 0 as const },
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
  const fixed = segment.fixed + (
    segment.edge === 'port' || segment.edge === 'aft'
      ? WALL_HALF_THICKNESS
      : -WALL_HALF_THICKNESS
  );
  return segment.orientation === 'z'
    ? { size: [thickness, height, length], position: [fixed, centerY, center] }
    : { size: [length, height, thickness], position: [center, centerY, fixed] };
}

function segmentColliderTransform(
  segment: WallSegmentSpec,
  height: number,
  centerY: number,
): Pick<BlockOptions, 'size' | 'position'> {
  return segmentTransform(segment, height, centerY);
}

function roomWallHeight(_zoneId: ShipZoneId): number {
  return ROOM_WALL_HEIGHT;
}

function portholesForSegment(segment: WallSegmentSpec): readonly PortholeSpec[] {
  if (segment.orientation !== 'x' || segment.zoneId === 'wheelhouse') return [];
  return PORTHOLE_SPECS.filter((porthole) =>
    porthole.zoneId === segment.zoneId
    && porthole.edge === segment.edge
    && porthole.centerX - PORTHOLE_OPENING_RADIUS >= segment.min
    && porthole.centerX + PORTHOLE_OPENING_RADIUS <= segment.max);
}

function addPortholeWallPanel(
  root: Group,
  geometries: Set<BufferGeometry>,
  name: string,
  segment: WallSegmentSpec,
  portholes: readonly PortholeSpec[],
  wallBottomY: number,
  material: Material,
): void {
  const height = roomWallHeight(segment.zoneId);
  const renderHeight = height - 0.00002;
  const length = segment.max - segment.min;
  const renderLength = length - 0.00002;
  const horizontalCenter = (segment.min + segment.max) / 2;
  const shape = new Shape();
  shape.moveTo(-renderLength / 2, -renderHeight / 2);
  shape.lineTo(renderLength / 2, -renderHeight / 2);
  shape.lineTo(renderLength / 2, renderHeight / 2);
  shape.lineTo(-renderLength / 2, renderHeight / 2);
  shape.closePath();
  portholes.forEach((porthole) => {
    const opening = new Path();
    opening.absarc(
      porthole.centerX - horizontalCenter,
      PORTHOLE_CENTER_HEIGHT - height / 2,
      PORTHOLE_OPENING_RADIUS,
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(opening);
  });

  const geometry = new ExtrudeGeometry(shape, {
    depth: WALL_THICKNESS,
    bevelEnabled: false,
    curveSegments: PORTHOLE_SEGMENTS,
    steps: 1,
  });
  geometry.translate(0, 0, -WALL_HALF_THICKNESS);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(
    horizontalCenter,
    wallBottomY + height / 2,
    segmentTransform(segment, height, wallBottomY + height / 2).position[2],
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  geometries.add(geometry);
}

function addPortholeDetails(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const glassGeometry = new CircleGeometry(PORTHOLE_GLASS_RADIUS, PORTHOLE_SEGMENTS);
  const gasketGeometry = new RingGeometry(
    PORTHOLE_GLASS_RADIUS,
    PORTHOLE_GASKET_OUTER_RADIUS,
    PORTHOLE_SEGMENTS,
  );
  const frameGeometry = new RingGeometry(
    PORTHOLE_GASKET_OUTER_RADIUS,
    PORTHOLE_FRAME_OUTER_RADIUS,
    PORTHOLE_SEGMENTS,
  );
  const boltGeometry = new CircleGeometry(PORTHOLE_BOLT_RADIUS, 8);
  const linerGeometry = new CylinderGeometry(
    PORTHOLE_OPENING_RADIUS,
    PORTHOLE_OPENING_RADIUS,
    WALL_THICKNESS + 0.018,
    PORTHOLE_SEGMENTS,
    1,
    true,
  );
  [
    glassGeometry,
    gasketGeometry,
    frameGeometry,
    boltGeometry,
    linerGeometry,
  ].forEach((geometry) => geometries.add(geometry));

  PORTHOLE_SPECS.forEach((spec) => {
    const bounds = requiredZone(layout, spec.zoneId).bounds;
    const wallZ = spec.edge === 'aft'
      ? bounds.minZ + WALL_HALF_THICKNESS
      : bounds.maxZ - WALL_HALF_THICKNESS;
    const outwardDirection = spec.edge === 'aft' ? -1 : 1;
    const group = new Group();
    group.name = `porthole:${spec.zoneId}:${spec.edge}:${spec.index}`;
    group.position.set(
      spec.centerX,
      FREIGHTER_DIMENSIONS.deckY + PORTHOLE_CENTER_HEIGHT,
      wallZ,
    );

    const liner = new Mesh(linerGeometry, materials.darkMetal);
    liner.name = `${group.name}:liner`;
    liner.rotation.x = Math.PI / 2;
    liner.castShadow = true;
    liner.receiveShadow = true;
    group.add(liner);

    ([
      ['outer', outwardDirection],
      ['inner', -outwardDirection],
    ] as const).forEach(([face, direction]) => {
      const faceZ = direction * (WALL_HALF_THICKNESS + 0.012);
      const rotationY = direction > 0 ? 0 : Math.PI;
      const glass = new Mesh(glassGeometry, materials.glass);
      glass.name = `${group.name}:${face}:glass`;
      glass.position.z = direction * (WALL_HALF_THICKNESS + 0.006);
      glass.rotation.y = rotationY;
      glass.castShadow = false;
      group.add(glass);

      const gasket = new Mesh(gasketGeometry, materials.darkMetal);
      gasket.name = `${group.name}:${face}:gasket`;
      gasket.position.z = faceZ;
      gasket.rotation.y = rotationY;
      gasket.receiveShadow = true;
      group.add(gasket);

      const frame = new Mesh(frameGeometry, materials.exposedMetal);
      frame.name = `${group.name}:${face}:frame`;
      frame.position.z = direction * (WALL_HALF_THICKNESS + 0.018);
      frame.rotation.y = rotationY;
      frame.castShadow = true;
      frame.receiveShadow = true;
      group.add(frame);

      for (let boltIndex = 0; boltIndex < 8; boltIndex += 1) {
        const angle = boltIndex / 8 * Math.PI * 2 + Math.PI / 8;
        const bolt = new Mesh(boltGeometry, materials.darkMetal);
        bolt.name = `${group.name}:${face}:bolt-${boltIndex + 1}`;
        bolt.position.set(
          Math.cos(angle) * PORTHOLE_BOLT_ORBIT,
          Math.sin(angle) * PORTHOLE_BOLT_ORBIT,
          direction * (WALL_HALF_THICKNESS + 0.022),
        );
        bolt.rotation.y = rotationY;
        bolt.castShadow = true;
        group.add(bolt);
      }
    });
    root.add(group);
  });
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
    if (segment.zoneId === 'wheelhouse') {
      const wall = segmentColliderTransform(
        segment,
        ROOM_WALL_HEIGHT,
        wallBottomY + ROOM_WALL_HEIGHT / 2,
      );
      shellColliders.push(toCollisionBox(wall.position, wall.size));
      return;
    }
    const height = roomWallHeight(segment.zoneId);
    const material = segment.zoneId === 'crewCabin'
      ? materials.paintedPanel
      : materials.plainPaintedSteel;
    const portholes = portholesForSegment(segment);
    if (portholes.length > 0) {
      const wall = segmentColliderTransform(segment, height, wallBottomY + height / 2);
      shellColliders.push(toCollisionBox(wall.position, wall.size));
      addPortholeWallPanel(
        root,
        geometries,
        name,
        segment,
        portholes,
        wallBottomY,
        material,
      );
    } else {
      const wall = segmentColliderTransform(segment, height, wallBottomY + height / 2);
      shellColliders.push(toCollisionBox(wall.position, wall.size));
      addBlock(root, geometries, shellColliders, {
        name,
        ...segmentTransform(segment, height, wallBottomY + height / 2),
        material,
      });
    }
  });
}

interface WheelhousePaneSpec {
  readonly id: string;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
}

function addWheelhousePane(
  facade: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  spec: WheelhousePaneSpec,
): void {
  const dx = spec.end[0] - spec.start[0];
  const dz = spec.end[1] - spec.start[1];
  const width = Math.hypot(dx, dz);
  const windowHeight = ROOM_WALL_HEIGHT - WINDOW_SILL_HEIGHT - WINDOW_HEADER_HEIGHT;
  const openingWidth = width - WHEELHOUSE_FRAME_WIDTH * 2;
  const pane = new Group();
  pane.name = `wheelhouse-pane:${spec.id}`;
  pane.position.set(
    (spec.start[0] + spec.end[0]) / 2,
    FREIGHTER_DIMENSIONS.deckY,
    (spec.start[1] + spec.end[1]) / 2,
  );
  pane.rotation.set(
    -WHEELHOUSE_TAPER_ANGLE,
    Math.atan2(-dz, dx),
    0,
    'YXZ',
  );
  pane.userData.inwardTaper = WHEELHOUSE_TAPER_ANGLE;
  facade.add(pane);

  addBlock(pane, geometries, [], {
    name: `${pane.name}:sill`,
    size: [width, WINDOW_SILL_HEIGHT, WALL_THICKNESS],
    position: [0, WINDOW_SILL_HEIGHT / 2, -WALL_HALF_THICKNESS],
    material: materials.paintedPanel,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:header`,
    size: [width, WINDOW_HEADER_HEIGHT, WALL_THICKNESS],
    position: [0, ROOM_WALL_HEIGHT - WINDOW_HEADER_HEIGHT / 2, -WALL_HALF_THICKNESS],
    material: materials.paintedPanel,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:sill-cap`,
    size: [openingWidth, WHEELHOUSE_PROFILE_HEIGHT, WHEELHOUSE_PROFILE_DEPTH],
    position: [
      0,
      WINDOW_SILL_HEIGHT - WHEELHOUSE_PROFILE_HEIGHT / 2,
      -WALL_THICKNESS - WHEELHOUSE_PROFILE_DEPTH / 2,
    ],
    material: materials.darkMetal,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:header-trim`,
    size: [openingWidth, WHEELHOUSE_PROFILE_HEIGHT, WHEELHOUSE_PROFILE_DEPTH],
    position: [
      0,
      ROOM_WALL_HEIGHT - WINDOW_HEADER_HEIGHT + WHEELHOUSE_PROFILE_HEIGHT / 2,
      -WALL_THICKNESS - WHEELHOUSE_PROFILE_DEPTH / 2,
    ],
    material: materials.darkMetal,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:frame-start`,
    size: [WHEELHOUSE_FRAME_WIDTH, windowHeight, WALL_THICKNESS],
    position: [
      -width / 2 + WHEELHOUSE_FRAME_WIDTH / 2,
      WINDOW_SILL_HEIGHT + windowHeight / 2,
      -WALL_HALF_THICKNESS,
    ],
    material: materials.darkMetal,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:frame-end`,
    size: [WHEELHOUSE_FRAME_WIDTH, windowHeight, WALL_THICKNESS],
    position: [
      width / 2 - WHEELHOUSE_FRAME_WIDTH / 2,
      WINDOW_SILL_HEIGHT + windowHeight / 2,
      -WALL_HALF_THICKNESS,
    ],
    material: materials.darkMetal,
  });
  addBlock(pane, geometries, [], {
    name: `${pane.name}:glass`,
    size: [openingWidth, windowHeight, WINDOW_GLASS_THICKNESS],
    position: [0, WINDOW_SILL_HEIGHT + windowHeight / 2, -WALL_HALF_THICKNESS],
    material: materials.glass,
  }).castShadow = false;
}

function addWheelhouseFacade(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const portDoor = layout.doors.find((door) =>
    door.zoneId === 'wheelhouse' && door.orientation === 'side' && door.side === 'port')!;
  const aftDoor = layout.doors.find((door) =>
    door.zoneId === 'wheelhouse' && door.orientation === 'aft')!;
  const portDoorMinZ = portDoor.center[1] - portDoor.width / 2;
  const aftDoorMinX = aftDoor.center[0] - aftDoor.width / 2;
  const aftDoorMaxX = aftDoor.center[0] + aftDoor.width / 2;
  const frontSideZ = wheelhouse.maxZ - WHEELHOUSE_CHAMFER_DEPTH;
  const frontCenterMinX = wheelhouse.minX + WHEELHOUSE_CHAMFER_WIDTH;
  const frontCenterMaxX = wheelhouse.maxX - WHEELHOUSE_CHAMFER_WIDTH;
  const facade = new Group();
  facade.name = 'wheelhouse-facade';
  root.add(facade);

  ([
    {
      id: 'front-center',
      start: [frontCenterMinX, wheelhouse.maxZ],
      end: [frontCenterMaxX, wheelhouse.maxZ],
    },
    {
      id: 'front-port-chamfer',
      start: [wheelhouse.minX, frontSideZ],
      end: [frontCenterMinX, wheelhouse.maxZ],
    },
    {
      id: 'front-starboard-chamfer',
      start: [frontCenterMaxX, wheelhouse.maxZ],
      end: [wheelhouse.maxX, frontSideZ],
    },
    {
      id: 'port-side',
      start: [wheelhouse.minX, wheelhouse.minZ],
      end: [wheelhouse.minX, portDoorMinZ],
    },
    {
      id: 'starboard-side',
      start: [wheelhouse.maxX, frontSideZ],
      end: [wheelhouse.maxX, wheelhouse.minZ],
    },
    {
      id: 'aft-port',
      start: [aftDoorMinX, wheelhouse.minZ],
      end: [wheelhouse.minX + WALL_THICKNESS, wheelhouse.minZ],
    },
    {
      id: 'aft-starboard',
      start: [wheelhouse.maxX - WALL_THICKNESS, wheelhouse.minZ],
      end: [aftDoorMaxX, wheelhouse.minZ],
    },
  ] satisfies readonly WheelhousePaneSpec[]).forEach((spec) =>
    addWheelhousePane(facade, geometries, materials, spec));
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
    if (zone.id === 'wheelhouse') {
      const frontSideZ = zone.bounds.maxZ - WHEELHOUSE_CHAMFER_DEPTH;
      const frontCenterMinX = zone.bounds.minX + WHEELHOUSE_CHAMFER_WIDTH;
      const frontCenterMaxX = zone.bounds.maxX - WHEELHOUSE_CHAMFER_WIDTH;
      const diagonalInset = WHEELHOUSE_ROOF_OVERHANG * (Math.SQRT2 - 1);
      const shape = new Shape();
      shape.moveTo(
        zone.bounds.minX - WHEELHOUSE_ROOF_OVERHANG,
        zone.bounds.minZ - WHEELHOUSE_ROOF_OVERHANG,
      );
      shape.lineTo(
        zone.bounds.maxX + WHEELHOUSE_ROOF_OVERHANG,
        zone.bounds.minZ - WHEELHOUSE_ROOF_OVERHANG,
      );
      shape.lineTo(
        zone.bounds.maxX + WHEELHOUSE_ROOF_OVERHANG,
        frontSideZ + diagonalInset,
      );
      shape.lineTo(
        frontCenterMaxX + diagonalInset,
        zone.bounds.maxZ + WHEELHOUSE_ROOF_OVERHANG,
      );
      shape.lineTo(
        frontCenterMinX - diagonalInset,
        zone.bounds.maxZ + WHEELHOUSE_ROOF_OVERHANG,
      );
      shape.lineTo(
        zone.bounds.minX - WHEELHOUSE_ROOF_OVERHANG,
        frontSideZ + diagonalInset,
      );
      shape.closePath();
      const geometry = new ExtrudeGeometry(shape, {
        depth: ROOM_ROOF_THICKNESS,
        bevelEnabled: false,
        steps: 1,
      });
      geometry.rotateX(Math.PI / 2);
      const roof = new Mesh(geometry, materials.paintedSteel);
      roof.name = 'wheelhouse-roof';
      roof.position.y = wallTopY + ROOM_ROOF_THICKNESS;
      roof.castShadow = true;
      roof.receiveShadow = true;
      root.add(roof);
      geometries.add(geometry);
      return;
    }
    addBlock(root, geometries, shellColliders, {
      name: `${zone.id}-roof`,
      size: [
        width,
        ROOM_ROOF_THICKNESS,
        length,
      ],
      position: [
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        wallTopY + ROOM_ROOF_THICKNESS / 2,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ],
      material: zone.id === 'storageWorkroom'
        ? materials.plainPaintedSteel
        : materials.paintedSteel,
    });
  });
}

interface BalconyRun {
  readonly edge: WallEdge;
  readonly index: number;
  readonly size: readonly [number, number];
  readonly position: readonly [number, number];
}

function balconyDeckTopY(zoneId: ShipZoneId): number {
  return FREIGHTER_DIMENSIONS.deckY
    + roomWallHeight(zoneId)
    + ROOM_ROOF_THICKNESS
    + BALCONY_DECK_THICKNESS;
}

function balconyRuns(
  balcony: ShipBalconySpec,
  zone: ShipZoneSpec,
): readonly BalconyRun[] {
  const { bounds } = zone;
  const width = bounds.maxX - bounds.minX;
  const length = bounds.maxZ - bounds.minZ;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const openingZ = balcony.edge === 'aft'
    ? bounds.minZ + BALCONY_RAIL_MEMBER_THICKNESS / 2
    : bounds.maxZ - BALCONY_RAIL_MEMBER_THICKNESS / 2;
  const oppositeEdge: ShipTransverseEdge = balcony.edge === 'aft' ? 'forward' : 'aft';
  const oppositeZ = balcony.edge === 'aft'
    ? bounds.maxZ - BALCONY_RAIL_MEMBER_THICKNESS / 2
    : bounds.minZ + BALCONY_RAIL_MEMBER_THICKNESS / 2;
  const openingHalfWidth = balcony.openingWidth / 2;
  const leftWidth = -openingHalfWidth - bounds.minX;
  const rightWidth = bounds.maxX - openingHalfWidth;

  return [
    {
      edge: 'port',
      index: 0,
      size: [
        BALCONY_RAIL_MEMBER_THICKNESS,
        length - BALCONY_RAIL_MEMBER_THICKNESS * 2,
      ],
      position: [bounds.minX + BALCONY_RAIL_MEMBER_THICKNESS / 2, centerZ],
    },
    {
      edge: 'starboard',
      index: 0,
      size: [
        BALCONY_RAIL_MEMBER_THICKNESS,
        length - BALCONY_RAIL_MEMBER_THICKNESS * 2,
      ],
      position: [bounds.maxX - BALCONY_RAIL_MEMBER_THICKNESS / 2, centerZ],
    },
    {
      edge: oppositeEdge,
      index: 0,
      size: [width, BALCONY_RAIL_MEMBER_THICKNESS],
      position: [(bounds.minX + bounds.maxX) / 2, oppositeZ],
    },
    {
      edge: balcony.edge,
      index: 0,
      size: [leftWidth, BALCONY_RAIL_MEMBER_THICKNESS],
      position: [bounds.minX + leftWidth / 2, openingZ],
    },
    {
      edge: balcony.edge,
      index: 1,
      size: [rightWidth, BALCONY_RAIL_MEMBER_THICKNESS],
      position: [openingHalfWidth + rightWidth / 2, openingZ],
    },
  ];
}

function addBalconyPosts(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  balcony: ShipBalconySpec,
  runs: readonly BalconyRun[],
  deckTopY: number,
): void {
  const positions: Array<{
    edge: WallEdge;
    alongX: boolean;
    x: number;
    z: number;
  }> = [];
  runs.forEach((run) => {
    const alongX = run.edge === 'aft' || run.edge === 'forward';
    const length = alongX ? run.size[0] : run.size[1];
    const count = Math.max(1, Math.ceil(length / BALCONY_RAIL_POST_SPACING));
    for (let index = 0; index <= count; index += 1) {
      const amount = index / count - 0.5;
      const x = run.position[0] + (alongX ? length * amount : 0);
      const z = run.position[1] + (alongX ? 0 : length * amount);
      const sharedCorner = positions.find((position) =>
        position.alongX !== alongX
        && Math.abs(position.x - x) <= BALCONY_RAIL_MEMBER_THICKNESS
        && Math.abs(position.z - z) <= BALCONY_RAIL_MEMBER_THICKNESS);
      if (sharedCorner) {
        sharedCorner.x = alongX ? sharedCorner.x : x;
        sharedCorner.z = alongX ? z : sharedCorner.z;
        continue;
      }
      const duplicate = positions.some((position) =>
        Math.abs(position.x - x) < 1e-8 && Math.abs(position.z - z) < 1e-8);
      if (!duplicate) positions.push({ edge: run.edge, alongX, x, z });
    }
  });

  const postHeight =
    balcony.railHeight - balcony.coamingHeight - BALCONY_RAIL_MEMBER_THICKNESS;
  positions.forEach((position, index) => {
    addBlock(root, geometries, shellColliders, {
      name: `balcony:${balcony.id}:post:${position.edge}:${index}`,
      size: [
        BALCONY_RAIL_MEMBER_THICKNESS,
        postHeight,
        BALCONY_RAIL_MEMBER_THICKNESS,
      ],
      position: [
        position.x,
        deckTopY + balcony.coamingHeight + postHeight / 2,
        position.z,
      ],
      material: materials.darkMetal,
    });
  });
}

function addRoofBalconies(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.balconies.forEach((balcony) => {
    const zone = requiredZone(layout, balcony.zoneId);
    const width = zone.bounds.maxX - zone.bounds.minX;
    const length = zone.bounds.maxZ - zone.bounds.minZ;
    const deckTopY = balconyDeckTopY(zone.id);
    addBlock(root, geometries, shellColliders, {
      name: `balcony:${balcony.id}:deck`,
      size: [width, BALCONY_DECK_THICKNESS, length],
      position: [
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        deckTopY - BALCONY_DECK_THICKNESS / 2,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ],
      material: materials.timberFloor,
    });

    const runs = balconyRuns(balcony, zone);
    runs.forEach((run) => {
      addBlock(root, geometries, shellColliders, {
        name: `balcony:${balcony.id}:coaming:${run.edge}:${run.index}`,
        size: [run.size[0], balcony.coamingHeight, run.size[1]],
        position: [
          run.position[0],
          deckTopY + balcony.coamingHeight / 2,
          run.position[1],
        ],
        material: materials.darkMetal,
      });
      addBlock(root, geometries, shellColliders, {
        name: `balcony:${balcony.id}:top-rail:${run.edge}:${run.index}`,
        size: [run.size[0], BALCONY_RAIL_MEMBER_THICKNESS, run.size[1]],
        position: [
          run.position[0],
          deckTopY + balcony.railHeight - BALCONY_RAIL_MEMBER_THICKNESS / 2,
          run.position[1],
        ],
        material: materials.darkMetal,
      });
      shellColliders.push(toCollisionBox(
        [
          run.position[0],
          deckTopY + balcony.railHeight / 2,
          run.position[1],
        ],
        [run.size[0], balcony.railHeight, run.size[1]],
      ));
    });
    addBalconyPosts(
      root,
      geometries,
      shellColliders,
      materials,
      balcony,
      runs,
      deckTopY,
    );
  });
}

function orderedEntryArea(
  centerX: number,
  halfWidth: number,
  firstZ: number,
  secondZ: number,
): LadderEntryArea {
  return Object.freeze({
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minZ: Math.min(firstZ, secondZ),
    maxZ: Math.max(firstZ, secondZ),
  });
}

function resolvedClimbZone(
  ladder: ShipLadderSpec,
  balcony: ShipBalconySpec,
  wallZ: number,
  ladderZ: number,
  outwardZ: number,
  topFloorY: number,
): LadderClimbZone {
  const halfEntryWidth = Math.min(
    ladder.width / 2,
    balcony.openingWidth / 2 - PLAYER_LAYOUT_RADIUS,
  );
  const bottomEntry = orderedEntryArea(
    ladder.centerX,
    halfEntryWidth,
    ladderZ + outwardZ * 0.05,
    ladderZ + outwardZ * LADDER_ENTRY_DEPTH,
  );
  const topEntry = orderedEntryArea(
    ladder.centerX,
    halfEntryWidth,
    wallZ - outwardZ * 0.05,
    wallZ - outwardZ * LADDER_ENTRY_DEPTH,
  );
  const bottomDismount = Object.freeze([
    ladder.centerX,
    ladderZ + outwardZ * LADDER_DISMOUNT_DISTANCE,
  ]) as readonly [number, number];
  const topDismount = Object.freeze([
    ladder.centerX,
    wallZ - outwardZ * LADDER_DISMOUNT_DISTANCE,
  ]) as readonly [number, number];
  return Object.freeze({
    id: ladder.id,
    climbX: ladder.centerX,
    climbZ: ladderZ + outwardZ * LADDER_CLIMB_CLEARANCE,
    outwardX: 0,
    outwardZ,
    bottomEyeY: FREIGHTER_DIMENSIONS.deckY + PLAYER_BODY_HEIGHT,
    topEyeY: topFloorY + PLAYER_BODY_HEIGHT,
    bottomEntry,
    topEntry,
    bottomDismount,
    topDismount,
  });
}

function addLadders(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly LadderClimbZone[] {
  const climbZones = layout.ladders.map((ladderSpec) => {
    const zone = requiredZone(layout, ladderSpec.zoneId);
    const balcony = layout.balconies.find(({ ladderId }) => ladderId === ladderSpec.id);
    if (!balcony) throw new Error(`Ship geometry requires balcony for ${ladderSpec.id}`);
    const outwardZ = ladderSpec.edge === 'aft' ? -1 : 1;
    const wallZ = ladderSpec.edge === 'aft' ? zone.bounds.minZ : zone.bounds.maxZ;
    const ladderZ = wallZ + outwardZ * ladderSpec.wallOffset;
    const bottomFloorY = FREIGHTER_DIMENSIONS.deckY;
    const topFloorY = balconyDeckTopY(zone.id);
    const ladderHeight = topFloorY - bottomFloorY;
    const ladder = new Group();
    ladder.name = `ladder:${ladderSpec.id}`;
    ladder.position.set(ladderSpec.centerX, 0, ladderZ);
    root.add(ladder);

    ([-1, 1] as const).forEach((side, index) => {
      const sideName = index === 0 ? 'port' : 'starboard';
      const x = side * ladderSpec.width / 2;
      addBlock(ladder, geometries, [], {
        name: `${ladder.name}:side-rail:${sideName}`,
        size: [LADDER_RAIL_WIDTH, ladderHeight, LADDER_RAIL_DEPTH],
        position: [x, bottomFloorY + ladderHeight / 2, 0],
        material: materials.darkMetal,
      });
      addBlock(ladder, geometries, [], {
        name: `${ladder.name}:grab-rail:${sideName}`,
        size: [LADDER_RAIL_WIDTH, LADDER_GRAB_RISE, LADDER_RAIL_DEPTH],
        position: [x, topFloorY + LADDER_GRAB_RISE / 2, 0],
        material: materials.exposedMetal,
      });
      for (let bracketIndex = 0; bracketIndex < 3; bracketIndex += 1) {
        const y = bottomFloorY + ladderHeight * ((bracketIndex + 1) / 4);
        addBlock(ladder, geometries, [], {
          name: `${ladder.name}:bracket:${sideName}:${bracketIndex}`,
          size: [LADDER_RAIL_WIDTH, LADDER_RAIL_WIDTH, ladderSpec.wallOffset],
          position: [x, y, -outwardZ * ladderSpec.wallOffset / 2],
          material: materials.exposedMetal,
        });
      }
    });

    const rungCount = Math.floor(ladderHeight / ladderSpec.rungSpacing);
    for (let index = 0; index <= rungCount; index += 1) {
      const y = bottomFloorY + Math.min(index * ladderSpec.rungSpacing, ladderHeight);
      addBlock(ladder, geometries, [], {
        name: `${ladder.name}:rung:${index}`,
        size: [
          ladderSpec.width - LADDER_RAIL_WIDTH,
          LADDER_RUNG_HEIGHT,
          LADDER_RUNG_DEPTH,
        ],
        position: [0, y, 0],
        material: materials.darkMetal,
      });
    }

    return resolvedClimbZone(
      ladderSpec,
      balcony,
      wallZ,
      ladderZ,
      outwardZ,
      topFloorY,
    );
  });
  return Object.freeze(climbZones);
}

function addWheelhouseInteriorDetails(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const wheelhouseWidth = wheelhouse.maxX - wheelhouse.minX;
  const centerX = (wheelhouse.minX + wheelhouse.maxX) / 2;
  const centerZ = (wheelhouse.minZ + wheelhouse.maxZ) / 2;
  const interiorAftZ = wheelhouse.minZ + WALL_THICKNESS + 0.015;
  const interiorStarboardX = wheelhouse.maxX - WALL_THICKNESS - 0.015;
  const deckY = FREIGHTER_DIMENSIONS.deckY;

  const details = new Group();
  details.name = 'wheelhouse-interior-details';
  root.add(details);

  const chart = new Group();
  chart.name = 'captain-detail:chart';
  chart.position.set(wheelhouse.minX + wheelhouseWidth * 0.173, deckY + 1.96, interiorAftZ);
  chart.rotation.y = Math.PI;
  details.add(chart);
  const chartShape = new Shape();
  chartShape.moveTo(-0.52, -0.34);
  chartShape.lineTo(0.49, -0.31);
  chartShape.lineTo(0.53, 0.35);
  chartShape.lineTo(-0.46, 0.32);
  chartShape.closePath();
  const chartGeometry = new ShapeGeometry(chartShape);
  geometries.add(chartGeometry);
  const chartPaper = new Mesh(chartGeometry, materials.paintedPanel);
  chartPaper.name = `${chart.name}:paper`;
  chart.add(chartPaper);
  [-0.2, 0.03, 0.25].forEach((x, index) => {
    const course = addBlock(chart, geometries, [], {
      name: `${chart.name}:course-${index + 1}`,
      size: [0.025, 0.48 - index * 0.07, 0.012],
      position: [x, index * 0.025, 0.012],
      material: materials.darkMetal,
    });
    course.rotation.z = 0.65 + index * 0.22;
  });

  const coat = new Group();
  coat.name = 'captain-detail:coat';
  coat.position.set(
    centerX + wheelhouseWidth * 0.223,
    deckY + 1.83,
    interiorAftZ,
  );
  coat.rotation.y = Math.PI;
  details.add(coat);
  const coatShape = new Shape();
  coatShape.moveTo(-0.18, 0.52);
  coatShape.lineTo(0.2, 0.52);
  coatShape.lineTo(0.55, 0.18);
  coatShape.lineTo(0.34, 0.02);
  coatShape.lineTo(0.42, -0.58);
  coatShape.lineTo(-0.4, -0.58);
  coatShape.lineTo(-0.31, 0.02);
  coatShape.lineTo(-0.55, 0.18);
  coatShape.closePath();
  const coatGeometry = new ShapeGeometry(coatShape);
  geometries.add(coatGeometry);
  const coatMesh = new Mesh(coatGeometry, materials.canvas);
  coatMesh.name = `${coat.name}:cloth`;
  coatMesh.castShadow = true;
  coat.add(coatMesh);

  const keys = new Group();
  keys.name = 'captain-detail:key-hooks';
  keys.position.set(
    centerX + wheelhouseWidth * 0.347,
    deckY + 2,
    interiorAftZ,
  );
  keys.rotation.y = Math.PI;
  details.add(keys);
  addBlock(keys, geometries, [], {
    name: `${keys.name}:rail`,
    size: [0.62, 0.08, 0.06],
    position: [0, 0.18, 0],
    material: materials.plainTimber,
  });
  [-0.2, 0, 0.21].forEach((x, index) => {
    addBlock(keys, geometries, [], {
      name: `${keys.name}:key-${index + 1}`,
      size: [0.035, 0.26 - index * 0.03, 0.03],
      position: [x, 0.02, 0.04],
      material: materials.exposedMetal,
    });
  });

  const repairedPanel = new Group();
  repairedPanel.name = 'captain-detail:repaired-panel';
  repairedPanel.position.set(
    interiorStarboardX,
    deckY + 1.9,
    centerZ - (wheelhouse.maxZ - wheelhouse.minZ) * 0.01,
  );
  details.add(repairedPanel);
  addBlock(repairedPanel, geometries, [], {
    name: `${repairedPanel.name}:plate`,
    size: [0.055, 0.78, 0.92],
    position: [0, 0, 0],
    material: materials.plainPaintedSteel,
  });
  [-0.32, 0.32].forEach((y, yIndex) => [-0.4, 0.4].forEach((z, zIndex) => {
    addBlock(repairedPanel, geometries, [], {
      name: `${repairedPanel.name}:fastener-${yIndex}-${zIndex}`,
      size: [0.035, 0.055, 0.055],
      position: [-0.045, y, z],
      material: materials.rust,
    });
  }));
}

function addExteriorConstructionDetails(
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const bowCenterZ = cargo.maxZ - END_CAP_DEPTH;
  const sternCenterZ = cargo.minZ + END_CAP_DEPTH;

  const stemHeight = 1.4;
  const stemGeometry = new CylinderGeometry(0.2, 0.46, stemHeight, 4);
  const stem = new Mesh(stemGeometry, materials.exposedMetal);
  stem.name = 'bow-stem';
  stem.position.set(0, STRUCTURAL_DECK_TOP_Y - stemHeight / 2, cargo.maxZ - 0.18);
  stem.rotation.y = Math.PI / 4;
  stem.castShadow = true;
  stem.receiveShadow = true;
  root.add(stem);
  geometries.add(stemGeometry);
  shellColliders.push(toCollisionBox(
    [stem.position.x, stem.position.y, stem.position.z],
    [0.92, stemHeight, 0.92],
  ));

  addBlock(root, geometries, shellColliders, {
    name: 'stern-transom',
    size: [5.4, 1.08, 0.42],
    position: [0, 1.59, cargo.minZ + 0.16],
    material: materials.upperHull,
    collider: true,
  });
  addBlock(root, geometries, shellColliders, {
    name: 'stern-transom-waterline',
    size: [4.3, 0.18, 0.48],
    position: [0, 1.18, cargo.minZ + 0.12],
    material: materials.waterline,
  });

  const hatch = layout.deckHatch;
  const hatchBounds = deckHatchRect(hatch);
  addRotatedBlock(root, geometries, shellColliders, {
    name: hatch.id,
    size: hatch.size,
    position: [
      hatch.position[0],
      hatch.position[1] + hatch.size[1] / 2,
      hatch.position[2],
    ],
    material: materials.darkMetal,
  }, hatch.rotationY);
  shellColliders.push({
    minX: hatchBounds.minX,
    maxX: hatchBounds.maxX,
    minY: hatch.position[1],
    maxY: hatch.position[1] + hatch.colliderSize[1],
    minZ: hatchBounds.minZ,
    maxZ: hatchBounds.maxZ,
  });
  addRotatedBlock(root, geometries, shellColliders, {
    name: 'deck-hatch-timber-panel',
    size: [
      Math.max(0.1, hatch.size[0] - 0.27),
      0.04,
      Math.max(0.1, hatch.size[2] - 0.3),
    ],
    position: [
      hatch.position[0],
      hatch.position[1] + hatch.size[1] + 0.02,
      hatch.position[2],
    ],
    material: materials.plainTimber,
  }, hatch.rotationY);

  const hawseGeometry = new RingGeometry(0.24, 0.38, 16);
  geometries.add(hawseGeometry);
  const hawseX = (cargo.maxX - cargo.minX) * 0.26;
  const hawseZ = bowCenterZ + END_CAP_DEPTH * Math.sqrt(
    1 - (hawseX / ((cargo.maxX - cargo.minX) / 2)) ** 2,
  ) - 0.08;
  ([
    ['port', -hawseX],
    ['starboard', hawseX],
  ] as const).forEach(([side, x]) => {
    const hawse = new Mesh(hawseGeometry, materials.darkMetal);
    hawse.name = `anchor-hawse-${side}`;
    hawse.position.set(x, 1.72, hawseZ);
    hawse.castShadow = true;
    hawse.receiveShadow = true;
    root.add(hawse);
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
  const stackShaftBaseY = stackBaseY + STACK_COLLAR_HEIGHT;
  const stackHeight = STACK_OUTLET_Y - stackShaftBaseY;
  const stackCenterY = stackShaftBaseY + stackHeight / 2;
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
  const minZ = cargo.minZ + END_CAP_DEPTH;
  const maxZ = cargo.maxZ - END_CAP_DEPTH;
  const opening = layout.rail.starboardOpening;
  const gapMinZ = opening.centerZ - opening.width / 2;
  const gapMaxZ = opening.centerZ + opening.width / 2;
  addRailSegment(root, geometries, shellColliders, materials, 'port', minZ, maxZ, layout);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', minZ, gapMinZ, layout);
  addRailSegment(root, geometries, shellColliders, materials, 'starboard', gapMaxZ, maxZ, layout);
  addCurvedEndRail(root, geometries, shellColliders, arcColliders, materials, 'bow', maxZ, layout);
  addCurvedEndRail(root, geometries, shellColliders, arcColliders, materials, 'stern', minZ, layout);
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
    false,
    HULL_BOTTOM_TAPER,
  );
  addRoundedPrism(
    root,
    geometries,
    shellColliders,
    'upper-hull',
    FREIGHTER_DIMENSIONS.width + 0.04,
    FREIGHTER_DIMENSIONS.length + 0.04,
    UPPER_HULL_HEIGHT,
    UPPER_HULL_TOP_Y,
    materials.upperHull,
    false,
    UPPER_HULL_BOTTOM_TAPER,
  );
  addRoundedPrism(
    root,
    geometries,
    shellColliders,
    'waterline-band',
    (FREIGHTER_DIMENSIONS.width + 0.04) * UPPER_HULL_BOTTOM_TAPER.widthScale + 0.08,
    (FREIGHTER_DIMENSIONS.length + 0.04) * UPPER_HULL_BOTTOM_TAPER.lengthScale + 0.08,
    WATERLINE_HEIGHT,
    WATERLINE_TOP_Y,
    materials.waterline,
    false,
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
    materials.timberFloor,
    false,
  );
  addFinishedFloors(root, geometries, materials, layout);

  addWallSegments(root, geometries, shellColliders, materials, layout);
  addWheelhouseFacade(root, geometries, materials, layout);
  addPortholeDetails(root, geometries, materials, layout);
  addRoomRoofs(root, geometries, shellColliders, materials, layout);
  addRoofBalconies(root, geometries, shellColliders, materials, layout);
  const climbZones = addLadders(root, geometries, materials, layout);
  addWheelhouseInteriorDetails(root, geometries, materials, layout);
  addExteriorConstructionDetails(root, geometries, shellColliders, materials, layout);

  const stackOutlets = addMachineryAndStacks(root, geometries, shellColliders, materials, layout);
  addRails(root, geometries, shellColliders, arcColliders, materials, layout);

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
      halfWidth: DECK_WIDTH / 2,
      halfLength: DECK_LENGTH / 2,
      taperStart: DECK_LENGTH / 2 - END_CAP_DEPTH,
      minimumLocalY: HULL_TOP_Y - HULL_HEIGHT,
      heightProfile: {
        lowerHalfWidth: DECK_WIDTH / 2 * HULL_EXCLUSION_LOWER_SCALE.width,
        lowerHalfLength: Math.round(
          DECK_LENGTH / 2 * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
        lowerTaperStart: Math.round(
          (DECK_LENGTH / 2 - END_CAP_DEPTH) * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
        upperLocalY: HULL_TOP_Y,
      },
    },
    stackOutlets,
    climbZones,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
