import type { ShipItemCategory } from './ShipItemPlacement';
import {
  SHIP_FURNITURE_MODEL_IDS,
  type ShipFurnitureAssetId,
} from './shipFurnitureManifest';

export const PLAYER_LAYOUT_RADIUS = 0.35;
export const FREIGHTER_DIMENSIONS = { width: 16.25, length: 55, deckY: 2.22 } as const;
export const SHIP_ROOM_WALL_HEIGHT = 3.4;
export const SHIP_ROOM_WALL_THICKNESS = 0.22;

export type ShipZoneId =
  | 'crewCabin' | 'wheelhouse' | 'cargoDeck'
  | 'storageWorkroom' | 'lifeboatStation';
export type ShipBalconyZoneId = 'crewCabin' | 'storageWorkroom';
export type ShipTransverseEdge = 'aft' | 'forward';
export type ClearanceClass = 'primary' | 'secondary';
export type ShipFurnitureKind = ShipFurnitureAssetId | 'cargoRack' | 'timberBench';
export type ScavengeRegionId =
  | 'crewCabin'
  | 'wheelhouse'
  | 'centralCargo'
  | 'storageWorkroom'
  | 'bow'
  | 'stern';

export const SCAVENGE_REGION_IDS: ReadonlySet<ScavengeRegionId> = new Set([
  'crewCabin',
  'wheelhouse',
  'centralCargo',
  'storageWorkroom',
  'bow',
  'stern',
]);

export interface Rect2 {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
}

export interface ShipItemSurfaceSpec {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly categories: readonly ShipItemCategory[];
  readonly regionId: ScavengeRegionId;
  readonly branch: boolean;
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly (readonly [number, number, number])[];
  readonly fallback: boolean;
}

export interface ShipFurniturePlacementSpec {
  readonly id: string;
  readonly modelId: ShipFurnitureKind;
  readonly zoneId: ShipZoneId;
  readonly position: readonly [number, number, number];
  readonly rotationY: 0 | 1.5707963267948966 | 3.141592653589793;
  readonly scale: readonly [number, number, number];
  readonly colliderSize: readonly [number, number, number];
  readonly surfaces: readonly ShipItemSurfaceSpec[];
}

export interface ShipZoneSpec {
  readonly id: ShipZoneId;
  readonly polygon: readonly (readonly [number, number])[];
  readonly bounds: Rect2;
  readonly excludedZoneIds?: readonly ShipZoneId[];
  readonly enclosed: boolean;
  readonly furniturePolicy: ShipZoneFurniturePolicy;
}

export interface ShipZoneFurniturePolicy {
  readonly maxFixtures: number;
  readonly allowedModelIds: readonly ShipFurnitureKind[];
  readonly clearCenter?: Rect2;
}

export interface ShipDoorSpec {
  readonly id: string;
  readonly zoneId: ShipZoneId;
  readonly orientation: 'side' | 'aft';
  readonly side?: 'port' | 'starboard';
  readonly center: readonly [number, number];
  readonly width: number;
  readonly approach: Rect2;
}

export interface ShipLaneSpec {
  readonly id: string;
  readonly className: ClearanceClass;
  readonly clearWidth: number;
  readonly bounds: Rect2;
}

export type ShipDeckDetailKind = 'barrel' | 'cargoBox';

export interface ShipDeckDetailSpec {
  readonly id: string;
  readonly kind: ShipDeckDetailKind;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly scale: readonly [number, number, number];
  readonly visualSize: readonly [number, number];
  readonly colliderSize?: readonly [number, number, number];
}

export interface ShipDeckHatchSpec {
  readonly id: 'deck-hatch';
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly size: readonly [number, number, number];
  readonly colliderSize: readonly [number, number, number];
}

export type ShipSailId = 'mainsail' | 'staysail';
export type ShipStayId =
  | 'fore-port' | 'fore-starboard'
  | 'aft-port' | 'aft-starboard';

export interface ShipStaySpec {
  readonly id: ShipStayId;
  readonly anchor: readonly [number, number, number];
}

export interface ShipRoomDecorationSpec {
  readonly id: string;
  readonly modelId: ShipFurnitureAssetId;
  readonly zoneId: ShipZoneId;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface ShipSailSpec {
  readonly id: ShipSailId;
  readonly kind: 'boom' | 'stay';
  readonly furled: boolean;
  readonly rotationY: number;
  readonly topY: number;
  readonly footY: number;
  readonly clewZ: number;
  readonly billow: number;
}

export interface ShipMastSpec {
  readonly id: 'mainmast';
  readonly position: readonly [number, number, number];
  readonly height: number;
  readonly baseDiameter: number;
  readonly boomLength: number;
  readonly stays: readonly ShipStaySpec[];
  readonly sails: readonly ShipSailSpec[];
}

export interface ShipCrowsNestSpec {
  readonly id: 'mainmast-lookout';
  readonly mastId: ShipMastSpec['id'];
  readonly floorOffsetY: number;
  readonly outerWidth: number;
  readonly openingSize: number;
  readonly guardHeight: number;
  readonly ladder: {
    readonly id: 'mainmast-ladder';
    readonly width: number;
    readonly mastOffset: number;
    readonly rungSpacing: number;
    readonly outwardZ: -1;
  };
}

export const SHIP_SAIL_CLOTH_CLEARANCE_Y = 5.2;
export const SHIP_SAIL_CLOTH_MIN_Y = 5.21;
export const SHIP_SAIL_TOP_OFFSET = 0.25;
export const SHIP_SAIL_MAX_LENGTH = 8.6;

export interface ShipSailGeometryLimits {
  readonly top: number;
  readonly clothHeight: number;
  readonly clothLength: number;
}

export function shipSailGeometryLimits(
  spec: Pick<ShipMastSpec, 'sails'>,
  sailSpec: ShipSailSpec = spec.sails[0]!,
): ShipSailGeometryLimits {
  const top = sailSpec.topY;
  const clothHeight = top - sailSpec.footY;
  const clothLength = Math.abs(sailSpec.clewZ);
  return { top, clothHeight, clothLength };
}

export interface ShipRiggingSpec {
  readonly masts: readonly ShipMastSpec[];
  readonly crowsNest: ShipCrowsNestSpec;
}

export interface ShipNavigationTargetSpec {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly kind: 'start' | 'door' | 'loop' | 'surface' | 'evacuation' | 'endDeck';
}

export interface ShipBalconySpec {
  readonly id: 'crew-balcony' | 'storage-balcony';
  readonly zoneId: ShipBalconyZoneId;
  readonly ladderId: 'crew-ladder' | 'storage-ladder';
  readonly edge: ShipTransverseEdge;
  readonly coamingHeight: number;
  readonly openingWidth: number;
}

export interface ShipLadderSpec {
  readonly id: 'crew-ladder' | 'storage-ladder';
  readonly zoneId: ShipBalconyZoneId;
  readonly edge: ShipTransverseEdge;
  readonly centerX: number;
  readonly width: number;
  readonly wallOffset: number;
  readonly rungSpacing: number;
}

export interface ShipLayoutSpec {
  readonly zones: readonly ShipZoneSpec[];
  readonly doors: readonly ShipDoorSpec[];
  readonly lanes: readonly ShipLaneSpec[];
  readonly furniture: readonly ShipFurniturePlacementSpec[];
  readonly decorations: readonly ShipRoomDecorationSpec[];
  readonly details: readonly ShipDeckDetailSpec[];
  readonly deckHatch: ShipDeckHatchSpec;
  readonly rigging: ShipRiggingSpec;
  readonly balconies: readonly ShipBalconySpec[];
  readonly ladders: readonly ShipLadderSpec[];
  readonly targets: readonly ShipNavigationTargetSpec[];
  readonly rail: {
    readonly height: number;
    readonly innerFaceX: number;
    readonly starboardOpening: {
      readonly centerZ: number;
      readonly width: number;
    };
  };
  readonly machineryClosure: Rect2;
  readonly evacuationRect: Rect2;
}

export interface ShipNavigationAnalysis {
  readonly unreachableTargetIds: readonly string[];
  readonly reachableSurfaceStandingPointIds: readonly string[];
  readonly minimumPrimaryClearance: number;
  readonly minimumSecondaryClearance: number;
  readonly secondaryAccessLaneCount: number;
  readonly secondaryAccessRectangles: readonly ShipSecondaryAccessRectangle[];
}

export interface ShipRouteMetric {
  distance(
    from: readonly [number, number],
    to: readonly [number, number],
  ): number | null;
}

export interface ShipSecondaryAccessRectangle {
  readonly id: string;
  readonly bounds: Rect2;
}

const PI_OVER_TWO = 1.5707963267948966;
const PI = 3.141592653589793;
const WALL_THICKNESS = 0.2;
const RAIL_THICKNESS = 0.25;
const GRID_STEP = 0.1;
export const SHIP_WHEELHOUSE_CHAMFER_SIZE = 1.3;
const CABIN_ITEM_CATEGORIES = ['provisions'] as const;
const WHEELHOUSE_ITEM_CATEGORIES = ['navigation'] as const;
const WORKROOM_ITEM_CATEGORIES = ['workshop'] as const;
const CARGO_ITEM_CATEGORIES = ['deckGear'] as const;

const EXACT_FURNITURE_MODEL_BY_ID: Readonly<Record<string, ShipFurnitureKind>> = Object.freeze({
  'cabin-bunk-port': 'bedBunk',
  'cabin-bunk-starboard': 'bedBunk',
  'cabin-desk-aft': 'desk',
  'cabin-bookcase-forward': 'bookcaseOpen',
  'cabin-night-stand-forward-starboard': 'crewNightStand',
  'cabin-desk-starboard-aft': 'crewDesk',
  'cabin-cabinet-port-forward': 'crewCabinet',
  'cabin-table-starboard-center': 'crewTable',
  'chart-table-port': 'table',
  'chart-table-forward': 'table',
  'workbench-port': 'table',
  'workbench-starboard': 'table',
  'storage-shelf-forward': 'bookcaseOpen',
  'workroom-storage-shelf-port-forward': 'workroomStorageShelf',
  'workroom-pallet-starboard-forward': 'workroomPallet',
  'cargo-crate-forward-port': 'cargoCrate',
  'cargo-crate-forward-starboard': 'cargoCrate',
  'cargo-crate-aft-port': 'cargoCrate',
  'cargo-crate-aft-starboard': 'cargoCrate',
  'cargo-rack-port': 'cargoRack',
  'cargo-rack-starboard': 'cargoRack',
  'cargo-rod-rack-port': 'cargoRack',
  'workroom-crate-center-port': 'cargoCrate',
  'workroom-crate-center-starboard': 'cargoCrate',
  'deck-bench-cabin-port': 'timberBench',
  'deck-bench-cabin-starboard': 'timberBench',
  'deck-bench-storage-port': 'timberBench',
  'bow-crate-port': 'cargoCrate',
  'bow-barrel-port-center': 'barrel',
  'bow-box-starboard-center': 'cargoBox',
  'bow-crate-starboard': 'cargoCrate',
  'stern-crate-port': 'cargoCrate',
  'stern-barrel-port-center': 'barrel',
  'stern-box-starboard-center': 'cargoBox',
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
const lifeboatBounds = rect(
  CARGO_SIDE_X - LIFEBOAT_STATION_WIDTH,
  CARGO_SIDE_X,
  -2,
  2,
);
const cargoBounds = rect(-CARGO_SIDE_X, CARGO_SIDE_X, -27.1, 27.1);
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
const deckHatchBypassOuterX = deckHatchHalfWidthWithClearance + 2.5;

const doors: readonly ShipDoorSpec[] = [
  sideDoor('cabin-port-door', 'crewCabin', 'port', -5.75, 7.25, 2.6),
  sideDoor('cabin-starboard-door', 'crewCabin', 'starboard', 5.75, 7.25, 2.6),
  aftDoor('wheelhouse-aft-door', 'wheelhouse', 17, 0, 2.6),
  sideDoor('wheelhouse-port-door', 'wheelhouse', 'port', -5.5, 19.5, 2.4),
  sideDoor('storage-port-door', 'storageWorkroom', 'port', -5.75, -14.45, 2.6),
  sideDoor('storage-starboard-door', 'storageWorkroom', 'starboard', 5.75, -14.45, 2.6),
];

export const SHIP_DECK_DETAIL_COUNTS: Readonly<Record<ShipDeckDetailKind, number>> = {
  barrel: 2,
  cargoBox: 3,
};

export const SHIP_DECK_DETAIL_VISUAL_SIZES: Readonly<
  Record<ShipDeckDetailKind, readonly [number, number]>
> = {
  barrel: [1.13, 1.13],
  cargoBox: [0.623579, 0.633173],
};

export const SHIP_DECK_DETAIL_MIN_GAP = 1;

interface DetailTransform {
  readonly position: readonly [number, number];
  readonly rotationY: number;
  readonly scale: readonly [number, number, number];
}

function boxAgainstSideWall(
  wallCenterX: number,
  outwardDirection: -1 | 1,
  z: number,
  scale: readonly [number, number, number],
): DetailTransform {
  const [unscaledWidth] = SHIP_DECK_DETAIL_VISUAL_SIZES.cargoBox;
  const projectedWidth = unscaledWidth * scale[0];
  return {
    position: [
      wallCenterX + outwardDirection * projectedWidth / 2,
      z,
    ],
    rotationY: 0,
    scale,
  };
}

const detailTransforms: Readonly<Record<ShipDeckDetailKind, readonly DetailTransform[]>> = {
  barrel: [
    { position: [-4.65, -2], rotationY: 0, scale: [1, 1, 1] },
    { position: [4.65, -2.3], rotationY: 0, scale: [1, 1, 1] },
  ],
  cargoBox: [
    boxAgainstSideWall(crewBounds.minX, -1, 6, [0.9, 0.9, 0.9]),
    boxAgainstSideWall(storageBounds.maxX, 1, -16.35, [1, 1, 1]),
    boxAgainstSideWall(storageBounds.minX, -1, -6, [0.82, 0.82, 0.82]),
  ],
};

const colliders: Partial<Record<ShipDeckDetailKind, readonly [number, number, number]>> = {
  barrel: [1.13, 1.15, 1.13],
};

const details: readonly ShipDeckDetailSpec[] = (Object.keys(detailTransforms) as ShipDeckDetailKind[]).flatMap((kind) =>
  detailTransforms[kind].map(({ position: [x, z], rotationY, scale }, index) => ({
    id: `${kind}-${index + 1}`, kind, position: [x, FREIGHTER_DIMENSIONS.deckY, z],
    rotationY,
    scale,
    visualSize: SHIP_DECK_DETAIL_VISUAL_SIZES[kind],
    colliderSize: colliders[kind],
  })));

function itemSurface(
  furnitureId: string,
  suffix: string,
  categories: readonly ShipItemCategory[],
  regionId: ScavengeRegionId,
  localPosition: readonly [number, number, number],
  footprint: { readonly width: number; readonly depth: number },
  clearanceHeight: number,
  standingPoints: readonly (readonly [number, number, number])[],
  options: {
    readonly localRotation?: readonly [number, number, number];
    readonly fallback?: boolean;
    readonly physicalSlotSuffix?: string;
    readonly branch?: boolean;
  } = {},
): ShipItemSurfaceSpec {
  return {
    id: `${furnitureId}:${suffix}`,
    physicalSlotId: `${furnitureId}:${options.physicalSlotSuffix ?? suffix}`,
    categories,
    regionId,
    branch: options.branch ?? false,
    localPosition,
    localRotation: options.localRotation ?? [0, 0, 0],
    footprint,
    clearanceHeight,
    standingPoints,
    fallback: options.fallback ?? false,
  };
}

function deskSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  regionId: ScavengeRegionId,
): readonly ShipItemSurfaceSpec[] {
  return ([-0.43, 0.43] as const).map((x, index) => {
    const side = index === 0 ? 'left' : 'right';
    return itemSurface(
      furnitureId,
      `top-${side}`,
      categories,
      regionId,
      [x, 0.89, 0],
      { width: 0.75, depth: 0.6 },
      0.82,
      [[x, 0, -1.15], [x, 0, 1.15], [index === 0 ? -1.15 : 1.15, 0, 0]],
    );
  });
}

function tableSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  regionId: ScavengeRegionId,
  slotCount: 2 | 3 | 4 = 2,
): readonly ShipItemSurfaceSpec[] {
  if (slotCount === 4) {
    const regular = tableSurfaces(furnitureId, categories, regionId, 3);
    return [
      ...regular,
      itemSurface(
        furnitureId,
        'top-center-fallback',
        categories,
        regionId,
        [0, 0.82, 0],
        { width: 0.65, depth: 0.72 },
        0.82,
        [[0, 0, -1.25], [0, 0, 1.25]],
        {
          fallback: true,
          physicalSlotSuffix: 'top-center',
          localRotation: [0, PI_OVER_TWO, 0],
        },
      ),
    ];
  }
  const slots = slotCount === 3
    ? [
        { x: -0.7, width: 0.65, label: 'left' },
        { x: 0, width: 0.65, label: 'center' },
        { x: 0.7, width: 0.65, label: 'right' },
      ] as const
    : [
        { x: -0.52, width: 0.8, label: 'left' },
        { x: 0.52, width: 0.8, label: 'right' },
      ] as const;
  return slots.map(({ x, width, label }, index) => itemSurface(
    furnitureId,
    `top-${label}`,
    categories,
    regionId,
    [x, 0.82, 0],
    { width, depth: 0.72 },
    0.82,
    [[x, 0, -1.25], [x, 0, 1.25]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  ));
}

function bookcaseSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  regionId: ScavengeRegionId,
): readonly ShipItemSurfaceSpec[] {
  const wallMidpointHeight = SHIP_ROOM_WALL_HEIGHT / 2;
  return ([-0.21, 0.21] as const).map((x, slotIndex) => itemSurface(
    furnitureId,
    `shelf-${slotIndex === 0 ? 'left' : 'right'}`,
    categories,
    regionId,
    [x, wallMidpointHeight, -0.08],
    { width: 0.34, depth: 0.35 },
    0.82,
    [[x, 0, -0.85]],
    { branch: true },
  ));
}

function compactTopSurface(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  height: number,
  footprint: { readonly width: number; readonly depth: number },
  standingPoints: readonly (readonly [number, number, number])[],
  branch = false,
): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'top',
    categories,
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
    CABIN_ITEM_CATEGORIES,
    'crewCabin',
    [x, 0.554137, 0],
    { width: 0.55, depth: 0.48 },
    0.7,
    [[-1.2, 0, 0], [x, 0, 1.05]],
  ));
}

function crewTableSurfaces(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return ([-0.45, 0.45] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    CABIN_ITEM_CATEGORIES,
    'crewCabin',
    [x, 0.72, 0],
    { width: 0.65, depth: 0.65 },
    0.8,
    [[-1.3, 0, index === 0 ? -0.35 : 0.35], [x, 0, 1.3]],
  ));
}

function workroomShelfSurfaces(furnitureId: string): readonly ShipItemSurfaceSpec[] {
  return ([-0.32, 0.32] as const).map((x, index) => itemSurface(
    furnitureId,
    `shelf-${index === 0 ? 'left' : 'right'}`,
    WORKROOM_ITEM_CATEGORIES,
    'storageWorkroom',
    [x, index === 0 ? 0.92 : 1.46, 0],
    { width: 0.5, depth: 0.32 },
    0.55,
    [[x, 0, -0.9]],
    { branch: true },
  ));
}

function cargoRackSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
): readonly ShipItemSurfaceSpec[] {
  return ([-0.5, 0.5] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    categories,
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
    ['comfort'],
    'crewCabin',
    [0, 1.708, 0],
    { width: 0.82, depth: 1.5 },
    0.72,
    [[-1.05, 0, 0], [1.05, 0, 0]],
    { fallback: true },
  )];
}

function cargoBenchSurfaces(
  furnitureId: string,
  outwardLocalZ: -1.15 | 1.15,
): readonly ShipItemSurfaceSpec[] {
  const surfaceLocalZ = outwardLocalZ > 0 ? 0.1 : -0.1;
  return ([-0.5, 0.5] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'aft' : 'forward'}`,
    CARGO_ITEM_CATEGORIES,
    'centralCargo',
    [x, 0.62, surfaceLocalZ],
    { width: 0.82, depth: 0.24 },
    0.72,
    [[x, 0, outwardLocalZ]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  ));
}

function crateTopSurface(
  furnitureId: string,
  regionId: ScavengeRegionId,
  standingPoints: readonly (readonly [number, number, number])[],
): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'top',
    regionId === 'storageWorkroom' ? WORKROOM_ITEM_CATEGORIES : CARGO_ITEM_CATEGORIES,
    regionId,
    [0, 1.05, 0],
    { width: 0.78, depth: 0.78 },
    0.88,
    standingPoints,
  )];
}

function endPropSurface(
  furnitureId: string,
  modelId: 'cargoCrate' | 'barrel' | 'cargoBox',
  regionId: 'bow' | 'stern',
  standingPoint: readonly [number, number, number],
): readonly ShipItemSurfaceSpec[] {
  const dimensions = modelId === 'cargoCrate'
    ? { height: 1.05, width: 0.78, depth: 0.78, clearance: 0.88 }
    : modelId === 'barrel'
      ? { height: 1.15, width: 0.62, depth: 0.62, clearance: 0.82 }
      : { height: 0.55, width: 0.46, depth: 0.46, clearance: 0.72 };
  const sternLocalZ = modelId === 'cargoCrate' ? 0.4 : modelId === 'barrel' ? 0.38 : 0.18;
  return [itemSurface(
    furnitureId,
    'top',
    CARGO_ITEM_CATEGORIES,
    regionId,
    [0, dimensions.height, regionId === 'stern' ? sternLocalZ : 0],
    {
      width: dimensions.width,
      depth: regionId === 'stern' ? 0.2 : dimensions.depth,
    },
    dimensions.clearance,
    [standingPoint],
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
    [-1.7, FREIGHTER_DIMENSIONS.deckY, 7.7],
    0,
    [1.147, 1.708, 2.2],
    bunkRestSurface('cabin-bunk-port'),
  ),
  placement('cabin-bunk-starboard', 'bedBunk', 'crewCabin', [1.7, FREIGHTER_DIMENSIONS.deckY, 10.8], 0, [1.147, 1.708, 2.2], bunkRestSurface('cabin-bunk-starboard')),
  placement('cabin-desk-aft', 'desk', 'crewCabin', [-2.8, 2.22, crewBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.908 / 2], 0, [1.7, 0.89, 0.908], deskSurfaces('cabin-desk-aft', CABIN_ITEM_CATEGORIES, 'crewCabin')),
  placement('cabin-bookcase-forward', 'bookcaseOpen', 'crewCabin', [0, 2.22, 13.08], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('cabin-bookcase-forward', CABIN_ITEM_CATEGORIES, 'crewCabin')),
  placement('cabin-night-stand-forward-starboard', 'crewNightStand', 'crewCabin', [4.25, 2.22, 12.75], 0, [0.624577, 0.62, 0.624577], compactTopSurface(
    'cabin-night-stand-forward-starboard',
    CABIN_ITEM_CATEGORIES,
    0.62,
    { width: 0.48, depth: 0.48 },
    [[-0.95, 0, 0]],
    true,
  )),
  placement('cabin-desk-starboard-aft', 'crewDesk', 'crewCabin', [3.7, 2.22, 5.18], 0, [1.6, 0.554137, 0.796331], crewDeskSurfaces('cabin-desk-starboard-aft')),
  placement('cabin-cabinet-port-forward', 'crewCabinet', 'crewCabin', [
    crewBounds.minX + SHIP_ROOM_WALL_THICKNESS + 0.81829 / 2,
    2.22,
    12.5,
  ], PI_OVER_TWO, [1.36025, 1.35, 0.81829], [itemSurface(
    'cabin-cabinet-port-forward',
    'top',
    ['comfort'],
    'crewCabin',
    [0, 1.35, 0.05],
    { width: 1.05, depth: 0.70 },
    1.35,
    [[0, 0, 1.15]],
    { branch: true },
  )]),
  placement('cabin-table-starboard-center', 'crewTable', 'crewCabin', [4.2, 2.22, 10.3], 0, [1.836937, 0.72, 1.836937], crewTableSurfaces('cabin-table-starboard-center')),
  placement('chart-table-port', 'table', 'wheelhouse', [-3, 2.22, 18.2], 0, [2.112, 0.82, 1.123], tableSurfaces('chart-table-port', WHEELHOUSE_ITEM_CATEGORIES, 'wheelhouse', 4)),
  placement('chart-table-forward', 'table', 'wheelhouse', [3, 2.22, 20.5], 0, [2.112, 0.82, 1.123], tableSurfaces('chart-table-forward', WHEELHOUSE_ITEM_CATEGORIES, 'wheelhouse', 4)),
  placement('workbench-port', 'table', 'storageWorkroom', [-3.7, 2.22, -16.7], 0, [2.112, 0.82, 1.123], tableSurfaces('workbench-port', WORKROOM_ITEM_CATEGORIES, 'storageWorkroom')),
  placement('workbench-starboard', 'table', 'storageWorkroom', [3.7, 2.22, -16.7], 0, [2.112, 0.82, 1.123], tableSurfaces('workbench-starboard', WORKROOM_ITEM_CATEGORIES, 'storageWorkroom')),
  placement('storage-shelf-forward', 'bookcaseOpen', 'storageWorkroom', [2.5, 2.22, -11.075], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('storage-shelf-forward', WORKROOM_ITEM_CATEGORIES, 'storageWorkroom')),
  placement('workroom-storage-shelf-port-forward', 'workroomStorageShelf', 'storageWorkroom', [-4.7, 2.22, -11.15], 0, [1.317857, 1.8, 0.514286], workroomShelfSurfaces('workroom-storage-shelf-port-forward')),
  placement('workroom-pallet-starboard-forward', 'workroomPallet', 'storageWorkroom', [4.55, 2.22, -11.35], 0, [0.568017, 0.18, 0.568017], [], [2.2, 1, 2.2]),
  placement(
    'workroom-crate-center-port',
    'cargoCrate',
    'storageWorkroom',
    [-1.5, FREIGHTER_DIMENSIONS.deckY, -12.6],
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
    [1.4, FREIGHTER_DIMENSIONS.deckY, -15.5],
    0,
    [1.05, 1.05, 1.05],
    crateTopSurface('workroom-crate-center-starboard', 'storageWorkroom', [
      [-1.15, 0, 0],
      [1.15, 0, 0],
    ]),
  ),
  ...([
    [
      'cargo-crate-forward-port',
      crewBounds.minX + SHIP_ROOM_WALL_THICKNESS + 1.35 / 2,
      crewBounds.minZ - 1.15 / 2,
    ],
    [
      'cargo-crate-forward-starboard',
      crewBounds.maxX - SHIP_ROOM_WALL_THICKNESS - 1.35 / 2,
      crewBounds.minZ - 1.15 / 2,
    ],
    [
      'cargo-crate-aft-port',
      storageBounds.minX + SHIP_ROOM_WALL_THICKNESS + 1.35 / 2,
      storageBounds.maxZ + 1.15 / 2,
    ],
    [
      'cargo-crate-aft-starboard',
      storageBounds.maxX - SHIP_ROOM_WALL_THICKNESS - 1.35 / 2,
      storageBounds.maxZ + 1.15 / 2,
    ],
  ] as const).map(([id, x, z]) => placement(
    id, 'cargoCrate', 'cargoDeck', [x, 2.22, z], 0, [1.35, 1.05, 1.15],
    [itemSurface(
      id,
      'top',
      CARGO_ITEM_CATEGORIES,
      'centralCargo',
      [0, 1.05, 0],
      { width: 1.05, depth: 0.85 },
      0.95,
      id.startsWith('cargo-crate-forward')
        ? [[x < 0 ? -1.15 : 1.15, 0, 0], [0, 0, 1.15]]
        : [[0, 0, -1.15], [0, 0, 1.15]],
    )],
  )),
  placement('cargo-rack-port', 'cargoRack', 'cargoDeck', [-4.6, 2.22, 2.4], 0, [2.1, 0.55, 0.75], cargoRackSurfaces('cargo-rack-port', CARGO_ITEM_CATEGORIES)),
  placement('cargo-rack-starboard', 'cargoRack', 'cargoDeck', [4.6, 2.22, 2.4], 0, [2.1, 0.55, 0.75], cargoRackSurfaces('cargo-rack-starboard', CARGO_ITEM_CATEGORIES)),
  placement('cargo-rod-rack-port', 'cargoRack', 'cargoDeck', [-4.6, 2.22, -4.2], 0, [2.1, 0.55, 0.75], [itemSurface(
    'cargo-rod-rack-port', 'rod', CARGO_ITEM_CATEGORIES, 'centralCargo', [0, 0.55, 0],
    { width: 1.9, depth: 0.5 }, 0.82, [[-1.45, 0, 0], [1.45, 0, 0]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  )]),
  ...([
    ['deck-bench-cabin-port', -6, 10.4, -1.15],
    ['deck-bench-cabin-starboard', 6, 10.4, 1.15],
    ['deck-bench-storage-port', -6, -11.6, -1.15],
  ] as const).map(([id, x, z, outwardLocalZ]) => placement(
    id,
    'timberBench',
    'cargoDeck',
    [x, FREIGHTER_DIMENSIONS.deckY, z],
    PI_OVER_TWO,
    [2.1, 0.62, 0.5],
    cargoBenchSurfaces(id, outwardLocalZ),
  )),
  ...([
    ['bow-crate-port', 'cargoCrate', -3, 22.65, [0, 0, 1.2]],
    ['bow-barrel-port-center', 'barrel', -1, 22.65, [0, 0, 1.25]],
    ['bow-box-starboard-center', 'cargoBox', 1, 22.65, [0, 0, 1.05]],
    ['bow-crate-starboard', 'cargoCrate', 3, 22.65, [0, 0, 1.2]],
    ['stern-crate-port', 'cargoCrate', -3, -18.1, [-1.2, 0, 0]],
    ['stern-barrel-port-center', 'barrel', -1, -18.1, [-1.15, 0, 1.4]],
    ['stern-box-starboard-center', 'cargoBox', 1, -18.1, [1.15, 0, 1.4]],
    ['stern-crate-starboard', 'cargoCrate', 3, -18.1, [1.2, 0, 0]],
  ] as const).map(([id, modelId, x, z, standingPoint]) => {
    const colliderSize = modelId === 'cargoCrate'
      ? [1.05, 1.05, 1.05] as const
      : modelId === 'barrel'
        ? [1.129507, 1.15, 1.129507] as const
        : [0.623579, 0.55, 0.633173] as const;
    const regionId = z > 0 ? 'bow' as const : 'stern' as const;
    return placement(
      id,
      modelId,
      'cargoDeck',
      [x, FREIGHTER_DIMENSIONS.deckY, z],
      0,
      colliderSize,
      endPropSurface(id, modelId, regionId, standingPoint),
    );
  }),
];

const decorations: readonly ShipRoomDecorationSpec[] = [
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
    position: [0, 4.2, crewBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02],
    rotation: [PI_OVER_TWO, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'cabin-wall-art-starboard',
    modelId: 'crewWallArt',
    zoneId: 'crewCabin',
    position: [crewBounds.maxX - SHIP_ROOM_WALL_THICKNESS - 0.02, 3.25, 12.15],
    rotation: [0, PI_OVER_TWO, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-corkboard-aft',
    modelId: 'wheelhouseCorkboard',
    zoneId: 'storageWorkroom',
    position: [0, 3.45, storageBounds.minZ + SHIP_ROOM_WALL_THICKNESS + 0.02],
    rotation: [0, PI, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-box-pallet-a',
    modelId: 'workroomCardboardBox',
    zoneId: 'storageWorkroom',
    position: [4.3, 2.4, -11.55],
    rotation: [0, 0.16, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-box-pallet-b',
    modelId: 'workroomCardboardBox',
    zoneId: 'storageWorkroom',
    position: [4.72, 2.4, -11.17],
    rotation: [0, -0.12, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-box-shelf-top',
    modelId: 'workroomCardboardBox',
    zoneId: 'storageWorkroom',
    position: [-4.95, 4.02, -11.15],
    rotation: [0, -0.08, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'workroom-box-workbench-edge',
    modelId: 'workroomCardboardBox',
    zoneId: 'storageWorkroom',
    position: [3.05, 3.04, -16.7],
    rotation: [0, 0.2, 0],
    scale: [0.9, 0.9, 0.9],
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
    { id: 'start', position: [0, 11], kind: 'start' },
    { id: 'crew-loop-port', position: [-3.5, 9.2], kind: 'loop' },
    { id: 'crew-loop-starboard', position: [3.15, 7.7], kind: 'loop' },
    { id: 'wheelhouse-loop-port', position: [-0.8, 19.5], kind: 'loop' },
    { id: 'wheelhouse-loop-starboard', position: [0.8, 19.5], kind: 'loop' },
    { id: 'workroom-loop-port', position: [-3.3, -14], kind: 'loop' },
    { id: 'workroom-loop-starboard', position: [3, -14], kind: 'loop' },
    { id: 'crew-ladder-route', position: [0, 5.1], kind: 'loop' },
    { id: 'storage-ladder-route', position: [0, -11.2], kind: 'loop' },
    { id: 'deck-hatch-route', position: [-1.5, DECK_HATCH_Z], kind: 'loop' },
    { id: 'mainmast-route', position: [0, -1.1], kind: 'loop' },
    { id: 'port-loop-forward', position: [-EXTERIOR_LANE_CENTER_X, 10.2], kind: 'loop' },
    { id: 'port-loop-aft', position: [-EXTERIOR_LANE_CENTER_X, -12.5], kind: 'loop' },
    { id: 'starboard-loop-forward', position: [EXTERIOR_LANE_CENTER_X, 10.2], kind: 'loop' },
    { id: 'starboard-loop-aft', position: [EXTERIOR_LANE_CENTER_X, -12.5], kind: 'loop' },
    { id: 'bow-port', position: [-4.1, 25.8], kind: 'endDeck' },
    { id: 'bow-center', position: [0, 25.8], kind: 'endDeck' },
    { id: 'bow-starboard', position: [4.1, 25.8], kind: 'endDeck' },
    { id: 'stern-port', position: [-4.1, -25.8], kind: 'endDeck' },
    { id: 'stern-center', position: [0, -25.8], kind: 'endDeck' },
    { id: 'stern-starboard', position: [4.1, -25.8], kind: 'endDeck' },
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
        maxFixtures: 8,
        allowedModelIds: [
          'bedBunk', 'desk', 'bookcaseOpen',
          'crewNightStand', 'crewDesk', 'crewCabinet', 'crewTable',
        ],
      },
    },
    {
      id: 'wheelhouse', bounds: wheelhouseBounds, polygon: wheelhousePolygon, enclosed: true,
      furniturePolicy: {
        maxFixtures: 2,
        allowedModelIds: ['table'],
      },
    },
    {
      id: 'cargoDeck',
      bounds: cargoBounds,
      polygon: [
        [-CARGO_SIDE_X, -21.9], [-HULL_END_SHOULDER_X, -25.58],
        [0, -27.1],
        [HULL_END_SHOULDER_X, -25.58], [CARGO_SIDE_X, -21.9],
        [CARGO_SIDE_X, 21.9], [HULL_END_SHOULDER_X, 25.58],
        [0, 27.1],
        [-HULL_END_SHOULDER_X, 25.58], [-CARGO_SIDE_X, 21.9],
      ],
      excludedZoneIds: ['crewCabin', 'wheelhouse', 'storageWorkroom', 'lifeboatStation'],
      enclosed: false,
      furniturePolicy: {
        maxFixtures: 18,
        allowedModelIds: ['cargoCrate', 'cargoRack', 'timberBench', 'barrel', 'cargoBox'],
      },
    },
    {
      id: 'storageWorkroom', bounds: storageBounds, polygon: rectPolygon(storageBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 7,
        allowedModelIds: [
          'table', 'bookcaseOpen', 'workroomStorageShelf', 'workroomPallet', 'cargoCrate',
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
        -21.8,
        21.8,
      ),
    },
    {
      id: 'starboard-exterior-main',
      className: 'secondary',
      clearWidth: 1.4,
      bounds: rect(
        EXTERIOR_LANE_INNER_X,
        EXTERIOR_LANE_OUTER_X,
        -21.8,
        21.8,
      ),
    },
    { id: 'crew-loop-port', className: 'secondary', clearWidth: 1.4, bounds: rect(-4.4, -3, 6, 12) },
    { id: 'crew-loop-starboard', className: 'secondary', clearWidth: 1.4, bounds: rect(2.45, 3.85, 6, 8.8) },
    { id: 'wheelhouse-loop-port', className: 'secondary', clearWidth: 1.4, bounds: rect(-1.5, -0.1, 17.4, 21.5) },
    { id: 'wheelhouse-loop-starboard', className: 'secondary', clearWidth: 1.4, bounds: rect(0.1, 1.5, 17.4, 21.5) },
    { id: 'workroom-loop-port', className: 'secondary', clearWidth: 1.4, bounds: rect(-4, -2.6, -15.8, -12.2) },
    { id: 'workroom-loop-starboard', className: 'secondary', clearWidth: 1.4, bounds: rect(2.3, 3.7, -15.5, -12.1) },
    { id: 'crew-forward-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-0.7, 0.7, 11.6, 13.1) },
    { id: 'crew-starboard-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(3.2, 4.6, 11.3, 12.7) },
    { id: 'workroom-forward-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-0.7, 0.7, -12.1, -10.7) },
    { id: 'workroom-port-branch', className: 'secondary', clearWidth: 1.4, bounds: rect(-4.2, -2.8, -12.4, -11) },
    { id: 'cargo-port-full-route', className: 'primary', clearWidth: 2.2, bounds: rect(-3.5, -1.3, -10.65, 4.5) },
    { id: 'cargo-starboard-full-route', className: 'primary', clearWidth: 2.2, bounds: rect(1.3, 3.5, -10.65, 4.5) },
    { id: 'cargo-forward-cross-route', className: 'primary', clearWidth: 2.2, bounds: rect(-3.5, 3.5, 2.1, 4.3) },
    { id: 'cargo-aft-cross-route', className: 'primary', clearWidth: 2.2, bounds: rect(-3.5, 3.5, -5.4, -3.2) },
    { id: 'cargo-aft-longitudinal', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, -10.65, DECK_HATCH_Z - DECK_HATCH_DEPTH / 2) },
    { id: 'cargo-aft-longitudinal-forward', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, DECK_HATCH_Z + DECK_HATCH_DEPTH / 2, -1.6) },
    { id: 'deck-hatch-port-bypass', className: 'primary', clearWidth: 2.5, bounds: rect(-deckHatchBypassOuterX, -deckHatchHalfWidthWithClearance, DECK_HATCH_Z - deckHatchHalfDepthWithClearance, DECK_HATCH_Z + deckHatchHalfDepthWithClearance) },
    { id: 'deck-hatch-starboard-bypass', className: 'primary', clearWidth: 2.5, bounds: rect(deckHatchHalfWidthWithClearance, deckHatchBypassOuterX, DECK_HATCH_Z - deckHatchHalfDepthWithClearance, DECK_HATCH_Z + deckHatchHalfDepthWithClearance) },
    { id: 'cargo-forward-longitudinal', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, 1.6, 4.5) },
    { id: 'mainmast-port-bypass', className: 'primary', clearWidth: 2.2, bounds: rect(-2.7, -0.5, -1.6, 1.6) },
    { id: 'mainmast-starboard-bypass', className: 'primary', clearWidth: 2.2, bounds: rect(0.5, 2.7, -1.6, 1.6) },
    { id: 'forward-room-passage', className: 'primary', clearWidth: 2.2, bounds: rect(-1.1, 1.1, 13.5, 17) },
    { id: 'bow-port-approach', className: 'primary', clearWidth: 2.2, bounds: rect(-6, -3.8, 22, 24.8) },
    { id: 'bow-starboard-approach', className: 'primary', clearWidth: 2.2, bounds: rect(3.8, 6, 22, 24.8) },
    { id: 'stern-port-approach', className: 'primary', clearWidth: 2.2, bounds: rect(-6, -3.8, -23.5, -17.4) },
    { id: 'stern-cross', className: 'primary', clearWidth: 2.2, bounds: rect(-3, 3, -25.8, -23.6) },
    { id: 'stern-starboard-approach', className: 'primary', clearWidth: 2.2, bounds: rect(3.8, 6, -23.5, -17.4) },
  ],
  furniture,
  decorations,
  details,
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
    {
      id: 'storage-balcony',
      zoneId: 'storageWorkroom',
      ladderId: 'storage-ladder',
      edge: 'forward',
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
      wallOffset: 0.18,
      rungSpacing: 0.32,
    },
    {
      id: 'storage-ladder',
      zoneId: 'storageWorkroom',
      edge: 'forward',
      centerX: 0,
      width: 0.8,
      wallOffset: 0.18,
      rungSpacing: 0.32,
    },
  ],
  rigging: {
    masts: [{
      id: 'mainmast',
      position: [0, FREIGHTER_DIMENSIONS.deckY, 0],
      height: 14.5,
      baseDiameter: 0.72,
      boomLength: 17.2,
      stays: [
        {
          id: 'fore-port',
          anchor: [crewBounds.minX + 0.42, 3.72, crewBounds.minZ + 0.42],
        },
        {
          id: 'fore-starboard',
          anchor: [crewBounds.maxX - 0.42, 3.72, crewBounds.minZ + 0.42],
        },
        {
          id: 'aft-port',
          anchor: [storageBounds.minX + 0.42, 3.72, storageBounds.maxZ - 0.42],
        },
        {
          id: 'aft-starboard',
          anchor: [storageBounds.maxX - 0.42, 3.72, storageBounds.maxZ - 0.42],
        },
      ],
      sails: [
        {
          id: 'mainsail',
          kind: 'boom',
          furled: true,
          rotationY: Math.PI / 2,
          topY: 14.1,
          footY: 5.85,
          clewZ: -8.6,
          billow: 0.85,
        },
        {
          id: 'staysail',
          kind: 'stay',
          furled: true,
          rotationY: Math.PI / 2,
          topY: 13.6,
          footY: 5.85,
          clewZ: 8.6,
          billow: 0.72,
        },
      ],
    }],
    crowsNest: {
      id: 'mainmast-lookout',
      mastId: 'mainmast',
      floorOffsetY: 10.5,
      outerWidth: 2.4,
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
  machineryClosure: rect(-3.6, 3.6, -22.5, -18.2),
  evacuationRect: evacuationBounds,
};

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validRect(bounds: Rect2): boolean {
  return [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
    && bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ;
}

function finiteTuple(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function overlaps(left: Rect2, right: Rect2): boolean {
  return left.minX < right.maxX && left.maxX > right.minX
    && left.minZ < right.maxZ && left.maxZ > right.minZ;
}

function contains(bounds: Rect2, point: readonly [number, number]): boolean {
  return point[0] >= bounds.minX && point[0] <= bounds.maxX
    && point[1] >= bounds.minZ && point[1] <= bounds.maxZ;
}

function inflate(bounds: Rect2, amount: number): Rect2 {
  return rect(
    bounds.minX - amount,
    bounds.maxX + amount,
    bounds.minZ - amount,
    bounds.maxZ + amount,
  );
}

export function furnitureRect(spec: ShipFurniturePlacementSpec): Rect2 {
  const turns = spec.rotationY === PI_OVER_TWO ? 1 : 0;
  const scaledWidth = spec.colliderSize[0] * spec.scale[0];
  const scaledDepth = spec.colliderSize[2] * spec.scale[2];
  const width = turns ? scaledDepth : scaledWidth;
  const depth = turns ? scaledWidth : scaledDepth;
  return rect(
    spec.position[0] - width / 2,
    spec.position[0] + width / 2,
    spec.position[2] - depth / 2,
    spec.position[2] + depth / 2,
  );
}

export function detailRect(spec: ShipDeckDetailSpec): Rect2 {
  const size = spec.colliderSize ?? [0, 0, 0];
  return detailFootprintRect(spec, size[0], size[2]);
}

export function detailVisualRect(spec: ShipDeckDetailSpec): Rect2 {
  return detailFootprintRect(spec, spec.visualSize[0], spec.visualSize[1]);
}

export function deckHatchRect(spec: ShipDeckHatchSpec): Rect2 {
  const cosine = Math.abs(Math.cos(spec.rotationY));
  const sine = Math.abs(Math.sin(spec.rotationY));
  const width = spec.colliderSize[0] * cosine + spec.colliderSize[2] * sine;
  const depth = spec.colliderSize[0] * sine + spec.colliderSize[2] * cosine;
  return rect(
    spec.position[0] - width / 2,
    spec.position[0] + width / 2,
    spec.position[2] - depth / 2,
    spec.position[2] + depth / 2,
  );
}

function rectangleGap(left: Rect2, right: Rect2): number {
  const x = Math.max(0, left.minX - right.maxX, right.minX - left.maxX);
  const z = Math.max(0, left.minZ - right.maxZ, right.minZ - left.maxZ);
  return Math.hypot(x, z);
}

function detailFootprintRect(
  spec: ShipDeckDetailSpec,
  unscaledWidth: number,
  unscaledDepth: number,
): Rect2 {
  const cosine = Math.abs(Math.cos(spec.rotationY));
  const sine = Math.abs(Math.sin(spec.rotationY));
  const scaledWidth = unscaledWidth * spec.scale[0];
  const scaledDepth = unscaledDepth * spec.scale[2];
  const width = scaledWidth * cosine + scaledDepth * sine;
  const depth = scaledWidth * sine + scaledDepth * cosine;
  return rect(spec.position[0] - width / 2, spec.position[0] + width / 2, spec.position[2] - depth / 2, spec.position[2] + depth / 2);
}

export function mastRect(spec: ShipMastSpec): Rect2 {
  const radius = spec.baseDiameter / 2;
  return rect(spec.position[0] - radius, spec.position[0] + radius, spec.position[2] - radius, spec.position[2] + radius);
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentZ] = polygon[current]!;
    const [previousX, previousZ] = polygon[previous]!;
    const crosses = (currentZ > point[1]) !== (previousZ > point[1])
      && point[0] < ((previousX - currentX) * (point[1] - currentZ))
        / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function measuredLaneWidth(lane: ShipLaneSpec): number {
  return Number(Math.min(
    lane.bounds.maxX - lane.bounds.minX,
    lane.bounds.maxZ - lane.bounds.minZ,
  ).toFixed(9));
}

function secondaryAccessRectangles(
  furnitureSpecs: readonly ShipFurniturePlacementSpec[],
): ShipSecondaryAccessRectangle[] {
  const result: ShipSecondaryAccessRectangle[] = [];
  furnitureSpecs.forEach((owner) => owner.surfaces.forEach((surface) => {
    const center = transformLocalPoint(owner, surface.localPosition);
    surface.standingPoints.forEach((point, index) => {
      const standing = transformLocalPoint(owner, point);
      result.push({
        id: `${surface.id}-access-${index}`,
        bounds: rect(
          Math.min(center[0], standing[0]) - PLAYER_LAYOUT_RADIUS,
          Math.max(center[0], standing[0]) + PLAYER_LAYOUT_RADIUS,
          Math.min(center[1], standing[1]) - PLAYER_LAYOUT_RADIUS,
          Math.max(center[1], standing[1]) + PLAYER_LAYOUT_RADIUS,
        ),
      });
    });
  }));
  return result;
}

function measuredAccessClearance(access: ShipSecondaryAccessRectangle): number {
  const sweptCenterWidth = Math.min(
    access.bounds.maxX - access.bounds.minX,
    access.bounds.maxZ - access.bounds.minZ,
  );
  return Number((sweptCenterWidth + PLAYER_LAYOUT_RADIUS * 2).toFixed(9));
}

function assertUnique(label: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  });
}

function minimumClearance(
  layout: ShipLayoutSpec,
  className: ClearanceClass,
  accessRectangles: readonly ShipSecondaryAccessRectangle[] = [],
): number {
  const widths = layout.lanes
    .filter((lane) => lane.className === className)
    .map(measuredLaneWidth);
  if (className === 'secondary') {
    widths.push(...accessRectangles.map(measuredAccessClearance));
  }
  return widths.length > 0 ? Math.min(...widths) : Number.POSITIVE_INFINITY;
}

function effectiveNavigationTargets(layout: ShipLayoutSpec): ShipNavigationTargetSpec[] {
  const targets = new Map(layout.targets
    .filter(({ kind }) => kind !== 'door' && kind !== 'surface')
    .map((target) => [target.id, target]));
  doorNavigationTargets(layout.doors)
    .forEach((target) => targets.set(target.id, target));
  return [...targets.values()];
}

function wallRectangles(layout: ShipLayoutSpec): Rect2[] {
  const walls: Rect2[] = [];
  const enclosedZones = layout.zones.filter(({ id }) =>
    id === 'crewCabin' || id === 'wheelhouse' || id === 'storageWorkroom');
  enclosedZones.forEach((zone) => {
    const zoneDoors = layout.doors.filter(({ zoneId }) => zoneId === zone.id);
    const portDoor = zoneDoors.find(({ orientation, side }) => orientation === 'side' && side === 'port');
    const starboardDoor = zoneDoors.find(({ orientation, side }) => orientation === 'side' && side === 'starboard');
    const aft = zoneDoors.find(({ orientation }) => orientation === 'aft');
    const addSide = (x: number, door: ShipDoorSpec | undefined): void => {
      if (!door) {
        walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, zone.bounds.minZ, zone.bounds.maxZ));
        return;
      }
      const gapMin = door.center[1] - door.width / 2;
      const gapMax = door.center[1] + door.width / 2;
      walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, zone.bounds.minZ, gapMin));
      walls.push(rect(x - WALL_THICKNESS / 2, x + WALL_THICKNESS / 2, gapMax, zone.bounds.maxZ));
    };
    addSide(zone.bounds.minX, portDoor);
    addSide(zone.bounds.maxX, starboardDoor);
    if (aft) {
      const gapMin = aft.center[0] - aft.width / 2;
      const gapMax = aft.center[0] + aft.width / 2;
      walls.push(rect(zone.bounds.minX, gapMin, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
      walls.push(rect(gapMax, zone.bounds.maxX, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
    } else {
      walls.push(rect(zone.bounds.minX, zone.bounds.maxX, zone.bounds.minZ - WALL_THICKNESS / 2, zone.bounds.minZ + WALL_THICKNESS / 2));
    }
    walls.push(rect(zone.bounds.minX, zone.bounds.maxX, zone.bounds.maxZ - WALL_THICKNESS / 2, zone.bounds.maxZ + WALL_THICKNESS / 2));
  });
  return walls.filter(validRect);
}

function activeObstacles(layout: ShipLayoutSpec): Rect2[] {
  const hullBounds = layout.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
  const opening = layout.rail.starboardOpening;
  const openingMinZ = opening.centerZ - opening.width / 2;
  const openingMaxZ = opening.centerZ + opening.width / 2;
  const innerX = layout.rail.innerFaceX;
  return [
    ...wallRectangles(layout),
    ...layout.furniture.map(furnitureRect),
    ...layout.details.filter(({ colliderSize }) => colliderSize).map(detailRect),
    deckHatchRect(layout.deckHatch),
    ...layout.rigging.masts.map(mastRect),
    layout.machineryClosure,
    rect(-innerX - RAIL_THICKNESS, -innerX, hullBounds.minZ, hullBounds.maxZ),
    rect(innerX, innerX + RAIL_THICKNESS, hullBounds.minZ, openingMinZ),
    rect(innerX, innerX + RAIL_THICKNESS, openingMaxZ, hullBounds.maxZ),
    rect(-innerX, innerX, hullBounds.minZ, hullBounds.minZ + RAIL_THICKNESS),
    rect(-innerX, innerX, hullBounds.maxZ - RAIL_THICKNESS, hullBounds.maxZ),
  ].filter(validRect);
}

interface ShipNavigationGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  toCell(point: readonly [number, number]): number | undefined;
  cellPoint(index: number): readonly [number, number];
}

function buildShipNavigationGrid(layout: ShipLayoutSpec): ShipNavigationGrid {
  const bounds = layout.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
  const minX = bounds.minX;
  const minZ = bounds.minZ;
  const columns = Math.round((bounds.maxX - minX) / GRID_STEP) + 1;
  const rows = Math.round((bounds.maxZ - minZ) / GRID_STEP) + 1;
  const obstacles = activeObstacles(layout).map((obstacle) =>
    inflate(obstacle, PLAYER_LAYOUT_RADIUS));
  const hull = layout.zones.find(({ id }) => id === 'cargoDeck');
  const cellPoint = (index: number): readonly [number, number] => {
    const xIndex = index % columns;
    const zIndex = Math.floor(index / columns);
    return [minX + xIndex * GRID_STEP, minZ + zIndex * GRID_STEP];
  };
  const blocked = new Uint8Array(columns * rows);
  for (let index = 0; index < blocked.length; index += 1) {
    const point = cellPoint(index);
    if (!hull || !pointInPolygon(point, hull.polygon)
      || obstacles.some((obstacle) => contains(obstacle, point))) blocked[index] = 1;
  }
  return {
    minX,
    minZ,
    columns,
    rows,
    blocked,
    toCell(point): number | undefined {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return undefined;
      const xIndex = Math.round((point[0] - minX) / GRID_STEP);
      const zIndex = Math.round((point[1] - minZ) / GRID_STEP);
      if (xIndex < 0 || xIndex >= columns || zIndex < 0 || zIndex >= rows) {
        return undefined;
      }
      return zIndex * columns + xIndex;
    },
    cellPoint,
  };
}

function forEachNavigableNeighbor(
  grid: ShipNavigationGrid,
  index: number,
  visit: (neighbor: number, cost: number) => void,
): void {
  const x = index % grid.columns;
  const z = Math.floor(index / grid.columns);
  for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dz === 0) continue;
    const nextX = x + dx;
    const nextZ = z + dz;
    if (nextX < 0 || nextX >= grid.columns || nextZ < 0 || nextZ >= grid.rows) continue;
    const next = nextZ * grid.columns + nextX;
    if (grid.blocked[next]) continue;
    if (dx !== 0 && dz !== 0) {
      const horizontal = z * grid.columns + nextX;
      const vertical = nextZ * grid.columns + x;
      if (grid.blocked[horizontal] || grid.blocked[vertical]) continue;
    }
    visit(next, dx !== 0 && dz !== 0 ? GRID_STEP * Math.SQRT2 : GRID_STEP);
  }
}

function routeDistance(
  grid: ShipNavigationGrid,
  start: number,
  goal: number,
): number | null {
  if (start === goal) return 0;
  const distances = new Float64Array(grid.blocked.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const closed = new Uint8Array(grid.blocked.length);
  const heapCells: number[] = [];
  const heapScores: number[] = [];
  const goalX = goal % grid.columns;
  const goalZ = Math.floor(goal / grid.columns);
  const heuristic = (cell: number): number => {
    const dx = Math.abs(cell % grid.columns - goalX);
    const dz = Math.abs(Math.floor(cell / grid.columns) - goalZ);
    const diagonal = Math.min(dx, dz);
    return GRID_STEP * (Math.max(dx, dz) + (Math.SQRT2 - 1) * diagonal);
  };
  const push = (cell: number, score: number): void => {
    let child = heapCells.length;
    heapCells.push(cell);
    heapScores.push(score);
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (heapScores[parent]! <= score) break;
      heapCells[child] = heapCells[parent]!;
      heapScores[child] = heapScores[parent]!;
      child = parent;
    }
    heapCells[child] = cell;
    heapScores[child] = score;
  };
  const pop = (): number => {
    const result = heapCells[0]!;
    const lastCell = heapCells.pop()!;
    const lastScore = heapScores.pop()!;
    if (heapCells.length === 0) return result;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= heapCells.length) break;
      const right = left + 1;
      const child = right < heapCells.length && heapScores[right]! < heapScores[left]!
        ? right : left;
      if (heapScores[child]! >= lastScore) break;
      heapCells[parent] = heapCells[child]!;
      heapScores[parent] = heapScores[child]!;
      parent = child;
    }
    heapCells[parent] = lastCell;
    heapScores[parent] = lastScore;
    return result;
  };
  push(start, heuristic(start));
  while (heapCells.length > 0) {
    const current = pop();
    if (closed[current]) continue;
    if (current === goal) return distances[current]!;
    closed[current] = 1;
    forEachNavigableNeighbor(grid, current, (neighbor, cost) => {
      if (closed[neighbor]) return;
      const distance = distances[current]! + cost;
      if (distance >= distances[neighbor]!) return;
      distances[neighbor] = distance;
      push(neighbor, distance + heuristic(neighbor));
    });
  }
  return null;
}

export function createShipRouteMetric(
  layout: ShipLayoutSpec = SHIP_LAYOUT,
): ShipRouteMetric {
  const grid = buildShipNavigationGrid(layout);
  const cache = new Map<string, number | null>();
  return {
    distance(from, to): number | null {
      const fromCell = grid.toCell(from);
      const toCell = grid.toCell(to);
      if (fromCell === undefined || toCell === undefined) return null;
      const first = Math.min(fromCell, toCell);
      const second = Math.max(fromCell, toCell);
      const key = `${first}:${second}`;
      if (cache.has(key)) return cache.get(key)!;
      const distance = grid.blocked[fromCell] || grid.blocked[toCell]
        ? null : routeDistance(grid, fromCell, toCell);
      cache.set(key, distance);
      return distance;
    },
  };
}

export function analyzeShipNavigation(layout: ShipLayoutSpec): ShipNavigationAnalysis {
  const grid = buildShipNavigationGrid(layout);
  const targets = effectiveNavigationTargets(layout);
  const accessRectangles = secondaryAccessRectangles(layout.furniture);
  const start = targets.find(({ kind }) => kind === 'start');
  const startCell = start ? grid.toCell(start.position) : undefined;
  const visited = new Uint8Array(grid.columns * grid.rows);
  if (startCell !== undefined && grid.blocked[startCell] === 0) {
    const queue = new Int32Array(grid.columns * grid.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = startCell;
    visited[startCell] = 1;
    while (head < tail) {
      const current = queue[head++]!;
      forEachNavigableNeighbor(grid, current, (next) => {
        if (visited[next]) return;
        visited[next] = 1;
        queue[tail++] = next;
      });
    }
  }
  const unreachableTargetIds = targets
    .filter((target) => {
      const cell = grid.toCell(target.position);
      return cell === undefined || grid.blocked[cell] === 1 || visited[cell] === 0;
    })
    .map(({ id }) => id);
  const reachableSurfaceStandingPointIds: string[] = [];
  layout.furniture.forEach((owner) => owner.surfaces.forEach((surface) => {
    const candidates = surface.standingPoints.map((point, index) => ({
      id: `${surface.id}-standing-${index}`,
      position: transformLocalPoint(owner, point),
    }));
    const reachable = candidates.filter((candidate) => {
      const cell = grid.toCell(candidate.position);
      return cell !== undefined && grid.blocked[cell] === 0 && visited[cell] === 1;
    });
    reachableSurfaceStandingPointIds.push(...reachable.map(({ id }) => id));
  }));
  const reachableAccessIds = new Set(reachableSurfaceStandingPointIds.map((id) =>
    id.replace('-standing-', '-access-')));
  const reachableAccessRectangles = accessRectangles.filter(({ id }) => reachableAccessIds.has(id));
  return {
    unreachableTargetIds,
    reachableSurfaceStandingPointIds,
    minimumPrimaryClearance: minimumClearance(layout, 'primary'),
    minimumSecondaryClearance: minimumClearance(layout, 'secondary', reachableAccessRectangles),
    secondaryAccessLaneCount: reachableAccessRectangles.length,
    secondaryAccessRectangles: reachableAccessRectangles,
  };
}

export function validateShipLayout(layout: ShipLayoutSpec): void {
  assertUnique('zone', layout.zones.map(({ id }) => id));
  assertUnique('door', layout.doors.map(({ id }) => id));
  assertUnique('furniture', layout.furniture.map(({ id }) => id));
  assertUnique('decoration', layout.decorations.map(({ id }) => id));
  assertUnique('detail', layout.details.map(({ id }) => id));
  assertUnique('balcony', layout.balconies.map(({ id }) => id));
  assertUnique('ladder', layout.ladders.map(({ id }) => id));
  assertUnique('mast', layout.rigging.masts.map(({ id }) => id));
  assertUnique('surface', layout.furniture.flatMap(({ surfaces }) => surfaces.map(({ id }) => id)));
  assertUnique('lane', layout.lanes.map(({ id }) => id));
  assertUnique('target', layout.targets.map(({ id }) => id));

  layout.zones.forEach((zone) => {
    if (!validRect(zone.bounds) || zone.polygon.length < 3
      || zone.polygon.some((point) => !finiteTuple(point))) {
      throw new Error(`Zone ${zone.id} must have positive dimensions`);
    }
    if (!Number.isInteger(zone.furniturePolicy.maxFixtures)
      || zone.furniturePolicy.maxFixtures < 0
      || zone.furniturePolicy.clearCenter && !validRect(zone.furniturePolicy.clearCenter)) {
      throw new Error(`Zone ${zone.id} has an invalid furniture policy`);
    }
  });
  const furnitureAssetIds = new Set<ShipFurnitureAssetId>(SHIP_FURNITURE_MODEL_IDS);
  layout.decorations.forEach((decoration) => {
    const ownerZone = layout.zones.find(({ id }) => id === decoration.zoneId);
    if (!ownerZone) {
      throw new Error(`Decoration ${decoration.id} has no owning zone ${decoration.zoneId}`);
    }
    if (!furnitureAssetIds.has(decoration.modelId)
      || !finiteTuple(decoration.position)
      || !finiteTuple(decoration.rotation)
      || decoration.scale.some((value) => !positive(value))) {
      throw new Error(`Decoration ${decoration.id} has an invalid model or transform`);
    }
    const [x, y, z] = decoration.position;
    if (x < ownerZone.bounds.minX || x > ownerZone.bounds.maxX
      || z < ownerZone.bounds.minZ || z > ownerZone.bounds.maxZ
      || y < FREIGHTER_DIMENSIONS.deckY
      || y > FREIGHTER_DIMENSIONS.deckY + SHIP_ROOM_WALL_HEIGHT + 1e-6) {
      throw new Error(`Decoration ${decoration.id} crosses owning zone ${decoration.zoneId} bounds`);
    }
  });
  const crewCabin = layout.zones.find(({ id }) => id === 'crewCabin');
  const wheelhouse = layout.zones.find(({ id }) => id === 'wheelhouse');
  const storageWorkroom = layout.zones.find(({ id }) => id === 'storageWorkroom');
  if (!crewCabin || !wheelhouse || !storageWorkroom
    || Math.abs(wheelhouse.bounds.minZ - crewCabin.bounds.maxZ - 3.5) > 1e-9) {
    throw new Error('Forward-room gap between crewCabin and wheelhouse must be exactly 3.5');
  }
  if (layout.balconies.length !== 2 || layout.ladders.length !== 2) {
    throw new Error('Layout must define exactly two balconies and two ladders');
  }
  const balconyZoneEdges: Readonly<Record<ShipBalconyZoneId, ShipTransverseEdge>> = {
    crewCabin: 'aft',
    storageWorkroom: 'forward',
  };
  layout.ladders.forEach((ladder) => {
    if (!Number.isFinite(ladder.centerX) || !positive(ladder.width)
      || !positive(ladder.wallOffset) || !positive(ladder.rungSpacing)) {
      throw new Error(`Ladder ${ladder.id} must have positive finite dimensions`);
    }
    if (ladder.centerX !== 0) {
      throw new Error(`Ladder ${ladder.id} must be centered at x = 0`);
    }
    if (ladder.zoneId !== 'crewCabin' && ladder.zoneId !== 'storageWorkroom') {
      throw new Error(`Ladder ${ladder.id} cannot be assigned to ${ladder.zoneId}`);
    }
    if (balconyZoneEdges[ladder.zoneId] !== ladder.edge) {
      throw new Error(`Ladder ${ladder.id} must use the mast-facing ${balconyZoneEdges[ladder.zoneId]} edge`);
    }
  });
  const balconyLadderIds = new Set<string>();
  layout.balconies.forEach((balcony) => {
    if (!positive(balcony.coamingHeight) || !positive(balcony.openingWidth)) {
      throw new Error(`Balcony ${balcony.id} must have positive finite dimensions`);
    }
    if (balcony.zoneId !== 'crewCabin' && balcony.zoneId !== 'storageWorkroom') {
      throw new Error(`Balcony ${balcony.id} cannot be assigned to ${balcony.zoneId}`);
    }
    if (balconyZoneEdges[balcony.zoneId] !== balcony.edge) {
      throw new Error(`Balcony ${balcony.id} must use the mast-facing ${balconyZoneEdges[balcony.zoneId]} edge`);
    }
    const ladder = layout.ladders.find(({ id }) => id === balcony.ladderId);
    if (!ladder) {
      throw new Error(`Balcony ${balcony.id} references missing ladder ${balcony.ladderId}`);
    }
    if (ladder.zoneId !== balcony.zoneId || ladder.edge !== balcony.edge) {
      throw new Error(`Balcony ${balcony.id} ladder ${ladder.id} must share its zone and edge`);
    }
    if (balcony.openingWidth < ladder.width + 2 * PLAYER_LAYOUT_RADIUS) {
      throw new Error(`Balcony ${balcony.id} opening must fit its ladder and player clearance`);
    }
    balconyLadderIds.add(balcony.ladderId);
  });
  if (balconyLadderIds.size !== layout.balconies.length
    || balconyLadderIds.size !== layout.ladders.length) {
    throw new Error('Each balcony must reference one unique ladder');
  }
  layout.doors.forEach((door) => {
    if (!finiteTuple(door.center) || !validRect(door.approach)) {
      throw new Error(`Door ${door.id} must use finite rectangle coordinates`);
    }
    if (!Number.isFinite(door.width) || door.width < 2.4 || door.width > 2.6) {
      throw new Error(`Door ${door.id} width ${door.width} must be between 2.4 and 2.6`);
    }
  });
  layout.lanes.forEach((lane) => {
    if (!validRect(lane.bounds)) {
      throw new Error(`Lane ${lane.id} must use finite rectangle coordinates`);
    }
    if (!positive(lane.clearWidth)) {
      throw new Error(`Lane ${lane.id} must have positive dimensions`);
    }
    const required = lane.className === 'primary' ? 2.2 : 1.4;
    const measured = measuredLaneWidth(lane);
    if (lane.clearWidth < required || measured < required - 1e-6) {
      throw new Error(`Lane ${lane.id} measured ${measured} is below ${lane.className} clearance ${required}`);
    }
  });
  if (!positive(layout.rail.innerFaceX)
    || !Number.isFinite(layout.rail.starboardOpening.centerZ)) {
    throw new Error('Rail dimensions must be positive');
  }
  if (!Number.isFinite(layout.rail.height)
    || layout.rail.height < 1 || layout.rail.height > 1.1) {
    throw new Error(`Rail height ${layout.rail.height} must be between 1.0 and 1.1`);
  }
  if (!positive(layout.rail.starboardOpening.width)
    || layout.rail.starboardOpening.width < 3) {
    throw new Error(`Rail opening width ${layout.rail.starboardOpening.width} must be at least 3.0`);
  }
  if (!validRect(layout.machineryClosure) || !validRect(layout.evacuationRect)) {
    throw new Error('Machinery closure and evacuation rectangle must use finite coordinates');
  }
  layout.targets.forEach((target) => {
    if (!finiteTuple(target.position)) throw new Error(`Target ${target.id} must use finite coordinates`);
  });

  const cargoZone = layout.zones.find(({ id }) => id === 'cargoDeck');
  if (!cargoZone) throw new Error('Layout must define the cargoDeck zone');
  const rectCorners = (bounds: Rect2): readonly (readonly [number, number])[] => [
    [bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ],
  ];
  const detailVisualBounds = layout.details.map((spec) => {
    if (!finiteTuple(spec.position) || !Number.isFinite(spec.rotationY)
      || spec.scale.some((value) => !positive(value))
      || !spec.visualSize || spec.visualSize.some((value) => !positive(value))) {
      throw new Error(`Detail ${spec.id} must have a positive visual footprint`);
    }
    if (spec.colliderSize?.some((value) => !positive(value))) {
      throw new Error(`Detail ${spec.id} must have finite transforms and positive dimensions`);
    }
    const bounds = detailVisualRect(spec);
    if (!validRect(bounds)
      || !pointInPolygon([spec.position[0], spec.position[2]], cargoZone.polygon)) {
      throw new Error(`Detail ${spec.id} lies outside the cargoDeck hull polygon`);
    }
    return { spec, bounds };
  });
  detailVisualBounds.forEach((left, index) => {
    detailVisualBounds.slice(index + 1).forEach((right) => {
      if (rectangleGap(left.bounds, right.bounds) < SHIP_DECK_DETAIL_MIN_GAP) {
        throw new Error(
          `Details ${left.spec.id} and ${right.spec.id} must remain at least 1 metre apart`,
        );
      }
    });
  });
  const detailBounds = layout.details.flatMap((spec) => {
    if (!finiteTuple(spec.position) || !Number.isFinite(spec.rotationY)
      || spec.scale.some((value) => !positive(value))
      || spec.colliderSize?.some((value) => !positive(value))) {
      throw new Error(`Detail ${spec.id} must have finite transforms and positive dimensions`);
    }
    if (!spec.colliderSize) return [];
    const bounds = detailRect(spec);
    if (!validRect(bounds) || rectCorners(bounds).some((corner) => !pointInPolygon(corner, cargoZone.polygon))) {
      throw new Error(`Detail ${spec.id} collider crosses the cargoDeck hull polygon`);
    }
    return [{ id: spec.id, bounds }];
  });
  const hatch = layout.deckHatch;
  if (hatch.id !== 'deck-hatch' || !finiteTuple(hatch.position)
    || !Number.isFinite(hatch.rotationY) || hatch.size.some((value) => !positive(value))
    || hatch.colliderSize.some((value) => !positive(value))) {
    throw new Error('Deck hatch must have finite transforms and positive dimensions');
  }
  const hatchBounds = deckHatchRect(hatch);
  if (!validRect(hatchBounds)
    || rectCorners(hatchBounds).some((corner) => !pointInPolygon(corner, cargoZone.polygon))) {
    throw new Error('Deck hatch collider crosses the cargoDeck hull polygon');
  }
  if (layout.rigging.masts.length !== 1 || layout.rigging.masts[0]?.id !== 'mainmast') {
    throw new Error('Layout must define exactly one mainmast');
  }
  const mastBounds = layout.rigging.masts.map((spec) => {
    if (!finiteTuple(spec.position) || !positive(spec.height) || !positive(spec.baseDiameter)
      || !positive(spec.boomLength)) {
      throw new Error(`Mast ${spec.id} has invalid dimensions or stay anchors`);
    }
    const requiredStayIds: readonly ShipStayId[] = [
      'fore-port', 'fore-starboard', 'aft-port', 'aft-starboard',
    ];
    if (spec.stays.length !== requiredStayIds.length
      || requiredStayIds.some((id) => !spec.stays.some((stay) => stay.id === id))) {
      throw new Error(`Mast ${spec.id} must define four roof-corner stays`);
    }
    assertUnique(`stay on mast ${spec.id}`, spec.stays.map(({ id }) => id));
    spec.stays.forEach(({ id, anchor }) => {
      const fore = id.startsWith('fore-');
      const port = id.endsWith('-port');
      if (!finiteTuple(anchor) || anchor[1] < 0 || anchor[1] >= spec.height
        || (fore ? anchor[2] <= 0 : anchor[2] >= 0)
        || (port ? anchor[0] >= 0 : anchor[0] <= 0)) {
        throw new Error(`Mast ${spec.id} stay ${id} has an invalid roof anchor`);
      }
      const roomBounds = fore ? crewCabin.bounds : storageWorkroom.bounds;
      const sideInset = port
        ? anchor[0] - roomBounds.minX
        : roomBounds.maxX - anchor[0];
      const nearEdgeInset = fore
        ? anchor[2] - roomBounds.minZ
        : roomBounds.maxZ - anchor[2];
      if (sideInset < 0.3 || nearEdgeInset < 0.3) {
        throw new Error(`Mast ${spec.id} stay ${id} overlaps the roof railing`);
      }
    });
    if (spec.sails.length !== 2
      || !spec.sails.some(({ id }) => id === 'mainsail')
      || !spec.sails.some(({ id }) => id === 'staysail')) {
      throw new Error(`Mast ${spec.id} must define mainsail and staysail`);
    }
    assertUnique(`sail on mast ${spec.id}`, spec.sails.map(({ id }) => id));
    spec.sails.forEach((sail) => {
      const requiredKind = sail.id === 'mainsail' ? 'boom' : 'stay';
      if (sail.kind !== requiredKind) {
        throw new Error(`Mast ${spec.id} sail ${sail.id} must use ${requiredKind} rig kind`);
      }
      if (!Number.isFinite(sail.topY) || !Number.isFinite(sail.footY)
        || !Number.isFinite(sail.clewZ) || !Number.isFinite(sail.billow)
        || !Number.isFinite(sail.rotationY)
        || typeof sail.furled !== 'boolean'
        || sail.topY <= sail.footY || sail.clewZ === 0 || !positive(sail.billow)) {
        throw new Error(`Mast ${spec.id} sail ${sail.id} has invalid dimensions`);
      }
      if (sail.footY < SHIP_SAIL_CLOTH_MIN_Y) {
        throw new Error(`Mast ${spec.id} sail ${sail.id} violates cloth clearance`);
      }
      if (sail.topY > spec.height - SHIP_SAIL_TOP_OFFSET) {
        throw new Error(`Mast ${spec.id} sail ${sail.id} exceeds mast height bounds`);
      }
    });
    const bounds = mastRect(spec);
    if (rectCorners(bounds).some((corner) => !pointInPolygon(corner, cargoZone.polygon))) {
      throw new Error(`Mast ${spec.id} base crosses the cargoDeck hull polygon`);
    }
    if (spec.stays.some(({ anchor }) => !pointInPolygon(
      [spec.position[0] + anchor[0], spec.position[2] + anchor[2]],
      cargoZone.polygon,
    ))) {
      throw new Error(`Mast ${spec.id} stay anchors must lie inside the cargoDeck hull polygon`);
    }
    return { id: spec.id, bounds };
  });
  const crowsNest = layout.rigging.crowsNest;
  const crowsNestMast = layout.rigging.masts.find(({ id }) => id === crowsNest.mastId);
  if (!crowsNestMast) {
    throw new Error(`Crow's nest ${crowsNest.id} references missing mast ${crowsNest.mastId}`);
  }
  if (!positive(crowsNest.floorOffsetY) || !positive(crowsNest.outerWidth)
    || !positive(crowsNest.openingSize) || !positive(crowsNest.guardHeight)
    || !positive(crowsNest.ladder.width) || !positive(crowsNest.ladder.mastOffset)
    || !positive(crowsNest.ladder.rungSpacing)) {
    throw new Error(`Crow's nest ${crowsNest.id} must have positive finite dimensions`);
  }
  if (crowsNest.openingSize < 0.9) {
    throw new Error(`Crow's nest ${crowsNest.id} opening must be at least 0.9 metres`);
  }
  if (crowsNest.floorOffsetY > crowsNestMast.height) {
    throw new Error(`Crow's nest ${crowsNest.id} floor exceeds mast height`);
  }

  const physicalSlots = new Map<string, {
    readonly ownerId: string;
    readonly surface: ShipItemSurfaceSpec;
  }[]>();
  const furnitureBounds = layout.furniture.map((spec) => {
    if (![0, PI_OVER_TWO, PI].includes(spec.rotationY)) {
      throw new Error(`Furniture ${spec.id} has unsupported rotation ${spec.rotationY}`);
    }
    if (!finiteTuple(spec.position) || spec.colliderSize.some((value) => !positive(value))
      || spec.scale.some((value) => !positive(value))) {
      throw new Error(`Furniture ${spec.id} must have positive dimensions`);
    }
    const ownerZone = layout.zones.find(({ id }) => id === spec.zoneId);
    if (!ownerZone) {
      throw new Error(`Furniture ${spec.id} has no owning zone ${spec.zoneId}`);
    }
    if (!ownerZone.furniturePolicy.allowedModelIds.includes(spec.modelId)) {
      throw new Error(
        `Furniture ${spec.id} model ${spec.modelId} is in the wrong room ${spec.zoneId}`,
      );
    }
    const exactModel = EXACT_FURNITURE_MODEL_BY_ID[spec.id];
    if (exactModel && spec.modelId !== exactModel) {
      throw new Error(
        `Furniture ${spec.id} model ${spec.modelId} violates exact role ${exactModel}`,
      );
    }
    const bounds = furnitureRect(spec);
    if (bounds.minX < ownerZone.bounds.minX - 1e-6
      || bounds.maxX > ownerZone.bounds.maxX + 1e-6
      || bounds.minZ < ownerZone.bounds.minZ - 1e-6
      || bounds.maxZ > ownerZone.bounds.maxZ + 1e-6) {
      throw new Error(`Furniture ${spec.id} crosses owning zone ${spec.zoneId} bounds`);
    }
    if (spec.zoneId === 'cargoDeck') {
      const corners: readonly (readonly [number, number])[] = [
        [bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
        [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ],
      ];
      if (corners.some((corner) => !pointInPolygon(corner, ownerZone.polygon))) {
        throw new Error(`Furniture ${spec.id} crosses owning zone ${spec.zoneId} hull polygon`);
      }
    }
    spec.surfaces.forEach((surface) => {
      if (!SCAVENGE_REGION_IDS.has(surface.regionId)) {
        throw new Error(`Surface ${surface.id} has an unknown scavenge region`);
      }
      if (surface.categories.length === 0 || !positive(surface.footprint.width)
        || !positive(surface.footprint.depth) || !positive(surface.clearanceHeight)
        || surface.standingPoints.length === 0 || !finiteTuple(surface.localPosition)
        || !finiteTuple(surface.localRotation)
        || surface.standingPoints.some((point) => !finiteTuple(point))) {
        throw new Error(`Surface ${surface.id} owned by ${spec.id} is incomplete`);
      }
      if (!surface.id.startsWith(`${spec.id}:`)) {
        throw new Error(`Surface ${surface.id} does not belong to furniture ${spec.id}`);
      }
      if (!surface.physicalSlotId.startsWith(`${spec.id}:`)) {
        throw new Error(`Physical slot ${surface.physicalSlotId} does not belong to furniture ${spec.id}`);
      }
      if (Math.abs(surface.localPosition[0]) + surface.footprint.width / 2
          > spec.colliderSize[0] / 2 + 1e-6
        || Math.abs(surface.localPosition[2]) + surface.footprint.depth / 2
          > spec.colliderSize[2] / 2 + 1e-6
        || surface.localPosition[1] <= 0
        || surface.localPosition[1] > spec.colliderSize[1] + 1e-6) {
        throw new Error(`Surface ${surface.id} exceeds furniture ${spec.id} top bounds`);
      }
      const aliases = physicalSlots.get(surface.physicalSlotId) ?? [];
      aliases.push({ ownerId: spec.id, surface });
      physicalSlots.set(surface.physicalSlotId, aliases);
    });
    return { spec, bounds };
  });
  physicalSlots.forEach((aliases, physicalSlotId) => {
    if (aliases.length === 1) return;
    const [first, second] = aliases;
    const sameTuple = (left: readonly number[], right: readonly number[]): boolean =>
      left.length === right.length && left.every((value, index) => value === right[index]);
    if (aliases.length !== 2 || !first || !second
      || first.ownerId !== second.ownerId
      || first.surface.fallback === second.surface.fallback
      || !sameTuple(first.surface.localPosition, second.surface.localPosition)
      || !sameTuple(first.surface.localRotation, second.surface.localRotation)
      || first.surface.footprint.width !== second.surface.footprint.width
      || first.surface.footprint.depth !== second.surface.footprint.depth
      || first.surface.clearanceHeight !== second.surface.clearanceHeight) {
      throw new Error(`Physical slot ${physicalSlotId} has invalid ownership aliases`);
    }
  });
  const accessBounds = secondaryAccessRectangles(layout.furniture);
  detailVisualBounds.filter(({ spec }) => !spec.colliderSize).forEach((detail) => {
    furnitureBounds.filter(({ spec }) => spec.surfaces.length > 0).forEach((furnitureObstacle) => {
      if (overlaps(detail.bounds, furnitureObstacle.bounds)) {
        throw new Error(
          `${detail.spec.id} visual footprint overlaps searchable furniture ${furnitureObstacle.spec.id}`,
        );
      }
    });
    accessBounds.forEach((access) => {
      if (overlaps(detail.bounds, access.bounds)) {
        throw new Error(`${detail.spec.id} visual footprint overlaps item access ${access.id}`);
      }
    });
  });
  const authoredObstacles = [
    ...detailBounds,
    { id: hatch.id, bounds: hatchBounds },
    ...mastBounds,
  ];
  authoredObstacles.forEach((obstacle, index) => {
    layout.lanes.filter(({ className }) => className === 'primary').forEach((lane) => {
      if (overlaps(obstacle.bounds, lane.bounds)) {
        throw new Error(`${obstacle.id} overlaps primary lane ${lane.id}`);
      }
    });
    layout.doors.forEach((door) => {
      if (overlaps(obstacle.bounds, door.approach)) {
        throw new Error(`${obstacle.id} overlaps protected approach for ${door.id}`);
      }
    });
    if (overlaps(obstacle.bounds, layout.evacuationRect)) {
      throw new Error(`${obstacle.id} overlaps evacuation rectangle`);
    }
    if (overlaps(obstacle.bounds, layout.machineryClosure)) {
      throw new Error(`${obstacle.id} overlaps machinery closure`);
    }
    furnitureBounds.forEach((furnitureObstacle) => {
      if (overlaps(obstacle.bounds, furnitureObstacle.bounds)) {
        throw new Error(`${obstacle.id} overlaps ${furnitureObstacle.spec.id}`);
      }
    });
    if (obstacle.id === hatch.id) {
      accessBounds.forEach((access) => {
        if (overlaps(obstacle.bounds, access.bounds)) {
          throw new Error(`${obstacle.id} overlaps item access ${access.id}`);
        }
      });
    }
    authoredObstacles.slice(index + 1).forEach((other) => {
      if (overlaps(obstacle.bounds, other.bounds)) {
        throw new Error(`${obstacle.id} overlaps ${other.id}`);
      }
    });
  });
  furnitureBounds.forEach((left, index) => {
    furnitureBounds.slice(index + 1).forEach((right) => {
      if (overlaps(left.bounds, right.bounds)) {
        throw new Error(`${left.spec.id} overlaps ${right.spec.id}`);
      }
    });
    layout.doors.forEach((door) => {
      if (overlaps(left.bounds, door.approach)) {
        throw new Error(`${left.spec.id} overlaps protected approach for ${door.id}`);
      }
    });
    const ownerZone = layout.zones.find(({ id }) => id === left.spec.zoneId)!;
    if (ownerZone.furniturePolicy.clearCenter
      && overlaps(left.bounds, ownerZone.furniturePolicy.clearCenter)) {
      throw new Error(`Furniture ${left.spec.id} overlaps clear center for ${left.spec.zoneId}`);
    }
    layout.lanes.filter(({ className }) => className === 'primary').forEach((lane) => {
      if (overlaps(left.bounds, lane.bounds)) {
        throw new Error(`${left.spec.id} overlaps primary lane ${lane.id}`);
      }
    });
    if (overlaps(left.bounds, layout.evacuationRect)) {
      throw new Error(`${left.spec.id} overlaps evacuation rectangle`);
    }
  });
  layout.zones.forEach((zone) => {
    const fixtureCount = layout.furniture.filter(({ zoneId }) => zoneId === zone.id).length;
    if (fixtureCount > zone.furniturePolicy.maxFixtures) {
      throw new Error(
        `Zone ${zone.id} has ${fixtureCount} fixtures above maximum ${zone.furniturePolicy.maxFixtures}`,
      );
    }
  });

  const currentTargets = [
    ...layout.targets.filter(({ kind }) => kind !== 'door' && kind !== 'surface'),
    ...doorNavigationTargets(layout.doors),
    ...surfaceNavigationTargets(layout.furniture),
  ];
  assertUnique('navigation target', currentTargets.map(({ id }) => id));

  const opening = layout.rail.starboardOpening;
  const openingMinZ = opening.centerZ - opening.width / 2;
  const openingMaxZ = opening.centerZ + opening.width / 2;
  const evacuation = layout.targets.find(({ kind }) => kind === 'evacuation');
  if (openingMinZ > lifeboatBounds.minZ || openingMaxZ < lifeboatBounds.maxZ || !evacuation
    || evacuation.position[1] < openingMinZ || evacuation.position[1] > openingMaxZ) {
    throw new Error('Starboard rail opening must cover the lifeboat station and evacuation target');
  }

  const analysis = analyzeShipNavigation(layout);
  const reachableStandingPoints = new Set(analysis.reachableSurfaceStandingPointIds);
  layout.furniture.forEach((owner) => owner.surfaces.forEach((surface) => {
    const reachable = surface.standingPoints.some((_point, index) =>
      reachableStandingPoints.has(`${surface.id}-standing-${index}`));
    if (!reachable) {
      throw new Error(`Surface ${surface.id} has no reachable standing point`);
    }
  }));
  analysis.secondaryAccessRectangles.forEach((access) => {
    if (!validRect(access.bounds) || measuredAccessClearance(access) < 1.4 - 1e-6) {
      throw new Error(`Secondary access lane ${access.id} is invalid`);
    }
  });
  if (analysis.unreachableTargetIds.length > 0) {
    throw new Error(`Unreachable navigation targets: ${analysis.unreachableTargetIds.join(', ')}`);
  }
}
