import {
  Material,
  Mesh,
  Path,
  Shape,
  ShapeGeometry,
} from 'three';
import type {
  WaterExclusionHeightProfile,
  WaterExclusionLongitudinalProfile,
} from '../ocean/WaterExclusion';
import {
  SHIP_STERN_CHAMFER,
  SHIP_STERN_Z,
} from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  type ShipLayoutSpec,
  type ShipZoneId,
  type ShipZoneSpec,
} from './ShipLayoutTypes';
import {
  addRoundedPrism,
  appendRoundedBow,
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';

export interface ShipHullWaterExclusion {
  halfWidth: number;
  halfLength: number;
  taperStart: number;
  minimumLocalY: number;
  heightProfile: WaterExclusionHeightProfile;
  longitudinalProfile: WaterExclusionLongitudinalProfile;
}

export interface ShipHullBuild {
  waterExclusion: ShipHullWaterExclusion;
}

const HALF_WIDTH = FREIGHTER_DIMENSIONS.width / 2;
const HALF_LENGTH = FREIGHTER_DIMENSIONS.length / 2;
const DECK_WIDTH = FREIGHTER_DIMENSIONS.width - 0.5;
const DECK_LENGTH = FREIGHTER_DIMENSIONS.length - 0.8;
const DECK_HALF_WIDTH = DECK_WIDTH / 2;
const END_CAP_DEPTH = 5.2;
const BOW_DEPTH = 8.5;
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
  const cargo = requiredZone(layout, 'cargoDeck').bounds;
  const radius = DECK_HALF_WIDTH;
  const bowShoulderZ = DECK_LENGTH / 2 - BOW_DEPTH;
  const shape = new Shape();
  shape.moveTo(-radius + SHIP_STERN_CHAMFER, -cargo.minZ);
  shape.lineTo(radius - SHIP_STERN_CHAMFER, -cargo.minZ);
  shape.lineTo(radius, -(cargo.minZ + SHIP_STERN_CHAMFER));
  shape.lineTo(radius, -station.minZ);
  shape.lineTo(station.minX, -station.minZ);
  shape.lineTo(station.minX, -station.maxZ);
  shape.lineTo(radius, -station.maxZ);
  shape.lineTo(radius, -bowShoulderZ);
  appendRoundedBow(shape, radius, -bowShoulderZ, -DECK_LENGTH / 2);
  shape.lineTo(-radius, -(cargo.minZ + SHIP_STERN_CHAMFER));
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
  context: ShipGeometryBuildContext,
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
  context.root.add(mesh);
  context.geometries.add(geometry);
  return mesh;
}

function createStationFootprintShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.66, -0.14);
  shape.bezierCurveTo(-0.67, -0.23, -0.50, -0.25, -0.31, -0.20);
  shape.bezierCurveTo(-0.12, -0.15, 0.04, -0.23, 0.24, -0.27);
  shape.bezierCurveTo(0.51, -0.31, 0.70, -0.19, 0.71, 0);
  shape.bezierCurveTo(0.70, 0.19, 0.51, 0.31, 0.24, 0.27);
  shape.bezierCurveTo(0.04, 0.23, -0.12, 0.15, -0.31, 0.20);
  shape.bezierCurveTo(-0.50, 0.25, -0.67, 0.23, -0.66, 0.14);
  shape.closePath();
  return shape;
}

function addStationFootprints(
  context: ShipGeometryBuildContext,
  station: ShipZoneSpec['bounds'],
): void {
  const centerX = (station.minX + DECK_HALF_WIDTH) / 2;
  const centerZ = (station.minZ + station.maxZ) / 2;
  const shape = createStationFootprintShape();
  const placements = [
    { name: 'left', x: centerX - 0.18, z: centerZ - 0.38, rotationY: 0.06 },
    { name: 'right', x: centerX - 0.02, z: centerZ + 0.38, rotationY: -0.06 },
  ] as const;

  placements.forEach((placement) => {
    const geometry = new ShapeGeometry(shape, 20);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, context.materials.emergencyFootprint);
    mesh.name = `lifeboat-station-footprint-${placement.name}`;
    mesh.position.set(placement.x, FINISHED_FLOOR_Y + 0.012, placement.z);
    mesh.rotation.y = placement.rotationY;
    mesh.receiveShadow = true;
    context.root.add(mesh);
    context.geometries.add(geometry);
  });
}

function addFinishedFloors(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): void {
  const crew = requiredZone(layout, 'crewCabin').bounds;
  const wheelhouse = requiredZone(layout, 'wheelhouse').bounds;
  const storage = requiredZone(layout, 'storageWorkroom').bounds;
  const lifeboat = requiredZone(layout, 'lifeboatStation').bounds;
  addFloorSurface(
    context,
    'floor-crewCabin',
    rectangularFloorShape(crew.minX, crew.maxX, crew.minZ, crew.maxZ),
    context.materials.crewFloor,
  );
  addFloorSurface(
    context,
    'floor-wheelhouse',
    rectangularFloorShape(wheelhouse.minX, wheelhouse.maxX, wheelhouse.minZ, wheelhouse.maxZ),
    context.materials.wheelhouseFloor,
  );
  addFloorSurface(
    context,
    'floor-cargoDeck',
    cargoFloorShape(layout),
    context.materials.cargoFloor,
  );
  addFloorSurface(
    context,
    'floor-storageWorkroom',
    rectangularFloorShape(storage.minX, storage.maxX, storage.minZ, storage.maxZ),
    context.materials.storageFloor,
  );
  addFloorSurface(
    context,
    'floor-lifeboatStation',
    rectangularFloorShape(lifeboat.minX, DECK_HALF_WIDTH, lifeboat.minZ, lifeboat.maxZ),
    context.materials.dropoffArea,
  );
  addStationFootprints(context, lifeboat);
}

export function addShipHull(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): ShipHullBuild {
  addRoundedPrism(
    context,
    'main-hull-body',
    HALF_WIDTH * 2,
    HALF_LENGTH * 2,
    HULL_HEIGHT,
    HULL_TOP_Y,
    context.materials.darkHull,
    false,
    HULL_BOTTOM_TAPER,
  );
  addRoundedPrism(
    context,
    'upper-hull',
    FREIGHTER_DIMENSIONS.width + 0.04,
    FREIGHTER_DIMENSIONS.length + 0.04,
    UPPER_HULL_HEIGHT,
    UPPER_HULL_TOP_Y,
    context.materials.upperHull,
    false,
    UPPER_HULL_BOTTOM_TAPER,
  );
  addRoundedPrism(
    context,
    'waterline-band',
    (FREIGHTER_DIMENSIONS.width + 0.04) * UPPER_HULL_BOTTOM_TAPER.widthScale + 0.08,
    (FREIGHTER_DIMENSIONS.length + 0.04) * UPPER_HULL_BOTTOM_TAPER.lengthScale + 0.08,
    WATERLINE_HEIGHT,
    WATERLINE_TOP_Y,
    context.materials.waterline,
    false,
  );
  addRoundedPrism(
    context,
    'timber-deck',
    DECK_WIDTH,
    DECK_LENGTH,
    DECK_THICKNESS,
    STRUCTURAL_DECK_TOP_Y,
    context.materials.timberFloor,
    false,
  );
  addFinishedFloors(context, layout);

  return {
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
      longitudinalProfile: {
        minZ: SHIP_STERN_Z,
        maxZ: DECK_LENGTH / 2,
        taperStartMinZ: SHIP_STERN_Z,
        taperStartMaxZ: DECK_LENGTH / 2 - BOW_DEPTH,
        lowerMinZ: Math.round(
          (SHIP_STERN_Z - (FREIGHTER_DIMENSIONS.length - DECK_LENGTH) / 2)
            * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
        lowerMaxZ: Math.round(
          HALF_LENGTH * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
        lowerTaperStartMinZ: Math.round(
          (SHIP_STERN_Z - (FREIGHTER_DIMENSIONS.length - DECK_LENGTH) / 2)
            * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
        lowerTaperStartMaxZ: Math.round(
          (HALF_LENGTH - BOW_DEPTH) * HULL_EXCLUSION_LOWER_SCALE.length * 1000,
        ) / 1000,
      },
    },
  };
}
