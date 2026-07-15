import type { ShipItemCategory } from './ShipItemPlacement';

export const PLAYER_LAYOUT_RADIUS = 0.35;
export const FREIGHTER_DIMENSIONS = { width: 12.5, length: 36, deckY: 2.22 } as const;

export type ShipZoneId =
  | 'crewCabin' | 'wheelhouse' | 'cargoDeck'
  | 'storageWorkroom' | 'lifeboatStation';
export type ClearanceClass = 'primary' | 'secondary';
export type ShipFurnitureAssetId =
  | 'bedBunk' | 'desk' | 'chairDesk' | 'bookcaseOpen'
  | 'bookcaseClosedDoors' | 'table' | 'sideTableDrawers';
export type ShipFurnitureKind = ShipFurnitureAssetId | 'cargoCrate' | 'cargoRack';

export interface Rect2 {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
}

export interface ShipItemSurfaceSpec {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly categories: readonly ShipItemCategory[];
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

export interface ShipNavigationTargetSpec {
  readonly id: string;
  readonly position: readonly [number, number];
  readonly kind: 'start' | 'door' | 'loop' | 'surface' | 'evacuation' | 'endDeck';
}

export interface ShipLayoutSpec {
  readonly zones: readonly ShipZoneSpec[];
  readonly doors: readonly ShipDoorSpec[];
  readonly lanes: readonly ShipLaneSpec[];
  readonly furniture: readonly ShipFurniturePlacementSpec[];
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

export interface ShipSecondaryAccessRectangle {
  readonly id: string;
  readonly bounds: Rect2;
}

const PI_OVER_TWO = 1.5707963267948966;
const PI = 3.141592653589793;
const WALL_THICKNESS = 0.2;
const RAIL_THICKNESS = 0.25;
const GRID_STEP = 0.1;
const GRID_MIN_X = -6;
const GRID_MAX_X = 6;
const GRID_MIN_Z = -17.6;
const GRID_MAX_Z = 17.6;

const EXACT_FURNITURE_MODEL_BY_ID: Readonly<Record<string, ShipFurnitureKind>> = Object.freeze({
  'cabin-bunk-port': 'bedBunk',
  'cabin-bunk-starboard': 'bedBunk',
  'cabin-desk-aft': 'desk',
  'cabin-bookcase-forward': 'bookcaseOpen',
  'helm-desk-forward': 'desk',
  'chart-table-port': 'sideTableDrawers',
  'instrument-cabinet-starboard-aft': 'sideTableDrawers',
  'instrument-cabinet-starboard-forward': 'sideTableDrawers',
  'workbench-port': 'table',
  'workbench-starboard': 'table',
  'storage-shelf-port': 'bookcaseOpen',
  'storage-shelf-starboard': 'bookcaseOpen',
  'cargo-rod-rack-forward-port': 'cargoRack',
  'cargo-crate-forward-starboard': 'cargoCrate',
  'cargo-crate-aft-port': 'cargoCrate',
  'cargo-crate-aft-starboard': 'cargoCrate',
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

const crewBounds = rect(-3.7, 3.7, 3.5, 9.8);
const wheelhouseBounds = rect(-3.7, 3.7, 10.8, 13.8);
const storageBounds = rect(-3.8, 3.8, -10.4, -6.5);
const lifeboatBounds = rect(3.8, 6, -8.1, -4.9);
const cargoBounds = rect(-6, 6, -17.6, 17.6);

const doors: readonly ShipDoorSpec[] = [
  sideDoor('cabin-port-door', 'crewCabin', 'port', -3.7, 5.4, 2),
  sideDoor('cabin-starboard-door', 'crewCabin', 'starboard', 3.7, 5.4, 2),
  aftDoor('wheelhouse-aft-door', 'wheelhouse', 10.8, 0, 2.2),
  sideDoor('wheelhouse-port-door', 'wheelhouse', 'port', -3.7, 12.1, 2),
  sideDoor('storage-port-door', 'storageWorkroom', 'port', -3.8, -7.75, 2),
  sideDoor('storage-starboard-door', 'storageWorkroom', 'starboard', 3.8, -7.75, 2),
];

function itemSurface(
  furnitureId: string,
  suffix: string,
  categories: readonly ShipItemCategory[],
  localPosition: readonly [number, number, number],
  footprint: { readonly width: number; readonly depth: number },
  clearanceHeight: number,
  standingPoints: readonly (readonly [number, number, number])[],
  options: {
    readonly localRotation?: readonly [number, number, number];
    readonly fallback?: boolean;
    readonly physicalSlotSuffix?: string;
  } = {},
): ShipItemSurfaceSpec {
  return {
    id: `${furnitureId}:${suffix}`,
    physicalSlotId: `${furnitureId}:${options.physicalSlotSuffix ?? suffix}`,
    categories,
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
): readonly ShipItemSurfaceSpec[] {
  return ([-0.43, 0.43] as const).map((x, index) => {
    const side = index === 0 ? 'left' : 'right';
    return itemSurface(
      furnitureId,
      `top-${side}`,
      categories,
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
): readonly ShipItemSurfaceSpec[] {
  return ([-0.52, 0.52] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    categories,
    [x, 0.82, 0],
    { width: 0.8, depth: 0.72 },
    0.82,
    [[x, 0, -1.25], [x, 0, 1.25]],
  ));
}

function bookcaseSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
): readonly ShipItemSurfaceSpec[] {
  const heights = [0.273, 0.778, 1.283, 1.787] as const;
  return heights.map((height, levelIndex) => itemSurface(
    furnitureId,
    `level-${levelIndex + 1}`,
    categories,
    [0, height, -0.08],
    { width: 0.7, depth: 0.35 },
    levelIndex < 3 ? 0.43 : 0.82,
    [[0, 0, -0.85]],
  ));
}

function cabinetTopSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  localY = 1.85,
): readonly ShipItemSurfaceSpec[] {
  return ([-0.2, 0.2] as const).map((x, index) => itemSurface(
    furnitureId,
    `top-${index === 0 ? 'left' : 'right'}`,
    categories,
    [x, localY, 0],
    { width: 0.32, depth: 0.4 },
    0.82,
    [[x, 0, -0.85]],
  ));
}

function sideTableSurfaces(
  furnitureId: string,
  categories: readonly ShipItemCategory[],
  standingZ = -0.9,
): readonly ShipItemSurfaceSpec[] {
  return [itemSurface(
    furnitureId,
    'top',
    categories,
    [0, 0.75, 0],
    { width: 0.85, depth: 0.32 },
    0.75,
    [[0, 0, standingZ]],
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
): ShipFurniturePlacementSpec {
  return { id, modelId, zoneId, position, rotationY, colliderSize, surfaces, scale: [1, 1, 1] };
}

const furniture: readonly ShipFurniturePlacementSpec[] = [
  placement('cabin-bunk-port', 'bedBunk', 'crewCabin', [-3, 2.22, 7.9], 0, [1.147, 1.708, 2.2]),
  placement('cabin-bunk-starboard', 'bedBunk', 'crewCabin', [3, 2.22, 7.9], 0, [1.147, 1.708, 2.2]),
  placement('cabin-desk-aft', 'desk', 'crewCabin', [-1.8, 2.22, 4.05], 0, [1.7, 0.89, 0.908], deskSurfaces('cabin-desk-aft', ['foodWater'])),
  placement('cabin-bookcase-forward', 'bookcaseOpen', 'crewCabin', [0, 2.22, 9.48], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('cabin-bookcase-forward', ['foodWater'])),
  placement('helm-desk-forward', 'desk', 'wheelhouse', [0, 2.22, 13.25], 0, [1.7, 0.89, 0.908], deskSurfaces('helm-desk-forward', ['medicalEmergency'])),
  placement('chart-table-port', 'sideTableDrawers', 'wheelhouse', [2.1, 2.22, 11.2], 0, [1.043, 0.75, 0.434], sideTableSurfaces('chart-table-port', ['medicalEmergency'], 0.9)),
  placement('instrument-cabinet-starboard-aft', 'sideTableDrawers', 'wheelhouse', [3.2, 2.22, 12], PI_OVER_TWO, [1.043, 0.75, 0.434], sideTableSurfaces('instrument-cabinet-starboard-aft', ['medicalEmergency'])),
  placement('instrument-cabinet-starboard-forward', 'sideTableDrawers', 'wheelhouse', [3.2, 2.22, 13.15], PI_OVER_TWO, [1.043, 0.75, 0.434], sideTableSurfaces('instrument-cabinet-starboard-forward', ['medicalEmergency'])),
  placement('workbench-port', 'table', 'storageWorkroom', [-2.55, 2.22, -9.78], 0, [2.112, 0.82, 1.123], tableSurfaces('workbench-port', ['toolsRepair'])),
  placement('workbench-starboard', 'table', 'storageWorkroom', [2.55, 2.22, -9.78], 0, [2.112, 0.82, 1.123], tableSurfaces('workbench-starboard', ['toolsRepair'])),
  placement('storage-shelf-port', 'bookcaseOpen', 'storageWorkroom', [-1.7, 2.22, -6.82], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('storage-shelf-port', ['toolsRepair'])),
  placement('storage-shelf-starboard', 'bookcaseOpen', 'storageWorkroom', [1.7, 2.22, -6.82], 0, [0.841, 1.85, 0.526], bookcaseSurfaces('storage-shelf-starboard', ['toolsRepair'])),
  placement('cargo-rod-rack-forward-port', 'cargoRack', 'cargoDeck', [-2.6, 2.22, 2.3], 0, [2.1, 0.55, 0.75], [itemSurface(
    'cargo-rod-rack-forward-port', 'rod', ['fishingDiving'], [0, 0.55, 0],
    { width: 1.9, depth: 0.5 }, 0.82, [[0, 0, -1.15], [0, 0, 1.15]],
    { localRotation: [0, PI_OVER_TWO, 0] },
  )]),
  ...([
    ['cargo-crate-forward-starboard', 2.6, 2.8],
    ['cargo-crate-aft-port', -2.6, -5.8],
    ['cargo-crate-aft-starboard', 2.6, -5.8],
  ] as const).map(([id, x, z]) => placement(
    id, 'cargoCrate', 'cargoDeck', [x, 2.22, z], 0, [1.35, 1.05, 1.15],
    [itemSurface(id, 'top', ['fishingDiving'], [0, 1.05, 0], { width: 1.05, depth: 0.85 }, 0.95, [[0, 0, -1.15], [0, 0, 1.15]])],
  )),
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
    { id: 'start', position: [0, 7.2], kind: 'start' },
    { id: 'port-loop-forward', position: [-4.8, 10.2], kind: 'loop' },
    { id: 'port-loop-aft', position: [-4.8, -12.5], kind: 'loop' },
    { id: 'starboard-loop-forward', position: [4.8, 10.2], kind: 'loop' },
    { id: 'starboard-loop-aft', position: [4.8, -12.5], kind: 'loop' },
    { id: 'bow-port', position: [-4.1, 14.25], kind: 'endDeck' },
    { id: 'bow-center', position: [0, 16], kind: 'endDeck' },
    { id: 'bow-starboard', position: [4.1, 14.25], kind: 'endDeck' },
    { id: 'stern-port', position: [-4.1, -14.25], kind: 'endDeck' },
    { id: 'stern-center', position: [0, -16], kind: 'endDeck' },
    { id: 'stern-starboard', position: [4.1, -14.25], kind: 'endDeck' },
  ];
  result.push(...doorNavigationTargets(doorSpecs));
  result.push(...surfaceNavigationTargets(furnitureSpecs));
  result.push({ id: 'evacuation', position: [5.4, -6.5], kind: 'evacuation' });
  return result;
}

export const SHIP_LAYOUT: ShipLayoutSpec = {
  zones: [
    {
      id: 'crewCabin', bounds: crewBounds, polygon: rectPolygon(crewBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 4,
        allowedModelIds: ['bedBunk', 'desk', 'bookcaseOpen'],
        clearCenter: rect(-1.35, 1.35, 4.75, 8.35),
      },
    },
    {
      id: 'wheelhouse', bounds: wheelhouseBounds, polygon: rectPolygon(wheelhouseBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 4,
        allowedModelIds: ['desk', 'sideTableDrawers'],
        clearCenter: rect(-1.05, 1.05, 11, 12.25),
      },
    },
    {
      id: 'cargoDeck',
      bounds: cargoBounds,
      polygon: [
        [-6, -13.6], [-4.24, -16.43], [0, -17.6], [4.24, -16.43], [6, -13.6],
        [6, 13.6], [4.24, 16.43], [0, 17.6], [-4.24, 16.43], [-6, 13.6],
      ],
      excludedZoneIds: ['crewCabin', 'wheelhouse', 'storageWorkroom', 'lifeboatStation'],
      enclosed: false,
      furniturePolicy: {
        maxFixtures: 4,
        allowedModelIds: ['cargoCrate', 'cargoRack'],
        clearCenter: rect(-1, 1, -6.5, 3.5),
      },
    },
    {
      id: 'storageWorkroom', bounds: storageBounds, polygon: rectPolygon(storageBounds), enclosed: true,
      furniturePolicy: {
        maxFixtures: 4,
        allowedModelIds: ['table', 'bookcaseOpen'],
        clearCenter: rect(-1, 1, -9.5, -7.15),
      },
    },
    {
      id: 'lifeboatStation', bounds: lifeboatBounds, polygon: rectPolygon(lifeboatBounds), enclosed: false,
      furniturePolicy: {
        maxFixtures: 0,
        allowedModelIds: [],
        clearCenter: rect(5.05, 5.75, -6.85, -6.15),
      },
    },
  ],
  doors,
  lanes: [
    { id: 'port-exterior-main', className: 'primary', clearWidth: 2.05, bounds: rect(-5.875, -3.825, -13.2, 13.2) },
    { id: 'starboard-exterior-main', className: 'primary', clearWidth: 2.05, bounds: rect(3.825, 5.875, -13.2, 13.2) },
    { id: 'cargo-longitudinal', className: 'primary', clearWidth: 2, bounds: rect(-1, 1, -6.5, 3.5) },
    { id: 'cargo-cross-center', className: 'primary', clearWidth: 2, bounds: rect(-3.8, 3.8, -1, 1) },
    { id: 'bow-port-approach', className: 'secondary', clearWidth: 2, bounds: rect(-5, -3, 13.2, 15.2) },
    { id: 'bow-cross', className: 'primary', clearWidth: 2, bounds: rect(-3, 3, 14.2, 16.2) },
    { id: 'bow-starboard-approach', className: 'secondary', clearWidth: 2, bounds: rect(3, 5, 13.2, 15.2) },
    { id: 'stern-port-approach', className: 'primary', clearWidth: 2, bounds: rect(-5, -3, -15.2, -13.2) },
    { id: 'stern-cross', className: 'primary', clearWidth: 2, bounds: rect(-3, 3, -16.2, -14.2) },
    { id: 'stern-starboard-approach', className: 'primary', clearWidth: 2, bounds: rect(3, 5, -15.2, -13.2) },
  ],
  furniture,
  targets: navigationTargets(doors, furniture),
  rail: {
    height: 1.05,
    innerFaceX: 5.875,
    starboardOpening: { centerZ: -6.5, width: 3.2 },
  },
  machineryClosure: rect(-2, 2, -14.4, -11.4),
  evacuationRect: rect(5.05, 5.75, -6.85, -6.15),
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
  return Math.min(lane.bounds.maxX - lane.bounds.minX, lane.bounds.maxZ - lane.bounds.minZ);
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
  const opening = layout.rail.starboardOpening;
  const openingMinZ = opening.centerZ - opening.width / 2;
  const openingMaxZ = opening.centerZ + opening.width / 2;
  const innerX = layout.rail.innerFaceX;
  return [
    ...wallRectangles(layout),
    ...layout.furniture.map(furnitureRect),
    layout.machineryClosure,
    rect(-innerX - RAIL_THICKNESS, -innerX, GRID_MIN_Z, GRID_MAX_Z),
    rect(innerX, innerX + RAIL_THICKNESS, GRID_MIN_Z, openingMinZ),
    rect(innerX, innerX + RAIL_THICKNESS, openingMaxZ, GRID_MAX_Z),
    rect(-innerX, innerX, GRID_MIN_Z, GRID_MIN_Z + RAIL_THICKNESS),
    rect(-innerX, innerX, GRID_MAX_Z - RAIL_THICKNESS, GRID_MAX_Z),
  ].filter(validRect);
}

export function analyzeShipNavigation(layout: ShipLayoutSpec): ShipNavigationAnalysis {
  const columns = Math.round((GRID_MAX_X - GRID_MIN_X) / GRID_STEP) + 1;
  const rows = Math.round((GRID_MAX_Z - GRID_MIN_Z) / GRID_STEP) + 1;
  const obstacles = activeObstacles(layout).map((bounds) => inflate(bounds, PLAYER_LAYOUT_RADIUS));
  const cellPoint = (index: number): readonly [number, number] => {
    const xIndex = index % columns;
    const zIndex = Math.floor(index / columns);
    return [GRID_MIN_X + xIndex * GRID_STEP, GRID_MIN_Z + zIndex * GRID_STEP];
  };
  const blocked = new Uint8Array(columns * rows);
  const hull = layout.zones.find(({ id }) => id === 'cargoDeck');
  for (let index = 0; index < blocked.length; index += 1) {
    const point = cellPoint(index);
    if (!hull || !pointInPolygon(point, hull.polygon)
      || obstacles.some((bounds) => contains(bounds, point))) blocked[index] = 1;
  }
  const toCell = (point: readonly [number, number]): number | undefined => {
    const xIndex = Math.round((point[0] - GRID_MIN_X) / GRID_STEP);
    const zIndex = Math.round((point[1] - GRID_MIN_Z) / GRID_STEP);
    if (xIndex < 0 || xIndex >= columns || zIndex < 0 || zIndex >= rows) return undefined;
    return zIndex * columns + xIndex;
  };
  const targets = effectiveNavigationTargets(layout);
  const accessRectangles = secondaryAccessRectangles(layout.furniture);
  const start = targets.find(({ kind }) => kind === 'start');
  const startCell = start ? toCell(start.position) : undefined;
  const visited = new Uint8Array(columns * rows);
  if (startCell !== undefined && blocked[startCell] === 0) {
    const queue = new Int32Array(columns * rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = startCell;
    visited[startCell] = 1;
    const directions = [-1, 0, 1] as const;
    while (head < tail) {
      const current = queue[head++]!;
      const x = current % columns;
      const z = Math.floor(current / columns);
      for (const dz of directions) for (const dx of directions) {
        if (dx === 0 && dz === 0) continue;
        const nextX = x + dx;
        const nextZ = z + dz;
        if (nextX < 0 || nextX >= columns || nextZ < 0 || nextZ >= rows) continue;
        const next = nextZ * columns + nextX;
        if (blocked[next] || visited[next]) continue;
        if (dx !== 0 && dz !== 0) {
          const horizontal = z * columns + nextX;
          const vertical = nextZ * columns + x;
          if (blocked[horizontal] || blocked[vertical]) continue;
        }
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  const unreachableTargetIds = targets
    .filter((target) => {
      const cell = toCell(target.position);
      return cell === undefined || blocked[cell] === 1 || visited[cell] === 0;
    })
    .map(({ id }) => id);
  const reachableSurfaceStandingPointIds: string[] = [];
  layout.furniture.forEach((owner) => owner.surfaces.forEach((surface) => {
    const candidates = surface.standingPoints.map((point, index) => ({
      id: `${surface.id}-standing-${index}`,
      position: transformLocalPoint(owner, point),
    }));
    const reachable = candidates.filter((candidate) => {
      const cell = toCell(candidate.position);
      return cell !== undefined && blocked[cell] === 0 && visited[cell] === 1;
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
  layout.doors.forEach((door) => {
    if (!finiteTuple(door.center) || !validRect(door.approach)) {
      throw new Error(`Door ${door.id} must use finite rectangle coordinates`);
    }
    if (!Number.isFinite(door.width) || door.width < 1.8 || door.width > 2.2) {
      throw new Error(`Door ${door.id} width ${door.width} must be between 1.8 and 2.2`);
    }
  });
  layout.lanes.forEach((lane) => {
    if (!validRect(lane.bounds)) {
      throw new Error(`Lane ${lane.id} must use finite rectangle coordinates`);
    }
    if (!positive(lane.clearWidth)) {
      throw new Error(`Lane ${lane.id} must have positive dimensions`);
    }
    const required = lane.className === 'primary' ? 2 : 1.4;
    const measured = measuredLaneWidth(lane);
    if (lane.clearWidth < required || measured < required) {
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
  if (openingMinZ > -8.1 || openingMaxZ < -4.9 || !evacuation
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
