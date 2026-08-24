import { SHIP_FURNITURE_MODEL_IDS as FURNITURE_MODEL_IDS } from './shipFurnitureManifest';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_ROOM_ROOF_THICKNESS,
  SHIP_ROOM_WALL_HEIGHT,
  SHIP_ROOM_WALL_THICKNESS,
  SHIP_TRANSVERSE_PORTHOLE_CENTER_X,
  type Rect2,
  type ScavengeRegionId,
  type ShipDoorSpec,
  type ShipFurnitureKind,
  type ShipFurniturePlacementSpec,
  type ShipItemSurfaceSpec,
  type ShipLayoutSpec,
  type ShipNavigationTargetSpec,
  type ShipRoomDecorationSpec,
  type ShipZoneId,
} from './ShipLayoutTypes';

export const SHIP_FURNITURE_MODEL_IDS = FURNITURE_MODEL_IDS;

const PI_OVER_TWO = 1.5707963267948966;
const PI = 3.141592653589793;
export const SHIP_WHEELHOUSE_CHAMFER_SIZE = 1.3;
export const EXACT_FURNITURE_MODEL_BY_ID: Readonly<Record<string, ShipFurnitureKind>> = Object.freeze({
  'cabin-bunk-port': 'bedBunk',
  'cabin-bunk-starboard': 'bedBunk',
  'cabin-bunk-port-wall': 'bedBunk',
  'cabin-bunk-starboard-wall-aft': 'bedBunk',
  'cabin-bunk-starboard-wall-forward': 'bedBunk',
  'cabin-desk-aft': 'desk',
  'cabin-night-stand-forward-starboard': 'crewNightStand',
  'cabin-desk-starboard-aft': 'crewDesk',
  'cabin-cabinet-port-forward': 'crewCabinet',
  'cabin-table-starboard-center': 'crewTable',
  'chart-table-port': 'table',
  'chart-table-forward': 'table',
  'workbench-starboard': 'table',
  'storage-shelf-forward': 'bookcaseOpen',
  'workroom-storage-shelf-port-forward': 'workroomStorageShelf',
  'workroom-pallet-starboard-forward': 'workroomPallet',
  'cargo-crate-crew-port': 'cargoCrate',
  'cargo-barrel-crew-starboard': 'barrel',
  'cargo-barrel-storage-port': 'barrel',
  'cargo-crate-storage-starboard': 'cargoCrate',
  'cargo-rack-mast-port': 'cargoRack',
  'cargo-rack-mast-starboard': 'cargoRack',
  'cargo-rod-rack-port': 'cargoRack',
  'workroom-crate-center-port': 'cargoCrate',
  'workroom-crate-center-starboard': 'cargoCrate',
  'workroom-crate-stack-port-forward': 'cargoCrateStack',
  'workroom-crate-stack-starboard-forward': 'cargoCrateStack',
  'crew-wall-crate-starboard': 'cargoCrate',
  'crew-wall-barrel-port': 'barrel',
  'wheelhouse-crate-port-forward': 'cargoCrate',
  'bow-crate-starboard': 'cargoCrate',
  'stern-crate-port': 'cargoCrate',
  'stern-crate-starboard': 'cargoCrate',
});

function rect(minX: number, maxX: number, minZ: number, maxZ: number): Rect2 {
  return { minX, maxX, minZ, maxZ };
}

function rectPolygon(bounds: Rect2): readonly (readonly [number, number])[] {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
  ];
}

function sideDoor(
  id: string,
  zoneId: ShipZoneId,
  side: 'port' | 'starboard',
  wallX: number,
  centerZ: number,
  width: number,
): ShipDoorSpec {
  return {
    id,
    zoneId,
    orientation: 'side',
    side,
    center: [wallX, centerZ],
    width,
    approach: rect(
      wallX - 1,
      wallX + 1,
      centerZ - width / 2 - PLAYER_LAYOUT_RADIUS,
      centerZ + width / 2 + PLAYER_LAYOUT_RADIUS,
    ),
  };
}

function aftDoor(
  id: string,
  zoneId: ShipZoneId,
  wallZ: number,
  centerX: number,
  width: number,
): ShipDoorSpec {
  return {
    id,
    zoneId,
    orientation: 'aft',
    center: [centerX, wallZ],
    width,
    approach: rect(
      centerX - width / 2 - PLAYER_LAYOUT_RADIUS,
      centerX + width / 2 + PLAYER_LAYOUT_RADIUS,
      wallZ - 1,
      wallZ + 1,
    ),
  };
}

const RAIL_INNER_FACE_X = FREIGHTER_DIMENSIONS.width / 2 - 0.25;
const CARGO_SIDE_X = RAIL_INNER_FACE_X - 0.15;
const HULL_END_SHOULDER_X = 5.55;
const EXTERIOR_LANE_INNER_X = 6.3;
const EXTERIOR_LANE_OUTER_X = RAIL_INNER_FACE_X - 0.175;
const EXTERIOR_LANE_CENTER_X = (
  EXTERIOR_LANE_INNER_X + EXTERIOR_LANE_OUTER_X
) / 2;
const LIFEBOAT_STATION_WIDTH = 2.8;
const EVACUATION_X = CARGO_SIDE_X - 0.7;

const crewBounds = rect(-5.75, 5.75, 4.5, 13.5);
const wheelhouseBounds = rect(-5.5, 5.5, 17, 22);
const wheelhousePolygon = [
  [wheelhouseBounds.minX, wheelhouseBounds.minZ],
  [wheelhouseBounds.maxX, wheelhouseBounds.minZ],
  [wheelhouseBounds.maxX, wheelhouseBounds.maxZ - SHIP_WHEELHOUSE_CHAMFER_SIZE],
  [wheelhouseBounds.maxX - SHIP_WHEELHOUSE_CHAMFER_SIZE, wheelhouseBounds.maxZ],
  [wheelhouseBounds.minX + SHIP_WHEELHOUSE_CHAMFER_SIZE, wheelhouseBounds.maxZ],
  [wheelhouseBounds.minX, wheelhouseBounds.maxZ - SHIP_WHEELHOUSE_CHAMFER_SIZE],
] as const;
const storageBounds = rect(-5.75, 5.75, -17.4, -10.65);
const STERN_CRATE_CENTER_X = (
  storageBounds.maxX + SHIP_TRANSVERSE_PORTHOLE_CENTER_X
) / 2;
const STERN_CRATE_STANDING_X = STERN_CRATE_CENTER_X + 1.2;
export const SHIP_ROOF_ENGINE = {
  centerX: 0,
  centerZ: (storageBounds.minZ + storageBounds.maxZ) / 2,
  width: 6.2,
  height: 1.6,
  depth: 4,
  stayInset: 0.55,
  stayHeightRatio: 0.72,
} as const;
export const SHIP_STERN_CHAMFER = 0.35;
const SHIP_STERN_DECK_DEPTH = CARGO_SIDE_X - storageBounds.maxX;
export const SHIP_STERN_Z = storageBounds.minZ - SHIP_STERN_DECK_DEPTH;
const INNER_LADDER_WALL_OFFSET = 0.18;
const MAINMAST_Z = -3.075;
const STORAGE_CRATE_SIZE = 1.05;
const STORAGE_CRATE_JOIN_GAP = 0.001;
const STORAGE_FORWARD_CARGO_Z = storageBounds.maxZ
  - SHIP_ROOM_WALL_THICKNESS - STORAGE_CRATE_SIZE / 2;
const STORAGE_STARBOARD_CRATE_X = storageBounds.maxX
  - SHIP_ROOM_WALL_THICKNESS - STORAGE_CRATE_SIZE / 2;
const FORWARD_WALL_CARGO_X = (
  crewBounds.maxX + SHIP_TRANSVERSE_PORTHOLE_CENTER_X
) / 2;
const lifeboatBounds = rect(
  CARGO_SIDE_X - LIFEBOAT_STATION_WIDTH,
  CARGO_SIDE_X,
  -2,
  2,
);
const cargoBounds = rect(-CARGO_SIDE_X, CARGO_SIDE_X, SHIP_STERN_Z, 27.1);
const evacuationBounds = rect(
  EVACUATION_X - 0.35,
  EVACUATION_X + 0.35,
  -0.35,
  0.35,
);
const DECK_HATCH_WIDTH = 1.45;
const DECK_HATCH_DEPTH = 1.8;
const DECK_HATCH_Z = -7;
const deckHatchHalfWidthWithClearance = DECK_HATCH_WIDTH / 2 + PLAYER_LAYOUT_RADIUS;
const deckHatchHalfDepthWithClearance = DECK_HATCH_DEPTH / 2 + PLAYER_LAYOUT_RADIUS;
const CARGO_ROUTE_OUTER_X = FORWARD_WALL_CARGO_X - 2.1 / 2;
const CARGO_ROUTE_INNER_X = DECK_HATCH_WIDTH / 2;
const deckHatchBypassOuterX = deckHatchHalfWidthWithClearance + 2.5;

const doors: readonly ShipDoorSpec[] = [
  sideDoor('cabin-port-door', 'crewCabin', 'port', -5.75, 7.25, 2.6),
  sideDoor('cabin-starboard-door', 'crewCabin', 'starboard', 5.75, 7.25, 2.6),
  aftDoor('wheelhouse-aft-door', 'wheelhouse', 17, 0, 2.6),
  sideDoor('wheelhouse-port-door', 'wheelhouse', 'port', -5.5, 19.5, 2.4),
  sideDoor('storage-port-door', 'storageWorkroom', 'port', -5.75, -14.45, 2.6),
  sideDoor('storage-starboard-door', 'storageWorkroom', 'starboard', 5.75, -14.45, 2.6),
];

function itemSurface(
  furnitureId: string,
  suffix: string,
  regionId: ScavengeRegionId,
  localPosition: readonly [number, number, number],
  footprint: { readonly width: number; readonly depth: number },
  clearanceHeight: number,
  standingPoints: readonly (readonly [number, number, number])[],
  options: {
    readonly localRotation?: readonly [number, number, number];
    readonly branch?: boolean;
  } = {},
): ShipItemSurfaceSpec {
  return {
    id: `${furnitureId}:${suffix}`,
    physicalSlotId: `${furnitureId}:${suffix}`,
    regionId,
    branch: options.branch ?? false,
    localPosition,
    localRotation: options.localRotation ?? [0, 0, 0],
    footprint,
    clearanceHeight,
    standingPoints,
  };
}

function deskSurfaces(
  furnitureId: string,
  regionId: ScavengeRegionId,
): readonly ShipItemSurfaceSpec[] {
  return ([-0.43, 0.43] as const).map((x, index) => {
    const side = index === 0 ? 'left' : 'right';
    return itemSurface(
      furnitureId,
      `top-${side}`,
      regionId,
      [x, 0.89, 0],
      { width: 0.7, depth: 0.6 },
      0.82,
      [[x, 0, -1.15], [x, 0, 1.15], [index === 0 ? -1.15 : 1.15, 0, 0]],
    );
  });
}

function tableSurfaces(
  furnitureId: string,
  regionId: ScavengeRegionId,
  slotCount: 1 | 2 | 3 | 4 = 2,
  branch = false,
): readonly ShipItemSurfaceSpec[] {
  const slots = slotCount === 1
    ? [
        { x: 0, z: 0, width: 1.6, depth: 0.72, label: 'center' },
      ] as const
    : slotCount === 4
    ? [
        { x: -0.75, z: 0, width: 0.6, depth: 1, label: 'left' },
        { x: -0.1, z: -0.28, width: 0.4, depth: 0.42, label: 'right-aft' },
        { x: -0.1, z: 0.28, width: 0.4, depth: 0.42, label: 'right-forward' },
        { x: 0.5, z: 0, width: 0.54, depth: 1, label: 'far-right' },
      ] as const
    : slotCount === 3
    ? [
        { x: -0.7, z: 0, width: 0.65, depth: 0.72, label: 'left' },
        { x: 0, z: 0, width: 0.65, depth: 0.72, label: 'center' },
        { x: 0.7, z: 0, width: 0.65, depth: 0.72, label: 'right' },
      ] as const
    : [
        { x: -0.52, z: 0, width: 0.8, depth: 0.72, label: 'left' },
        { x: 0.52, z: 0, width: 0.8, depth: 0.72, label: 'right' },
      ] as const;
  return slots.map(({ x, z, width, depth, label }) => itemSurface(
    furnitureId,
    slotCount === 1 ? 'top' : `top-${label}`,
    regionId,
    [x, 0.82, z],
    { width, depth },
    0.82,
    [
      [x, 0, -1.25],
      [x, 0, 1.25],
      label === 'left' && furnitureId === 'workbench-starboard'
        ? [-1.6, 0, 1.25]
        : [label === 'left' ? -1.75 : 1.75, 0, 0],
      [label === 'left' ? 1.75 : -1.75, 0, 0],
    ],
    {
      localRotation: slotCount === 1 || (slotCount === 4 && label !== 'left')
        ? [0, 0, 0]
        : [0, PI_OVER_TWO, 0],
      branch,
    },
  ));
}

function bookcaseSurfaces(
  furnitureId: string,
  regionId: ScavengeRegionId,
  standingZ = -0.85,
): readonly ShipItemSurfaceSpec[] {
  const wallMidpointHeight = SHIP_ROOM_WALL_HEIGHT / 2;
  return ([-0.21, 0.21] as const).map((x, slotIndex) => itemSurface(
    furnitureId,
    `shelf-${slotIndex === 0 ? 'left' : 'right'}`,
    regionId,
    [x, wallMidpointHeight, -0.08],
    { width: 0.34, depth: 0.35 },
    0.82,
    [[x, 0, standingZ], [-0.65, 0, standingZ]],
    { branch: true },
  ));
}

function compactTopSurface(
  furnitureId: string,
  height: number,
  footprint: { readonly width: number; readonly depth: number },
  standingPoints: readonly (readonly [number, number, number])[],
  branch = false,
): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'top',
    'crewCabin',
    [0, height, 0],
    footprint,
    height,
    standingPoints,
    { branch },
  )];
}

function crewDeskSurfaces(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return ([-0.35, 0.35] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    'crewCabin',
    [x, 0.554137, 0],
    index === 0 ? { width: 0.7, depth: 0.7 } : { width: 0.55, depth: 0.48 },
    0.7,
    [[-1.2, 0, 0], [x, 0, 1.05]],
    { localRotation: index === 0 ? [0, 0, 0] : [PI_OVER_TWO, 0, 0] },
  ));
}

function crewTableSurfaces(
  furnitureId: string,
): readonly ShipItemSurfaceSpec[] {
  return ([-0.45, 0.45] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    'crewCabin',
    [x, 0.72, 0],
    { width: 0.65, depth: 0.65 },
    0.8,
    [[1.5, 0, index === 0 ? -0.35 : -0.25]],
  ));
}

function workroomShelfSurfaces(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return ([-0.32, 0.32] as const).map((x, index) => itemSurface(
    furnitureId,
    `shelf-${index === 0 ? 'left' : 'right'}`,
    'storageWorkroom',
    [x, index === 0 ? 0.92 : 1.46, 0],
    { width: 0.5, depth: 0.32 },
    0.55,
    [[x, 0, -1.3], [-0.2, 0, -1.3]],
  ));
}

function cargoRackSurfaces(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return ([-0.5, 0.5] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    'centralCargo',
    [x, 0.55, 0],
    { width: 0.85, depth: 0.62 },
    0.82,
    [[x, 0, -1.15], [x, 0, 1.15]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  ));
}

function bunkRestSurface(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'rest',
    'crewCabin',
    [0, 0.49, 0],
    { width: 0.82, depth: 1.5 },
    0.72,
    [[-1.05, 0, 0], [1.05, 0, 0]],
    { branch: furnitureId === 'cabin-bunk-port' },
  )];
}

function crateTopSurface(
  furnitureId: string,
  regionId: ScavengeRegionId,
  standingPoints: readonly (readonly [number, number, number])[],
): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'top',
    regionId,
    [0, 1.05, 0],
    { width: 0.78, depth: 0.78 },
    0.88,
    standingPoints,
    { branch: furnitureId === 'workroom-crate-center-port' },
  )];
}

function crateStackTopSurfaces(
  furnitureId: string,
  width: number,
): readonly ShipItemSurfaceSpec[] {
  const surfaceXs = width > 1.2 ? [-0.525, 0.525] as const : [0] as const;
  return surfaceXs.map((x, index) => itemSurface(
    furnitureId,
    surfaceXs.length === 1 ? 'top' : `top-${index === 0 ? 'left' : 'right'}`,
    'storageWorkroom',
    [x, 2.1, 0],
    { width: 0.72, depth: 0.72 },
    0.82,
    [[x, 0, -1.2]],
    { branch: index === 0 },
  ));
}

function raisedCargoSurface(
  furnitureId: string,
  modelId: 'cargoCrate' | 'barrel',
  regionId: 'centralCargo' | 'wheelhouse' | 'bow' | 'stern',
  standingPoint: readonly [number, number, number],
): readonly ShipItemSurfaceSpec[] {
  const dimensions = modelId === 'cargoCrate'
    ? { height: 1.05, width: 0.78, depth: 0.78, clearance: 0.88 }
    : { height: 1.15, width: 0.62, depth: 0.62, clearance: 0.82 };
  return [itemSurface(
    furnitureId,
    'top',
    regionId,
    [0, dimensions.height, 0],
    {
      width: dimensions.width,
      depth: dimensions.depth,
    },
    dimensions.clearance,
    [standingPoint],
    { localRotation: [0, 0, 0] },
  )];
}

function placement(
  id: string,
  modelId: ShipFurnitureKind,
  zoneId: ShipZoneId,
  position: readonly [number, number, number],
  rotationY: ShipFurniturePlacementSpec['rotationY'],
  colliderSize: readonly [number, number, number],
  surfaces: readonly ShipItemSurfaceSpec[] = [],
  scale: readonly [number, number, number] = [1, 1, 1],
): ShipFurniturePlacementSpec {
  return { id, modelId, zoneId, position, rotationY, colliderSize, surfaces, scale };
}

const furniture: readonly ShipFurniturePlacementSpec[] = [
  placement(
    'cabin-bunk-port',
    'bedBunk',
    'crewCabin',
    [-0.72, FREIGHTER_DIMENSIONS.deckY, 7.75],
    0,
    [1.147, 1.708, 2.2],
    bunkRestSurface('cabin-bunk-port'),
  ),
  placement('cabin-bunk-starboard', 'bedBunk', 'crewCabin', [0.72, FREIGHTER_DIMENSIONS.deckY, 7.75], 0, [1.147, 1.708, 2.2], bunkRestSurface('cabin-bunk-starboard')),
  placement('cabin-bunk-port-wall', 'bedBunk', 'crewCabin', [-4.35, FREIGHTER_DIMENSIONS.deckY, 9.95], PI_OVER_TWO, [1.147, 1.708, 2.2], bunkRestSurface('cabin-bunk-port-wall')),
  placement('cabin-bunk-starboard-wall-aft', 'bedBunk', 'crewCabin', [4.35, FREIGHTER_DIMENSIONS.deckY, 9.95], PI_OVER_TWO, [1.147, 1.708, 2.2], bunkRestSurface('cabin-bunk-starboard-wall-aft')),
  placement('cabin-bunk-starboard-wall-forward', 'bedBunk', 'crewCabin', [4.42, FREIGHTER_DIMENSIONS.deckY, 12.7], PI_OVER_TWO, [1.147, 1.708, 2.2], bunkRestSurface('cabin-bunk-starboard-wall-forward')),
  placement('cabin-desk-aft', 'desk', 'crewCabin', [-4.62, 2.22, 5.14], 0, [1.7, 0.89, 0.908], deskSurfaces('cabin-desk-aft', 'crewCabin')),
  placement('cabin-night-stand-forward-starboard', 'crewNightStand', 'crewCabin', [-0.78, 2.22, 12.85], 0, [0.624577, 0.62, 0.624577], compactTopSurface(
    'cabin-night-stand-forward-starboard',
    0.62,
    { width: 0.48, depth: 0.48 },
    [[-0.95, 0, 0]],
    true,
  )),
  placement('cabin-desk-starboard-aft', 'crewDesk', 'crewCabin', [4.7, 2.22, 5.18], 0, [1.6, 0.554137, 0.796331], crewDeskSurfaces('cabin-desk-starboard-aft')),
  placement('cabin-cabinet-port-forward', 'crewCabinet', 'crewCabin', [
    0.4,
    2.22,
    12.75,
  ], PI, [1.36025, 1.35, 0.81829], [itemSurface(
    'cabin-cabinet-port-forward',
    'top',
    'crewCabin',
    [0, 1.35, 0.05],
    { width: 1.05, depth: 0.70 },
    1.35,
    [[0, 0, 1.15]],
    { branch: true },
  )]),
  placement('cabin-table-starboard-center', 'crewTable', 'crewCabin', [-4.45, 2.22, 12.25], 0, [1.836937, 0.72, 1.836937], crewTableSurfaces('cabin-table-starboard-center')),
  placement('chart-table-port', 'table', 'wheelhouse', [0, 2.22, 21.15], 0, [2.112, 0.82, 1.123], tableSurfaces('chart-table-port', 'wheelhouse', 1)),
  placement(
    'chart-table-forward',
    'table',
    'wheelhouse',
    [-4.12, 2.22, 17.615],
    0,
    [2.112, 0.82, 1.123],
    tableSurfaces('chart-table-forward', 'wheelhouse', 1, true),
    [1, 1, 0.58],
  ),
  placement('workbench-starboard', 'table', 'storageWorkroom', [2.65, 2.22, -16.7], 0, [2.112, 0.82, 1.123], tableSurfaces('workbench-starboard', 'storageWorkroom', 1)),
  placement('storage-shelf-forward', 'bookcaseOpen', 'storageWorkroom', [0, 2.22, -11.1], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('storage-shelf-forward', 'storageWorkroom', -1.3)),
  placement(
    'workroom-storage-shelf-port-forward',
    'workroomStorageShelf',
    'storageWorkroom',
    [0, FREIGHTER_DIMENSIONS.deckY, storageBounds.minZ
      + SHIP_ROOM_WALL_THICKNESS + 0.514286 / 2 + 0.02],
    PI,
    [1.317857, 1.8, 0.514286],
    workroomShelfSurfaces('workroom-storage-shelf-port-forward'),
  ),
  placement('workroom-crate-stack-port-forward', 'cargoCrateStack', 'storageWorkroom', [-4.45, FREIGHTER_DIMENSIONS.deckY, STORAGE_FORWARD_CARGO_Z], 0, [2.1, 2.1, 1.05], crateStackTopSurfaces('workroom-crate-stack-port-forward', 2.1)),
  placement('workroom-crate-stack-starboard-forward', 'cargoCrateStack', 'storageWorkroom', [STORAGE_STARBOARD_CRATE_X, FREIGHTER_DIMENSIONS.deckY, STORAGE_FORWARD_CARGO_Z], 0, [STORAGE_CRATE_SIZE, 2.1, STORAGE_CRATE_SIZE], crateStackTopSurfaces('workroom-crate-stack-starboard-forward', STORAGE_CRATE_SIZE)),
  placement(
    'workroom-crate-center-port',
    'cargoCrate',
    'storageWorkroom',
    [
      (storageBounds.minX + storageBounds.maxX) / 2,
      FREIGHTER_DIMENSIONS.deckY,
      (storageBounds.minZ + storageBounds.maxZ) / 2,
    ],
    0,
    [1.05, 1.05, 1.05],
    crateTopSurface('workroom-crate-center-port', 'storageWorkroom', [
      [-1.15, 0, 0],
      [1.15, 0, 0],
    ]),
  ),
  placement(
    'workroom-crate-center-starboard',
    'cargoCrate',
    'storageWorkroom',
    [
      STORAGE_STARBOARD_CRATE_X - STORAGE_CRATE_SIZE - STORAGE_CRATE_JOIN_GAP,
      FREIGHTER_DIMENSIONS.deckY,
      STORAGE_FORWARD_CARGO_Z,
    ],
    0,
    [1.05, 1.05, 1.05],
    crateTopSurface('workroom-crate-center-starboard', 'storageWorkroom', [
      [-1.15, 0, 0],
      [0, 0, -1.15],
    ]),
  ),
  placement(
    'cargo-crate-crew-port',
    'cargoCrate',
    'cargoDeck',
    [
      crewBounds.minX + SHIP_ROOM_WALL_THICKNESS + 1.35 / 2,
      FREIGHTER_DIMENSIONS.deckY,
      crewBounds.minZ - 1.15 / 2,
    ],
    0,
    [1.35, 1.05, 1.15],
    [itemSurface(
      'cargo-crate-crew-port',
      'top',
      'centralCargo',
      [0, 1.05, 0],
      { width: 1.05, depth: 0.85 },
      0.95,
      [[0, 0, -1.15], [1.15, 0, 0]],
    )],
  ),
  placement(
    'cargo-barrel-crew-starboard',
    'barrel',
    'cargoDeck',
    [
      crewBounds.maxX - SHIP_ROOM_WALL_THICKNESS - 1.129507 / 2,
      FREIGHTER_DIMENSIONS.deckY,
      crewBounds.minZ - 1.129507 / 2,
    ],
    0,
    [1.129507, 1.15, 1.129507],
    raisedCargoSurface(
      'cargo-barrel-crew-starboard',
      'barrel',
      'centralCargo',
      [0, 0, -1.15],
    ),
  ),
  placement(
    'cargo-barrel-storage-port',
    'barrel',
    'cargoDeck',
    [
      storageBounds.minX + SHIP_ROOM_WALL_THICKNESS + 1.129507 / 2,
      FREIGHTER_DIMENSIONS.deckY,
      storageBounds.maxZ + 1.129507 / 2,
    ],
    0,
    [1.129507, 1.15, 1.129507],
    raisedCargoSurface(
      'cargo-barrel-storage-port',
      'barrel',
      'centralCargo',
      [1.15, 0, 0],
    ),
  ),
  placement(
    'cargo-crate-storage-starboard',
    'cargoCrate',
    'cargoDeck',
    [
      storageBounds.maxX - SHIP_ROOM_WALL_THICKNESS - 1.35 / 2,
      FREIGHTER_DIMENSIONS.deckY,
      storageBounds.maxZ + 1.15 / 2,
    ],
    0,
    [1.35, 1.05, 1.15],
    [itemSurface(
      'cargo-crate-storage-starboard',
      'top',
      'centralCargo',
      [0, 1.05, 0],
      { width: 1.05, depth: 0.85 },
      0.95,
      [[0, 0, 1.15], [-1.15, 0, 0]],
    )],
  ),
  placement('cargo-rack-mast-port', 'cargoRack', 'cargoDeck', [-FORWARD_WALL_CARGO_X, 2.22, MAINMAST_Z], 0, [2.1, 0.55, 0.75], cargoRackSurfaces('cargo-rack-mast-port')),
  placement('cargo-rack-mast-starboard', 'cargoRack', 'cargoDeck', [FORWARD_WALL_CARGO_X, 2.22, MAINMAST_Z], 0, [2.1, 0.55, 0.75], cargoRackSurfaces('cargo-rack-mast-starboard')),
  placement('cargo-rod-rack-port', 'cargoRack', 'cargoDeck', [-4.6, 2.22, -4.2], 0, [2.1, 0.55, 0.75], [itemSurface(
    'cargo-rod-rack-port', 'rod', 'centralCargo', [0, 0.55, 0],
    { width: 1.9, depth: 0.75 }, 0.82, [[-1.45, 0, 0], [1.45, 0, 0]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  )]),
  ...([
    ['crew-wall-crate-starboard', 'cargoCrate', 'centralCargo', 4.7, 14.025, [-1.25, 0, 0]],
    ['crew-wall-barrel-port', 'barrel', 'centralCargo', -4.7, 14.0647535, [1.25, 0, 0]],
    ['wheelhouse-crate-port-forward', 'cargoCrate', 'wheelhouse', -3.2, 21.37, [1.1, 0, 0]],
    ['bow-crate-starboard', 'cargoCrate', 'bow', 0, 22.7, [0, 0, 1.2]],
    [
      'stern-crate-port',
      'cargoCrate',
      'stern',
      -STERN_CRATE_CENTER_X,
      storageBounds.minZ - 0.02 - 1.05 / 2,
      [-1.2, 0, 0],
    ],
    [
      'stern-crate-starboard',
      'cargoCrate',
      'stern',
      STERN_CRATE_CENTER_X,
      storageBounds.minZ - 0.02 - 1.05 / 2,
      [1.2, 0, 0],
    ],
  ] as const).map(([id, modelId, regionId, x, z, standingPoint]) => {
    const colliderSize = modelId === 'cargoCrate'
      ? [1.05, 1.05, 1.05] as const
      : [1.129507, 1.15, 1.129507] as const;
    const scale = id === 'wheelhouse-crate-port-forward'
      ? [0.75, 0.75, 0.75] as const
      : [1, 1, 1] as const;
    return placement(
      id,
      modelId,
      regionId === 'wheelhouse' ? 'wheelhouse' : 'cargoDeck',
      [x, FREIGHTER_DIMENSIONS.deckY, z],
      0,
      colliderSize,
      raisedCargoSurface(id, modelId, regionId, standingPoint),
      scale,
    );
  }),
];

const decorations: readonly ShipRoomDecorationSpec[] = [
  {
    id: 'cabin-wall-shelf-port-table',
    modelId: 'bookcaseOpen',
    zoneId: 'crewCabin',
    position: [
      crewBounds.minX + SHIP_ROOM_WALL_THICKNESS + 0.310193 / 2 + 0.02,
      3.78,
      12.25,
    ],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'cabin-ceiling-light',
    modelId: 'crewCeilingLight',
    zoneId: 'crewCabin',
    position: [-2.2, FREIGHTER_DIMENSIONS.deckY + SHIP_ROOM_WALL_HEIGHT, 7.2],
    rotation: [PI, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'cabin-wall-painting-aft',
    modelId: 'crewWallPainting',
    zoneId: 'crewCabin',
    position: [-0.75, 4.2, crewBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02],
    rotation: [PI_OVER_TWO, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'cabin-wall-art-aft-center',
    modelId: 'crewWallArt',
    zoneId: 'crewCabin',
    position: [0.75, 4.2, crewBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-corkboard-aft',
    modelId: 'wheelhouseCorkboard',
    zoneId: 'storageWorkroom',
    position: [4.25, 3.45, storageBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
];

function transformLocalPoint(
  furnitureSpec: ShipFurniturePlacementSpec,
  point: readonly [number, number, number],
): readonly [number, number] {
  const cosine = Math.cos(furnitureSpec.rotationY);
  const sine = Math.sin(furnitureSpec.rotationY);
  const localX = point[0] * furnitureSpec.scale[0];
  const localZ = point[2] * furnitureSpec.scale[2];
  return [
    furnitureSpec.position[0] + localX * cosine + localZ * sine,
    furnitureSpec.position[2] - localX * sine + localZ * cosine,
  ];
}

function doorNavigationTargets(
  doorSpecs: readonly ShipDoorSpec[],
): ShipNavigationTargetSpec[] {
  const result: ShipNavigationTargetSpec[] = [];
  doorSpecs.forEach((door) => {
    const [x, z] = door.center;
    if (door.orientation === 'side') {
      const direction = door.side === 'port' ? -1 : 1;
      result.push(
        { id: `${door.id}-inside`, position: [x - direction * 0.5, z], kind: 'door' },
        { id: `${door.id}-outside`, position: [x + direction * 0.5, z], kind: 'door' },
      );
    } else {
      result.push(
        { id: `${door.id}-inside`, position: [x, z + 0.5], kind: 'door' },
        { id: `${door.id}-outside`, position: [x, z - 0.5], kind: 'door' },
      );
    }
  });
  return result;
}

function surfaceNavigationTargets(
  furnitureSpecs: readonly ShipFurniturePlacementSpec[],
): ShipNavigationTargetSpec[] {
  const result: ShipNavigationTargetSpec[] = [];
  furnitureSpecs.forEach((owner) => owner.surfaces.forEach((surface) => {
    surface.standingPoints.forEach((point, index) => result.push({
      id: `${surface.id}-standing-${index}`,
      position: transformLocalPoint(owner, point),
      kind: 'surface',
    }));
  }));
  return result;
}

function navigationTargets(
  doorSpecs: readonly ShipDoorSpec[],
  furnitureSpecs: readonly ShipFurniturePlacementSpec[],
): readonly ShipNavigationTargetSpec[] {
  const result: ShipNavigationTargetSpec[] = [
    { id: 'start', position: [0, 9.6], kind: 'start' },
    { id: 'crew-loop-port', position: [-3, 8.7], kind: 'loop' },
    { id: 'crew-loop-starboard', position: [2.8, 10.4], kind: 'loop' },
    { id: 'wheelhouse-loop-port', position: [-1.4, 19.5], kind: 'loop' },
    { id: 'wheelhouse-loop-starboard', position: [1.4, 19.5], kind: 'loop' },
    { id: 'workroom-loop-port', position: [-2.9, -13.75], kind: 'loop' },
    { id: 'workroom-loop-starboard', position: [2.5, -13.75], kind: 'loop' },
    { id: 'crew-ladder-route', position: [0, 5.1], kind: 'loop' },
    { id: 'deck-hatch-route', position: [-1.5, DECK_HATCH_Z], kind: 'loop' },
    { id: 'mainmast-route', position: [0, MAINMAST_Z - 1.1], kind: 'loop' },
    { id: 'port-loop-forward', position: [-EXTERIOR_LANE_CENTER_X, 10.2], kind: 'loop' },
    { id: 'port-loop-aft', position: [-EXTERIOR_LANE_CENTER_X, -12.5], kind: 'loop' },
    { id: 'starboard-loop-forward', position: [EXTERIOR_LANE_CENTER_X, 10.2], kind: 'loop' },
    { id: 'starboard-loop-aft', position: [EXTERIOR_LANE_CENTER_X, -12.5], kind: 'loop' },
    { id: 'bow-port', position: [-2.75, 25.8], kind: 'endDeck' },
    { id: 'bow-center', position: [0, 25.8], kind: 'endDeck' },
    { id: 'bow-starboard', position: [2.75, 25.8], kind: 'endDeck' },
    { id: 'stern-port', position: [-STERN_CRATE_STANDING_X, -18.7], kind: 'endDeck' },
    { id: 'stern-starboard', position: [STERN_CRATE_STANDING_X, -18.7], kind: 'endDeck' },
  ];
  result.push(...doorNavigationTargets(doorSpecs));
  result.push(...surfaceNavigationTargets(furnitureSpecs));
  result.push({ id: 'evacuation', position: [EVACUATION_X, 0], kind: 'evacuation' });
  return result;
}

export const SHIP_LAYOUT: ShipLayoutSpec = {
  zones: [
    {
      id: 'crewCabin', bounds: crewBounds, polygon: rectPolygon(crewBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 11,
        allowedModelIds: [
          'bedBunk', 'desk', 'bookcaseOpen',
          'crewNightStand', 'crewDesk', 'crewCabinet', 'crewTable',
        ],
      },
    },
    {
      id: 'wheelhouse', bounds: wheelhouseBounds, polygon: wheelhousePolygon, enclosed: true,
      furniturePolicy: {
        maxFixtures: 5,
        allowedModelIds: ['table', 'cargoCrate', 'barrel'],
      },
    },
    {
      id: 'cargoDeck',
      bounds: cargoBounds,
      polygon: [
        [-CARGO_SIDE_X + SHIP_STERN_CHAMFER, cargoBounds.minZ],
        [CARGO_SIDE_X - SHIP_STERN_CHAMFER, cargoBounds.minZ],
        [CARGO_SIDE_X, cargoBounds.minZ + SHIP_STERN_CHAMFER],
        [CARGO_SIDE_X, 21.9], [HULL_END_SHOULDER_X, 25.58],
        [0, 27.1],
        [-HULL_END_SHOULDER_X, 25.58], [-CARGO_SIDE_X, 21.9],
        [-CARGO_SIDE_X, cargoBounds.minZ + SHIP_STERN_CHAMFER],
      ],
      excludedZoneIds: ['crewCabin', 'wheelhouse', 'storageWorkroom', 'lifeboatStation'],
      enclosed: false,
      furniturePolicy: {
        maxFixtures: 18,
        allowedModelIds: ['cargoCrate', 'cargoRack', 'barrel'],
      },
    },
    {
      id: 'storageWorkroom', bounds: storageBounds, polygon: rectPolygon(storageBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 9,
        allowedModelIds: [
          'table', 'bookcaseOpen', 'workroomStorageShelf', 'workroomPallet',
          'cargoCrate', 'cargoCrateStack',
        ],
      },
    },
    {
      id: 'lifeboatStation', bounds: lifeboatBounds, polygon: rectPolygon(lifeboatBounds), enclosed: false,
      furniturePolicy: {
        maxFixtures: 0,
        allowedModelIds: [],
        clearCenter: evacuationBounds,
      },
    },
  ],
  doors,
  lanes: [
    {
      id: 'port-exterior-main',
      className: 'secondary',
      clearWidth: 1.4,
      bounds: rect(
        -EXTERIOR_LANE_OUTER_X,
        -EXTERIOR_LANE_INNER_X,
        storageBounds.minZ,
        18.1,
      ),
    },
    {
      id: 'starboard-exterior-main',
      className: 'secondary',
      clearWidth: 1.4,
      bounds: rect(
        EXTERIOR_LANE_INNER_X,
        EXTERIOR_LANE_OUTER_X,
        storageBounds.minZ,
        18.1,
      ),
    },
    { id: 'crew-loop-aft-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-2.8, 2.8, 5.15, 6.55) },
    { id: 'crew-loop-port-aft', className: 'secondary', clearWidth: 1.4, bounds: rect(-3.5, -2.1, 5.8, 9.3) },
    { id: 'crew-loop-starboard-aft', className: 'secondary', clearWidth: 1.4, bounds: rect(2.1, 3.5, 5.8, 9.3) },
    { id: 'crew-loop-center-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-3.1, 3.1, 8.9, 10.3) },
    { id: 'crew-loop-port-forward', className: 'secondary', clearWidth: 1.4, bounds: rect(-3.15, -1.75, 9.05, 12.65) },
    { id: 'crew-loop-starboard-forward', className: 'secondary', clearWidth: 1.4, bounds: rect(1.7, 3.1, 9.05, 12.65) },
    { id: 'crew-loop-forward-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-2.1, 2.1, 10.85, 12.25) },
    { id: 'wheelhouse-loop-aft', className: 'secondary', clearWidth: 1.4, bounds: rect(-2.2, 3.2, 17.2, 18.6) },
    { id: 'wheelhouse-loop-forward', className: 'secondary', clearWidth: 1.4, bounds: rect(-2.8, 2.8, 19.1, 20.5) },
    { id: 'wheelhouse-loop-port', className: 'secondary', clearWidth: 1.4, bounds: rect(-2.8, -1.4, 18.3, 21.2) },
    { id: 'wheelhouse-loop-starboard', className: 'secondary', clearWidth: 1.4, bounds: rect(1.4, 2.8, 18.3, 21.2) },
    { id: 'workroom-loop-aft-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-1.4, 1.4, -16.4, -15) },
    { id: 'workroom-loop-port-aft', className: 'secondary', clearWidth: 1.4, bounds: rect(-2, -0.6, -16, -13.3) },
    { id: 'workroom-loop-starboard-aft', className: 'secondary', clearWidth: 1.4, bounds: rect(0.6, 2, -16, -13.3) },
    { id: 'workroom-loop-center-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-3.6, 3.4, -16.05, -14.65) },
    { id: 'workroom-loop-port-forward', className: 'secondary', clearWidth: 1.4, bounds: rect(-2, -0.6, -14.7, -11.5) },
    { id: 'workroom-loop-starboard-forward', className: 'secondary', clearWidth: 1.4, bounds: rect(0.6, 2, -14.7, -11.5) },
    { id: 'workroom-loop-forward-cross', className: 'secondary', clearWidth: 1.4, bounds: rect(-2, 2, -12.9, -11.5) },
    { id: 'crew-forward-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-0.7, 0.7, 11.6, 13.1) },
    { id: 'crew-starboard-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(3.2, 4.6, 11.3, 12.7) },
    { id: 'workroom-forward-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-0.7, 0.7, -12.9, -11.5) },
    { id: 'workroom-port-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-4.2, -2.8, -12.4, -11) },
    { id: 'cargo-port-full-route', className: 'primary', clearWidth: 2.2, bounds: rect(-CARGO_ROUTE_OUTER_X, -CARGO_ROUTE_INNER_X, -10.65, 4.5) },
    { id: 'cargo-starboard-full-route', className: 'primary', clearWidth: 2.2, bounds: rect(CARGO_ROUTE_INNER_X, CARGO_ROUTE_OUTER_X, -10.65, 4.5) },
    { id: 'cargo-forward-cross-route', className: 'primary', clearWidth: 2.2, bounds: rect(-2.9, 2.9, 2.1, 4.3) },
    { id: 'cargo-aft-cross-route', className: 'primary', clearWidth: 2.2, bounds: rect(-2.7, 2.7, -5.7, -3.5) },
    { id: 'cargo-aft-longitudinal', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, -10.65, DECK_HATCH_Z - DECK_HATCH_DEPTH / 2) },
    { id: 'deck-hatch-port-bypass', className: 'primary', clearWidth: 2.5, bounds: rect(-deckHatchBypassOuterX, -deckHatchHalfWidthWithClearance, DECK_HATCH_Z - deckHatchHalfDepthWithClearance, DECK_HATCH_Z + deckHatchHalfDepthWithClearance) },
    { id: 'deck-hatch-starboard-bypass', className: 'primary', clearWidth: 2.5, bounds: rect(deckHatchHalfWidthWithClearance, deckHatchBypassOuterX, DECK_HATCH_Z - deckHatchHalfDepthWithClearance, DECK_HATCH_Z + deckHatchHalfDepthWithClearance) },
    { id: 'cargo-forward-longitudinal', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, 1.6, 4.5) },
    { id: 'forward-room-passage', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, 13.5, 17) },
    { id: 'bow-port-approach', className: 'primary', clearWidth: 2.2, bounds: rect(-6, -3.8, 22, 24.8) },
    { id: 'bow-starboard-approach', className: 'primary', clearWidth: 2.2, bounds: rect(3.8, 6, 22, 24.8) },
    { id: 'stern-port-approach', className: 'secondary', clearWidth: 1.4, bounds: rect(-6, -4.6, -18.8, storageBounds.minZ) },
    { id: 'stern-starboard-approach', className: 'secondary', clearWidth: 1.4, bounds: rect(4.6, 6, -18.8, storageBounds.minZ) },
  ],
  furniture,
  decorations,
  deckHatch: {
    id: 'deck-hatch',
    position: [0, FREIGHTER_DIMENSIONS.deckY, DECK_HATCH_Z],
    rotationY: 0,
    size: [DECK_HATCH_WIDTH, 0.18, DECK_HATCH_DEPTH],
    colliderSize: [DECK_HATCH_WIDTH, 0.18, DECK_HATCH_DEPTH],
  },
  balconies: [
    {
      id: 'crew-balcony',
      zoneId: 'crewCabin',
      ladderId: 'crew-ladder',
      edge: 'aft',
      coamingHeight: 0.12,
      openingWidth: 1.5,
    },
  ],
  ladders: [
    {
      id: 'crew-ladder',
      zoneId: 'crewCabin',
      edge: 'aft',
      centerX: 0,
      width: 0.8,
      wallOffset: INNER_LADDER_WALL_OFFSET,
      rungSpacing: 0.32,
    },
  ],
  rigging: {
    masts: [{
      id: 'mainmast',
      position: [0, FREIGHTER_DIMENSIONS.deckY, MAINMAST_Z],
      height: 14.5,
      baseDiameter: 0.72,
      boomLength: 17.2,
      stays: [
        {
          id: 'fore-port',
          anchor: [
            crewBounds.minX + 0.42,
            SHIP_ROOM_WALL_HEIGHT + SHIP_ROOM_ROOF_THICKNESS + 0.08,
            (crewBounds.minZ + crewBounds.maxZ) / 2 - MAINMAST_Z,
          ],
        },
        {
          id: 'fore-starboard',
          anchor: [
            crewBounds.maxX - 0.42,
            SHIP_ROOM_WALL_HEIGHT + SHIP_ROOM_ROOF_THICKNESS + 0.08,
            (crewBounds.minZ + crewBounds.maxZ) / 2 - MAINMAST_Z,
          ],
        },
        {
          id: 'aft-port',
          anchor: [
            SHIP_ROOF_ENGINE.centerX - SHIP_ROOF_ENGINE.width / 2 + SHIP_ROOF_ENGINE.stayInset,
            SHIP_ROOM_WALL_HEIGHT + SHIP_ROOM_ROOF_THICKNESS
              + SHIP_ROOF_ENGINE.height * SHIP_ROOF_ENGINE.stayHeightRatio,
            SHIP_ROOF_ENGINE.centerZ + SHIP_ROOF_ENGINE.depth / 2 - MAINMAST_Z,
          ],
        },
        {
          id: 'aft-starboard',
          anchor: [
            SHIP_ROOF_ENGINE.centerX + SHIP_ROOF_ENGINE.width / 2 - SHIP_ROOF_ENGINE.stayInset,
            SHIP_ROOM_WALL_HEIGHT + SHIP_ROOM_ROOF_THICKNESS
              + SHIP_ROOF_ENGINE.height * SHIP_ROOF_ENGINE.stayHeightRatio,
            SHIP_ROOF_ENGINE.centerZ + SHIP_ROOF_ENGINE.depth / 2 - MAINMAST_Z,
          ],
        },
      ],
      sails: [
        {
          id: 'mainsail',
          kind: 'boom',
          furled: true,
          rotationY: Math.PI / 2,
          topY: 14.1,
          footY: 10.5,
          clewZ: -8.6,
          billow: 0.85,
        },
        {
          id: 'staysail',
          kind: 'stay',
          furled: true,
          rotationY: Math.PI / 2,
          topY: 13.6,
          footY: 10.5,
          clewZ: 8.6,
          billow: 0.72,
        },
      ],
    }],
    crowsNest: {
      id: 'mainmast-lookout',
      mastId: 'mainmast',
      floorOffsetY: 14.5,
      outerWidth: 4,
      openingSize: 0.9,
      guardHeight: 1.05,
      ladder: {
        id: 'mainmast-ladder',
        width: 0.8,
        mastOffset: 0.18,
        rungSpacing: 0.32,
        outwardZ: -1,
      },
    },
  },
  targets: navigationTargets(doors, furniture),
  rail: {
    height: 1.05,
    innerFaceX: RAIL_INNER_FACE_X,
    starboardOpening: { centerZ: 0, width: 4 },
  },
  evacuationRect: evacuationBounds,
};
