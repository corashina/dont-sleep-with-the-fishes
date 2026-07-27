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
import type { WaterExclusionHeightProfile } from '../ocean/WaterExclusion';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
  deckHatchRect,
} from './ShipLayout';
import type { ShipDoorSpec, ShipLayoutSpec, ShipZoneId, ShipZoneSpec } from './ShipLayout';
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
  disposeGeometry(): void;
}

const HALF_WIDTH = FREIGHTER_DIMENSIONS.width / 2;
const HALF_LENGTH = FREIGHTER_DIMENSIONS.length / 2;
const ROOM_WALL_HEIGHT = SHIP_ROOM_WALL_HEIGHT;

const DECK_WIDTH = FREIGHTER_DIMENSIONS.width - 0.5;
const DECK_LENGTH = FREIGHTER_DIMENSIONS.length - 2;
const END_CAP_DEPTH = 5.2;
const HULL_HEIGHT = 1.65;
const HULL_TOP_Y = 1.98;
const HULL_BOTTOM_TAPER = { widthScale: 0.72, lengthScale: 0.95 } as const;
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
const WINDOW_PILLAR_WIDTH = 0.28;
const WINDOW_GLASS_THICKNESS = 0.035;
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
    rectangularFloorShape(lifeboat.minX, lifeboat.maxX, lifeboat.minZ, lifeboat.maxZ),
    materials.timberFloor,
  );

  const stripeOuterInset = 0.1;
  const stripeWidth = 0.2;
  const stripeShape = rectangularFloorShape(
    lifeboat.minX + stripeOuterInset,
    lifeboat.maxX,
    lifeboat.minZ + stripeOuterInset,
    lifeboat.maxZ - stripeOuterInset,
  );
  stripeShape.holes.push(rectangularFloorHole(
    lifeboat.minX + stripeOuterInset + stripeWidth,
    lifeboat.maxX - stripeWidth,
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
    if (segment.zoneId !== 'wheelhouse') {
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
      return;
    }
    const full = segmentColliderTransform(
      segment,
      ROOM_WALL_HEIGHT,
      wallBottomY + ROOM_WALL_HEIGHT / 2,
    );
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
    if (segment.edge !== 'forward') {
      addBlock(root, geometries, shellColliders, {
        name: `${name}-window-0`,
        ...segmentTransform(segment, windowHeight, wallBottomY + WINDOW_SILL_HEIGHT + windowHeight / 2, WINDOW_GLASS_THICKNESS),
        material: materials.glass,
      });
    }
  });

  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const innerMinX = wheelhouse.minX + WALL_THICKNESS;
  const innerMaxX = wheelhouse.maxX - WALL_THICKNESS;
  const innerWidth = innerMaxX - innerMinX;
  const windowWidth = (innerWidth - WINDOW_PILLAR_WIDTH * 4) / 3;
  const windowHeight = ROOM_WALL_HEIGHT - WINDOW_SILL_HEIGHT - WINDOW_HEADER_HEIGHT;
  for (let pillar = 0; pillar < 4; pillar += 1) {
    const x = innerMinX + WINDOW_PILLAR_WIDTH / 2
      + pillar * (windowWidth + WINDOW_PILLAR_WIDTH);
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-front-pillar-${pillar}`,
      size: [WINDOW_PILLAR_WIDTH, windowHeight, WALL_THICKNESS],
      position: [
        x,
        wallBottomY + WINDOW_SILL_HEIGHT + windowHeight / 2,
        wheelhouse.maxZ - WALL_HALF_THICKNESS,
      ],
      material: materials.paintedSteel,
    });
  }
  for (let pane = 0; pane < 3; pane += 1) {
    addBlock(root, geometries, shellColliders, {
      name: `wheelhouse-front-window-${pane}`,
      size: [windowWidth, windowHeight, WINDOW_GLASS_THICKNESS],
      position: [
        innerMinX + WINDOW_PILLAR_WIDTH + windowWidth / 2
          + pane * (windowWidth + WINDOW_PILLAR_WIDTH),
        wallBottomY + WINDOW_SILL_HEIGHT + windowHeight / 2,
        wheelhouse.maxZ - WALL_HALF_THICKNESS,
      ],
      material: materials.glass,
    });
  }
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

function addFocalSuperstructureDetails(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const deckY = FREIGHTER_DIMENSIONS.deckY;
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const wheelhouseWidth = wheelhouse.maxX - wheelhouse.minX;
  const renderedFrontWallCenterZ = wheelhouse.maxZ - WALL_HALF_THICKNESS;
  const renderedFrontWallOuterFaceZ = renderedFrontWallCenterZ + WALL_HALF_THICKNESS;
  addBlock(root, geometries, [], {
    name: 'wheelhouse-front-sill-band',
    size: [wheelhouseWidth - 0.3, 0.09, 0.1],
    position: [
      (wheelhouse.minX + wheelhouse.maxX) / 2,
      deckY + WINDOW_SILL_HEIGHT + 0.045,
      renderedFrontWallOuterFaceZ + 0.05,
    ],
    material: materials.darkMetal,
  });
  ([
    ['port', wheelhouse.minX + 0.2],
    ['starboard', wheelhouse.maxX - 0.2],
  ] as const).forEach(([side, x]) => {
    addBlock(root, geometries, [], {
      name: `wheelhouse-header-bracket-${side}`,
      size: [0.24, 0.4, 0.16],
      position: [
        x,
        deckY + ROOM_WALL_HEIGHT - WINDOW_HEADER_HEIGHT - 0.12,
        renderedFrontWallOuterFaceZ + 0.08,
      ],
      material: materials.darkMetal,
    });
  });
  for (let index = 0; index < 5; index += 1) {
    addBlock(root, geometries, [], {
      name: `wheelhouse-front-fastener-${index + 1}`,
      size: [0.055, 0.055, 0.035],
      position: [
        wheelhouse.minX + 0.35 + (wheelhouseWidth - 0.7) * (index / 4),
        deckY + WINDOW_SILL_HEIGHT + 0.12,
        renderedFrontWallOuterFaceZ + 0.0175,
      ],
      material: materials.exposedMetal,
    });
  }
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
  );
  addRoundedPrism(
    root,
    geometries,
    shellColliders,
    'waterline-band',
    FREIGHTER_DIMENSIONS.width + 0.08,
    FREIGHTER_DIMENSIONS.length + 0.08,
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
  addPortholeDetails(root, geometries, materials, layout);
  addRoomRoofs(root, geometries, shellColliders, materials, layout);
  addFocalSuperstructureDetails(root, geometries, materials, layout);
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
        lowerHalfWidth: DECK_WIDTH / 2 * HULL_BOTTOM_TAPER.widthScale,
        lowerHalfLength: Math.round(
          DECK_LENGTH / 2 * HULL_BOTTOM_TAPER.lengthScale * 1000,
        ) / 1000,
        lowerTaperStart: Math.round(
          (DECK_LENGTH / 2 - END_CAP_DEPTH) * HULL_BOTTOM_TAPER.lengthScale * 1000,
        ) / 1000,
        upperLocalY: HULL_TOP_Y,
      },
    },
    stackOutlets,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
