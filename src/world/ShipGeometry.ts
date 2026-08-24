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
  Vector3,
} from 'three';
import {
  PLAYER_BODY_HEIGHT,
  type CollisionArc,
  type CollisionBox,
} from '../player/collisions';
import type { LadderClimbZone, LadderEntryArea } from '../player/LadderTraversal';
import {
  SHIP_LAYOUT,
  SHIP_ROOF_ENGINE,
  SHIP_STERN_CHAMFER,
  SHIP_WHEELHOUSE_CHAMFER_SIZE,
} from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_ROOM_ROOF_THICKNESS,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
  SHIP_TRANSVERSE_PORTHOLE_CENTER_X,
  type ShipBalconySpec,
  type ShipDoorSpec,
  type ShipLadderSpec,
  type ShipLayoutSpec,
  type ShipTransverseEdge,
  type ShipZoneId,
  type ShipZoneSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import {
  addBlock,
  addCylinder,
  addRotatedBlock,
  applyRoofPlanarUvs,
  applyWallPlanarUvs,
  createWallBoxGeometry,
  roundedBowPoint,
  toCollisionBox,
  toOrientedCollisionBox,
  type ShipBlockOptions,
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';
import { addShipHull, type ShipHullWaterExclusion } from './ShipHullGeometry';

export interface ShipGeometryBuild {
  root: Group;
  shellColliders: CollisionBox[];
  arcColliders: CollisionArc[];
  zoneCenters: ReadonlyMap<ShipZoneId, Vector3>;
  waterExclusion: ShipHullWaterExclusion;
  stackOutlets: readonly [Vector3, Vector3];
  climbZones: readonly LadderClimbZone[];
  disposeGeometry(): void;
}

const ROOM_WALL_HEIGHT = SHIP_ROOM_WALL_HEIGHT;

const BOW_DEPTH = 8.5;
const STRUCTURAL_DECK_TOP_Y = 2.18;
const FINISHED_FLOOR_Y = FREIGHTER_DIMENSIONS.deckY;
const WALL_THICKNESS = SHIP_ROOM_WALL_THICKNESS;
const WALL_HALF_THICKNESS = WALL_THICKNESS / 2;
const ROOM_SEAM_OVERLAP = 0.01;
const DOOR_FRAME_WIDTH = 0.16;
const DOOR_FRAME_DEPTH = WALL_THICKNESS + 0.16;
const DOOR_FRAME_CLEAR_HEIGHT = 2.35;
const WINDOW_SILL_HEIGHT = 0.82;
const WINDOW_HEADER_HEIGHT = 0.52;
const WINDOW_GLASS_THICKNESS = 0.035;
const WHEELHOUSE_ROOF_OVERHANG = 0.28;
const WHEELHOUSE_FRAME_WIDTH = 0.18;
const PORTHOLE_CENTER_HEIGHT = PLAYER_BODY_HEIGHT;
const PORTHOLE_OPENING_RADIUS = 0.48;
const PORTHOLE_GLASS_RADIUS = 0.46;
const PORTHOLE_GASKET_OUTER_RADIUS = 0.51;
const PORTHOLE_FRAME_OUTER_RADIUS = 0.66;
const PORTHOLE_BOLT_RADIUS = 0.045;
const PORTHOLE_BOLT_ORBIT = 0.575;
const PORTHOLE_SEGMENTS = 24;
const STACK_X = 1.35;
const STACK_SHAFT_HEIGHT = 3.5;
const STACK_RADIUS = 0.58;
const STACK_COLLAR_RADIUS = 0.72;
const STACK_COLLAR_HEIGHT = 0.22;

const BALCONY_RAIL_MEMBER_THICKNESS = 0.12;

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
const RAIL_END_SEGMENTS = 12;
function requiredZone(layout: ShipLayoutSpec, id: ShipZoneId): ShipZoneSpec {
  const zone = layout.zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Ship geometry requires zone ${id}`);
  return zone;
}

type WallEdge = 'port' | 'starboard' | 'aft' | 'forward';

interface WallSegmentSpec {
  readonly zoneId: 'crewCabin' | 'wheelhouse' | 'storageWorkroom';
  readonly edge: WallEdge;
  readonly orientation: 'x' | 'z';
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  readonly sealMin: boolean;
  readonly sealMax: boolean;
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
  { zoneId: 'crewCabin', edge: 'aft', index: 1, centerX: -SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'crewCabin', edge: 'aft', index: 2, centerX: SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'crewCabin', edge: 'forward', index: 1, centerX: -SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'crewCabin', edge: 'forward', index: 2, centerX: SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'storageWorkroom', edge: 'aft', index: 1, centerX: -SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'storageWorkroom', edge: 'aft', index: 2, centerX: SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'storageWorkroom', edge: 'forward', index: 1, centerX: -SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
  { zoneId: 'storageWorkroom', edge: 'forward', index: 2, centerX: SHIP_TRANSVERSE_PORTHOLE_CENTER_X },
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
      .forEach((segment) => result.push({
        zoneId,
        edge: edge.edge,
        orientation: edge.orientation,
        fixed: edge.fixed,
        ...segment,
        sealMin: edge.orientation === 'x' && segment.min === edge.min,
        sealMax: edge.orientation === 'x' && segment.max === edge.max,
      })));
  });
  return result;
}

function segmentTransform(
  segment: WallSegmentSpec,
  height: number,
  centerY: number,
  thickness = WALL_THICKNESS,
): Pick<ShipBlockOptions, 'size' | 'position'> {
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
): Pick<ShipBlockOptions, 'size' | 'position'> {
  return segmentTransform(segment, height, centerY);
}

function roomWallHeight(_zoneId: ShipZoneId): number {
  return ROOM_WALL_HEIGHT;
}

function roomSurfaceMaterial(
  materials: ShipMaterials,
  zoneId: ShipZoneId,
): Material {
  return zoneId === 'storageWorkroom'
    ? materials.plainPaintedSteel
    : materials.paintedPanel;
}

function wallUvOffsets(
  segment: WallSegmentSpec,
  horizontalCenter: number,
  centerY: number,
): readonly [number, number] {
  return [
    segment.orientation === 'x' ? horizontalCenter : -horizontalCenter,
    centerY,
  ];
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
  const sealBefore = segment.sealMin ? ROOM_SEAM_OVERLAP : 0;
  const sealAfter = segment.sealMax ? ROOM_SEAM_OVERLAP : 0;
  const renderHeight = height + ROOM_SEAM_OVERLAP * 2;
  const renderLength = segment.max - segment.min + sealBefore + sealAfter;
  const horizontalCenter = (
    segment.min - sealBefore + segment.max + sealAfter
  ) / 2;
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
  applyWallPlanarUvs(
    geometry,
    ...wallUvOffsets(segment, horizontalCenter, wallBottomY + height / 2),
  );
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
  context: ShipGeometryBuildContext,
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
      return;
    }
    const height = roomWallHeight(segment.zoneId);
    const material = roomSurfaceMaterial(materials, segment.zoneId);
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
      const length = segment.max - segment.min;
      const wallCenterY = wallBottomY + height / 2;
      const sealBefore = segment.sealMin ? ROOM_SEAM_OVERLAP : 0;
      const sealAfter = segment.sealMax ? ROOM_SEAM_OVERLAP : 0;
      const renderLength = length + sealBefore + sealAfter;
      const horizontalCenter = (
        segment.min - sealBefore + segment.max + sealAfter
      ) / 2;
      const renderHeight = height + ROOM_SEAM_OVERLAP * 2;
      const geometry = createWallBoxGeometry(
        context,
        renderLength,
        renderHeight,
        WALL_THICKNESS,
        ...wallUvOffsets(segment, horizontalCenter, wallCenterY),
      );
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      const transform = segmentTransform(segment, height, wallCenterY);
      mesh.position.set(
        segment.orientation === 'x' ? horizontalCenter : transform.position[0],
        transform.position[1],
        segment.orientation === 'z' ? horizontalCenter : transform.position[2],
      );
      if (segment.orientation === 'z') mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  });
  wheelhousePaneSpecs(layout).forEach((spec) =>
    addWheelhousePaneColliders(shellColliders, spec, wallBottomY));
}

function addDoorFrames(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const jambHeight = DOOR_FRAME_CLEAR_HEIGHT;
  const jambCenterY = FINISHED_FLOOR_Y + jambHeight / 2;
  const headerCenterY = FINISHED_FLOOR_Y
    + DOOR_FRAME_CLEAR_HEIGHT
    + DOOR_FRAME_WIDTH / 2;

  layout.doors.forEach((door) => {
    const framePrefix = `door-frame:${door.id}`;
    const axisCenter = door.orientation === 'side' ? door.center[1] : door.center[0];
    const fixed = door.orientation === 'side' ? door.center[0] : door.center[1];
    const wallFixed = door.orientation === 'side'
      ? fixed + (door.side === 'port' ? WALL_HALF_THICKNESS : -WALL_HALF_THICKNESS)
      : fixed + WALL_HALF_THICKNESS;
    const hasFrame = door.zoneId !== 'wheelhouse';
    const jambOffsets = [
      -door.width / 2 + DOOR_FRAME_WIDTH / 2,
      door.width / 2 - DOOR_FRAME_WIDTH / 2,
    ] as const;

    if (hasFrame) {
      jambOffsets.forEach((offset, index) => {
        const position = door.orientation === 'side'
          ? [wallFixed, jambCenterY, axisCenter + offset] as const
          : [axisCenter + offset, jambCenterY, wallFixed] as const;
        const size = door.orientation === 'side'
          ? [DOOR_FRAME_DEPTH, jambHeight, DOOR_FRAME_WIDTH] as const
          : [DOOR_FRAME_WIDTH, jambHeight, DOOR_FRAME_DEPTH] as const;
        addBlock(context, root, {
          name: `${framePrefix}:jamb-${index === 0 ? 'left' : 'right'}`,
          size,
          position,
          material: materials.plainTimber,
        });
      });

      addBlock(context, root, {
        name: `${framePrefix}:header`,
        size: door.orientation === 'side'
          ? [DOOR_FRAME_DEPTH, DOOR_FRAME_WIDTH, door.width] as const
          : [door.width, DOOR_FRAME_WIDTH, DOOR_FRAME_DEPTH] as const,
        position: door.orientation === 'side'
          ? [wallFixed, headerCenterY, axisCenter] as const
          : [axisCenter, headerCenterY, wallFixed] as const,
        material: materials.plainTimber,
      });
    }

    const infillBottomY = FINISHED_FLOOR_Y
      + DOOR_FRAME_CLEAR_HEIGHT
      + (hasFrame ? DOOR_FRAME_WIDTH : 0);
    const wallTopY = FINISHED_FLOOR_Y + roomWallHeight(door.zoneId);
    const infillHeight = wallTopY - infillBottomY;
    const infillCenterY = infillBottomY + infillHeight / 2;
    const geometry = createWallBoxGeometry(
      context,
      door.width,
      infillHeight,
      WALL_THICKNESS,
      door.orientation === 'side' ? -axisCenter : axisCenter,
      infillCenterY,
    );
    const infill = new Mesh(
      geometry,
      roomSurfaceMaterial(materials, door.zoneId),
    );
    infill.name = `door-wall:${door.id}:header-infill`;
    infill.position.set(
      door.orientation === 'side' ? wallFixed : axisCenter,
      infillCenterY,
      door.orientation === 'side' ? axisCenter : wallFixed,
    );
    if (door.orientation === 'side') infill.rotation.y = Math.PI / 2;
    infill.castShadow = true;
    infill.receiveShadow = true;
    root.add(infill);
  });
}

interface WheelhousePaneSpec {
  readonly id: string;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly sealStart: boolean;
  readonly sealEnd: boolean;
}

function wheelhousePaneSpecs(layout: ShipLayoutSpec): readonly WheelhousePaneSpec[] {
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const portDoor = layout.doors.find((door) =>
    door.zoneId === 'wheelhouse' && door.orientation === 'side' && door.side === 'port')!;
  const aftDoor = layout.doors.find((door) =>
    door.zoneId === 'wheelhouse' && door.orientation === 'aft')!;
  const portDoorMinZ = portDoor.center[1] - portDoor.width / 2;
  const aftDoorMinX = aftDoor.center[0] - aftDoor.width / 2;
  const aftDoorMaxX = aftDoor.center[0] + aftDoor.width / 2;
  const frontSideZ = wheelhouse.maxZ - SHIP_WHEELHOUSE_CHAMFER_SIZE;
  const frontCenterMinX = wheelhouse.minX + SHIP_WHEELHOUSE_CHAMFER_SIZE;
  const frontCenterMaxX = wheelhouse.maxX - SHIP_WHEELHOUSE_CHAMFER_SIZE;

  return [
    {
      id: 'front-center',
      start: [frontCenterMinX, wheelhouse.maxZ],
      end: [frontCenterMaxX, wheelhouse.maxZ],
      sealStart: true,
      sealEnd: true,
    },
    {
      id: 'front-port-chamfer',
      start: [wheelhouse.minX, frontSideZ],
      end: [frontCenterMinX, wheelhouse.maxZ],
      sealStart: true,
      sealEnd: true,
    },
    {
      id: 'front-starboard-chamfer',
      start: [frontCenterMaxX, wheelhouse.maxZ],
      end: [wheelhouse.maxX, frontSideZ],
      sealStart: true,
      sealEnd: true,
    },
    {
      id: 'port-side',
      start: [wheelhouse.minX, wheelhouse.minZ],
      end: [wheelhouse.minX, portDoorMinZ],
      sealStart: false,
      sealEnd: false,
    },
    {
      id: 'starboard-side',
      start: [wheelhouse.maxX, frontSideZ],
      end: [wheelhouse.maxX, wheelhouse.minZ],
      sealStart: true,
      sealEnd: false,
    },
    {
      id: 'aft-port',
      start: [aftDoorMinX, wheelhouse.minZ],
      end: [wheelhouse.minX + WALL_THICKNESS, wheelhouse.minZ],
      sealStart: false,
      sealEnd: true,
    },
    {
      id: 'aft-starboard',
      start: [wheelhouse.maxX - WALL_THICKNESS, wheelhouse.minZ],
      end: [aftDoorMaxX, wheelhouse.minZ],
      sealStart: true,
      sealEnd: false,
    },
  ];
}

function addWheelhousePaneColliders(
  shellColliders: CollisionBox[],
  spec: WheelhousePaneSpec,
  wallBottomY: number,
): void {
  const dx = spec.end[0] - spec.start[0];
  const dz = spec.end[1] - spec.start[1];
  const length = Math.hypot(dx, dz);
  const isDiagonal = Math.abs(dx) > Number.EPSILON && Math.abs(dz) > Number.EPSILON;
  const rotationY = Math.atan2(-dz, dx);
  const normalX = Math.sin(rotationY);
  const normalZ = Math.cos(rotationY);
  const position = [
    (spec.start[0] + spec.end[0]) / 2 - normalX * WALL_HALF_THICKNESS,
    wallBottomY + ROOM_WALL_HEIGHT / 2,
    (spec.start[1] + spec.end[1]) / 2 - normalZ * WALL_HALF_THICKNESS,
  ] as const;
  const size = [length, ROOM_WALL_HEIGHT, WALL_THICKNESS] as const;
  shellColliders.push(isDiagonal
    ? toOrientedCollisionBox(position, size, rotationY)
    : toCollisionBox(position, [
      Math.abs(dx) + Math.abs(normalX) * WALL_THICKNESS,
      ROOM_WALL_HEIGHT,
      Math.abs(dz) + Math.abs(normalZ) * WALL_THICKNESS,
    ]));
}

function addWheelhousePane(
  context: ShipGeometryBuildContext,
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
  pane.rotation.y = Math.atan2(-dz, dx);
  facade.add(pane);
  const horizontalOffset = (
    pane.position.x * dx
    + pane.position.z * dz
  ) / width;

  ([
    ['sill', WINDOW_SILL_HEIGHT + ROOM_SEAM_OVERLAP, WINDOW_SILL_HEIGHT / 2 - ROOM_SEAM_OVERLAP / 2],
    ['header', WINDOW_HEADER_HEIGHT + ROOM_SEAM_OVERLAP, ROOM_WALL_HEIGHT - WINDOW_HEADER_HEIGHT / 2 + ROOM_SEAM_OVERLAP / 2],
  ] as const).forEach(([part, height, centerY]) => {
    const geometry = createWallBoxGeometry(
      context,
      width,
      height,
      WALL_THICKNESS,
      horizontalOffset,
      FREIGHTER_DIMENSIONS.deckY + centerY,
    );
    const mesh = new Mesh(geometry, materials.paintedPanel);
    mesh.name = `${pane.name}:${part}`;
    mesh.position.set(0, centerY, -WALL_HALF_THICKNESS);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pane.add(mesh);

    ([
      ['start', spec.sealStart, -1],
      ['end', spec.sealEnd, 1],
    ] as const).forEach(([end, sealed, direction]) => {
      if (!sealed) return;
      const sealCenterX = direction * (width / 2 + ROOM_SEAM_OVERLAP / 2);
      const sealGeometry = createWallBoxGeometry(
        context,
        ROOM_SEAM_OVERLAP,
        height,
        WALL_THICKNESS - ROOM_SEAM_OVERLAP,
        horizontalOffset + sealCenterX,
        FREIGHTER_DIMENSIONS.deckY + centerY,
      );
      const seal = new Mesh(sealGeometry, materials.paintedPanel);
      seal.name = `${pane.name}:${part}-seal-${end}`;
      seal.position.set(
        sealCenterX,
        centerY,
        -(WALL_THICKNESS + ROOM_SEAM_OVERLAP) / 2,
      );
      seal.castShadow = true;
      seal.receiveShadow = true;
      pane.add(seal);
    });
  });
  addBlock(context, pane, {
    name: `${pane.name}:frame-start`,
    size: [WHEELHOUSE_FRAME_WIDTH, windowHeight, WALL_THICKNESS],
    position: [
      -width / 2 + WHEELHOUSE_FRAME_WIDTH / 2,
      WINDOW_SILL_HEIGHT + windowHeight / 2,
      -WALL_HALF_THICKNESS,
    ],
    material: materials.darkMetal,
  });
  addBlock(context, pane, {
    name: `${pane.name}:frame-end`,
    size: [WHEELHOUSE_FRAME_WIDTH, windowHeight, WALL_THICKNESS],
    position: [
      width / 2 - WHEELHOUSE_FRAME_WIDTH / 2,
      WINDOW_SILL_HEIGHT + windowHeight / 2,
      -WALL_HALF_THICKNESS,
    ],
    material: materials.darkMetal,
  });
  addBlock(context, pane, {
    name: `${pane.name}:glass`,
    size: [openingWidth, windowHeight, WINDOW_GLASS_THICKNESS],
    position: [0, WINDOW_SILL_HEIGHT + windowHeight / 2, -WALL_HALF_THICKNESS],
    material: materials.glass,
  }).castShadow = false;
}

function addWheelhouseFacade(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const facade = new Group();
  facade.name = 'wheelhouse-facade';
  root.add(facade);

  wheelhousePaneSpecs(layout).forEach((spec) =>
    addWheelhousePane(context, facade, geometries, materials, spec));
}

function addRoomRoofs(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
    const width = zone.bounds.maxX - zone.bounds.minX;
    const length = zone.bounds.maxZ - zone.bounds.minZ;
    const wallTopY = FREIGHTER_DIMENSIONS.deckY + roomWallHeight(zone.id);
    if (zone.id === 'wheelhouse') {
      const frontSideZ = zone.bounds.maxZ - SHIP_WHEELHOUSE_CHAMFER_SIZE;
      const frontCenterMinX = zone.bounds.minX + SHIP_WHEELHOUSE_CHAMFER_SIZE;
      const frontCenterMaxX = zone.bounds.maxX - SHIP_WHEELHOUSE_CHAMFER_SIZE;
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
        depth: SHIP_ROOM_ROOF_THICKNESS,
        bevelEnabled: false,
        steps: 1,
      });
      geometry.rotateX(Math.PI / 2);
      applyRoofPlanarUvs(geometry, 0, 0);
      const roof = new Mesh(geometry, roomSurfaceMaterial(materials, zone.id));
      roof.name = 'wheelhouse-roof';
      roof.position.y = wallTopY + SHIP_ROOM_ROOF_THICKNESS;
      roof.castShadow = true;
      roof.receiveShadow = true;
      root.add(roof);
      geometries.add(geometry);
      return;
    }
    const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2;
    const centerZ = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
    const geometry = new BoxGeometry(width, SHIP_ROOM_ROOF_THICKNESS, length);
    applyRoofPlanarUvs(geometry, centerX, centerZ);
    const roof = new Mesh(geometry, roomSurfaceMaterial(materials, zone.id));
    roof.name = `${zone.id}-roof`;
    roof.position.set(
      centerX,
      wallTopY + SHIP_ROOM_ROOF_THICKNESS / 2,
      centerZ,
    );
    roof.castShadow = true;
    roof.receiveShadow = true;
    root.add(roof);
    geometries.add(geometry);
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
    + SHIP_ROOM_ROOF_THICKNESS;
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

function addRoofBalconies(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  layout.balconies.forEach((balcony) => {
    const zone = requiredZone(layout, balcony.zoneId);
    const deckTopY = balconyDeckTopY(zone.id);

    const runs = balconyRuns(balcony, zone);
    runs.forEach((run) => {
      addBlock(context, root, {
        name: `balcony:${balcony.id}:coaming:${run.edge}:${run.index}`,
        size: [run.size[0], balcony.coamingHeight, run.size[1]],
        position: [
          run.position[0],
          deckTopY + balcony.coamingHeight / 2,
          run.position[1],
        ],
        material: materials.darkMetal,
      });
    });
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
  topFloor: LadderEntryArea,
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
    topFloor: Object.freeze({ ...topFloor }),
    bottomEntry,
    topEntry,
    bottomDismount,
    topDismount,
  });
}

function addLadders(
  context: ShipGeometryBuildContext,
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
      addBlock(context, ladder, {
        name: `${ladder.name}:side-rail:${sideName}`,
        size: [LADDER_RAIL_WIDTH, ladderHeight, LADDER_RAIL_DEPTH],
        position: [x, bottomFloorY + ladderHeight / 2, 0],
        material: materials.darkMetal,
      });
      addBlock(context, ladder, {
        name: `${ladder.name}:grab-rail:${sideName}`,
        size: [LADDER_RAIL_WIDTH, LADDER_GRAB_RISE, LADDER_RAIL_DEPTH],
        position: [x, topFloorY + LADDER_GRAB_RISE / 2, 0],
        material: materials.exposedMetal,
      });
      for (let bracketIndex = 0; bracketIndex < 3; bracketIndex += 1) {
        const y = bottomFloorY + ladderHeight * ((bracketIndex + 1) / 4);
        addBlock(context, ladder, {
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
      addBlock(context, ladder, {
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
      zone.bounds,
      wallZ,
      ladderZ,
      outwardZ,
      topFloorY,
    );
  });
  return Object.freeze(climbZones);
}

function addExteriorConstructionDetails(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const bowShoulderZ = cargo.maxZ - BOW_DEPTH;

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

  addBlock(context, root, {
    name: 'stern-transom',
    size: [5.4, 1.08, 0.42],
    position: [0, 1.59, cargo.minZ + 0.16],
    material: materials.upperHull,
  });
  addBlock(context, root, {
    name: 'stern-transom-waterline',
    size: [4.3, 0.18, 0.48],
    position: [0, 1.18, cargo.minZ + 0.12],
    material: materials.waterline,
  });

  const hatch = layout.deckHatch;
  addRotatedBlock(context, root, {
    name: hatch.id,
    size: hatch.size,
    position: [
      hatch.position[0],
      hatch.position[1] + hatch.size[1] / 2,
      hatch.position[2],
    ],
    material: materials.darkMetal,
  }, hatch.rotationY);
  addRotatedBlock(context, root, {
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
    material: materials.hatchTimber,
  }, hatch.rotationY);

  const hawseGeometry = new RingGeometry(0.24, 0.38, 16);
  geometries.add(hawseGeometry);
  const hawseX = (cargo.maxX - cargo.minX) * 0.18;
  const hawseZ = bowShoulderZ + BOW_DEPTH * 0.9 - 0.08;
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

function addRoofEngine(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly [Vector3, Vector3] {
  const storage = requiredZone(layout, 'storageWorkroom');
  const engineZ = (storage.bounds.minZ + storage.bounds.maxZ) / 2;
  const roofY = balconyDeckTopY(storage.id);
  const engineCenterY = roofY + SHIP_ROOF_ENGINE.height / 2;
  const engineTopY = roofY + SHIP_ROOF_ENGINE.height;
  const engineFrontZ = engineZ + SHIP_ROOF_ENGINE.depth / 2;
  addBlock(context, root, {
    name: 'roof-engine-body',
    size: [SHIP_ROOF_ENGINE.width, SHIP_ROOF_ENGINE.height, SHIP_ROOF_ENGINE.depth],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineZ],
    material: materials.paintedSteel,
  });
  addBlock(context, root, {
    name: 'roof-engine-service-panel',
    size: [4.8, 1.08, 0.06],
    position: [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.03],
    material: materials.darkMetal,
  });
  [-0.34, 0, 0.34].forEach((offsetY, index) => {
    addBlock(context, root, {
      name: `roof-engine-vent-${index + 1}`,
      size: [3.8, 0.08, 0.07],
      position: [
        SHIP_ROOF_ENGINE.centerX,
        engineCenterY + offsetY,
        engineFrontZ + 0.07,
      ],
      material: materials.exposedMetal,
    });
  });
  const crank = addCylinder(
    context,
    root,
    'roof-engine-crank',
    0.42,
    0.14,
    [SHIP_ROOF_ENGINE.centerX, engineCenterY, engineFrontZ + 0.14],
    materials.exposedMetal,
  );
  crank.rotation.x = Math.PI / 2;

  const stackZ = engineZ;
  const stackBaseY = engineTopY;
  const stackShaftBaseY = stackBaseY + STACK_COLLAR_HEIGHT;
  const stackOutletY = stackShaftBaseY + STACK_SHAFT_HEIGHT;
  const stackCenterY = stackShaftBaseY + STACK_SHAFT_HEIGHT / 2;
  const stackOutlets = [
    new Vector3(-STACK_X, stackOutletY, stackZ),
    new Vector3(STACK_X, stackOutletY, stackZ),
  ] as const;
  stackOutlets.forEach((outlet, index) => {
    const side = index === 0 ? 'port' : 'starboard';
    addCylinder(context, root, `smokestack-${side}`, STACK_RADIUS, STACK_SHAFT_HEIGHT, [
      outlet.x,
      stackCenterY,
      outlet.z,
    ], materials.darkMetal);
    addCylinder(context, root, `smokestack-${side}-collar`, STACK_COLLAR_RADIUS, STACK_COLLAR_HEIGHT, [
      outlet.x,
      stackBaseY + STACK_COLLAR_HEIGHT / 2,
      outlet.z,
    ], materials.exposedMetal);
  });
  return stackOutlets;
}

function addRailSegment(
  context: ShipGeometryBuildContext,
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
  addBlock(context, root, {
    name: `rail-${sideName}-${minZ}-top`,
    size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
    position: [x, railTopY - RAIL_TOP_THICKNESS / 2, centerZ],
    material: materials.darkMetal,
  });
  const postCount = Math.max(2, Math.ceil(length / RAIL_POST_SPACING));
  const postSpan = Math.max(0, length - RAIL_POST_WIDTH);
  for (let index = 0; index <= postCount; index += 1) {
    const z = minZ + RAIL_POST_WIDTH / 2 + (postSpan * index) / postCount;
    addBlock(context, root, {
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

function addChamferedSternRail(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  sternZ: number,
  layout: ShipLayoutSpec,
): void {
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const rearHalfWidth = railX - SHIP_STERN_CHAMFER;
  addBlock(context, root, {
    name: 'rail-stern-top',
    size: [rearHalfWidth * 2, RAIL_TOP_THICKNESS, RAIL_THICKNESS],
    position: [0, railTopY - RAIL_TOP_THICKNESS / 2, sternZ],
    material: materials.darkMetal,
  });
  ([
    ['port', -rearHalfWidth, -railX],
    ['starboard', rearHalfWidth, railX],
  ] as const).forEach(([side, rearX, sideX]) => {
    const deltaX = sideX - rearX;
    const deltaZ = SHIP_STERN_CHAMFER;
    const length = Math.hypot(deltaX, deltaZ);
    const position = [
      (rearX + sideX) / 2,
      railTopY - RAIL_TOP_THICKNESS / 2,
      sternZ + SHIP_STERN_CHAMFER / 2,
    ] as const;
    const rotationY = Math.atan2(deltaX, deltaZ);
    addRotatedBlock(context, root, {
      name: `rail-stern-chamfer-${side}`,
      size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, length],
      position,
      material: materials.darkMetal,
    }, rotationY);
    shellColliders.push(toOrientedCollisionBox(
      [position[0], FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, position[2]],
      [RAIL_COLLIDER_THICKNESS, layout.rail.height, length],
      rotationY,
    ));
  });
  ([-rearHalfWidth, rearHalfWidth] as const).forEach((x, index) => {
    addBlock(context, root, {
      name: `rail-stern-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, sternZ],
      material: materials.darkMetal,
    });
  });
  shellColliders.push(toCollisionBox(
    [0, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, sternZ],
    [rearHalfWidth * 2, layout.rail.height, RAIL_COLLIDER_THICKNESS],
  ));
}

function addRoundedBowRail(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  shoulderZ: number,
  layout: ShipLayoutSpec,
): void {
  const railTopY = FREIGHTER_DIMENSIONS.deckY + layout.rail.height;
  const railX = layout.rail.innerFaceX + RAIL_COLLIDER_THICKNESS / 2;
  const tipZ = shoulderZ + BOW_DEPTH + RAIL_COLLIDER_THICKNESS / 2;
  const pointAt = (index: number): { x: number; z: number } => roundedBowPoint(
    railX,
    shoulderZ,
    tipZ,
    index / RAIL_END_SEGMENTS,
  );
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
    addRotatedBlock(context, root, {
      name: `rail-bow-top-${index}`,
      size: [RAIL_THICKNESS, RAIL_TOP_THICKNESS, chordLength],
      position,
      material: materials.darkMetal,
    }, rotationY);
    shellColliders.push(toOrientedCollisionBox(
      [position[0], FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, position[2]],
      [RAIL_COLLIDER_THICKNESS, layout.rail.height, chordLength],
      rotationY,
    ));
  }
  for (let index = 0; index <= RAIL_END_SEGMENTS; index += 1) {
    const point = pointAt(index);
    addBlock(context, root, {
      name: `rail-bow-post-${index}`,
      size: [RAIL_POST_WIDTH, layout.rail.height, RAIL_POST_WIDTH],
      position: [point.x, FREIGHTER_DIMENSIONS.deckY + layout.rail.height / 2, point.z],
      material: materials.darkMetal,
    });
  }
}

function addRails(
  context: ShipGeometryBuildContext,
  root: Group,
  geometries: Set<BufferGeometry>,
  shellColliders: CollisionBox[],
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): void {
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const minZ = cargo.minZ + SHIP_STERN_CHAMFER;
  const maxZ = cargo.maxZ - BOW_DEPTH;
  const opening = layout.rail.starboardOpening;
  const gapMinZ = opening.centerZ - opening.width / 2;
  const gapMaxZ = opening.centerZ + opening.width / 2;
  addRailSegment(context, root, geometries, shellColliders, materials, 'port', minZ, maxZ, layout);
  addRailSegment(context, root, geometries, shellColliders, materials, 'starboard', minZ, gapMinZ, layout);
  addRailSegment(context, root, geometries, shellColliders, materials, 'starboard', gapMaxZ, maxZ, layout);
  addRoundedBowRail(context, root, geometries, shellColliders, materials, maxZ, layout);
  addChamferedSternRail(
    context,
    root,
    geometries,
    shellColliders,
    materials,
    cargo.minZ,
    layout,
  );
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
  const context: ShipGeometryBuildContext = {
    root,
    geometries,
    shellColliders,
    materials,
  };

  const { waterExclusion } = addShipHull(context, layout);

  addWallSegments(context, root, geometries, shellColliders, materials, layout);
  addWheelhouseFacade(context, root, geometries, materials, layout);
  addDoorFrames(context, root, geometries, materials, layout);
  addPortholeDetails(root, geometries, materials, layout);
  addRoomRoofs(root, geometries, materials, layout);
  addRoofBalconies(context, root, geometries, shellColliders, materials, layout);
  const climbZones = addLadders(context, root, geometries, materials, layout);
  addExteriorConstructionDetails(
    context,
    root,
    geometries,
    shellColliders,
    materials,
    layout,
  );

  const stackOutlets = addRoofEngine(
    context,
    root,
    geometries,
    shellColliders,
    materials,
    layout,
  );
  addRails(context, root, geometries, shellColliders, materials, layout);

  const zoneCenters = new Map<ShipZoneId, Vector3>(layout.zones.map((zone) => [
    zone.id,
    new Vector3(
      (zone.bounds.minX + zone.bounds.maxX) / 2,
      FREIGHTER_DIMENSIONS.deckY + 1.5,
      (zone.bounds.minZ + zone.bounds.maxZ) / 2,
    ),
  ]));
  root.updateMatrixWorld(true);
  let disposed = false;

  return {
    root,
    shellColliders,
    arcColliders,
    zoneCenters,
    waterExclusion,
    stackOutlets,
    climbZones,
    disposeGeometry: () => {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}
