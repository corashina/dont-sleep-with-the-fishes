import type { ShipFurnitureAssetId } from './shipFurnitureManifest';

export const PLAYER_LAYOUT_RADIUS = 0.35;
export const FREIGHTER_DIMENSIONS = { width: 16.25, length: 55, deckY: 2.22 } as const;
export const SHIP_ROOM_WALL_HEIGHT = 3.4;
export const SHIP_ROOM_WALL_THICKNESS = 0.22;
export const SHIP_ROOM_ROOF_THICKNESS = 0.24;
export const SHIP_TRANSVERSE_PORTHOLE_CENTER_X = 2.2;

export type ShipZoneId =
  | 'crewCabin' | 'wheelhouse' | 'cargoDeck'
  | 'storageWorkroom' | 'lifeboatStation';
export type ShipBalconyZoneId = 'crewCabin';
export type ShipTransverseEdge = 'aft' | 'forward';
export type ClearanceClass = 'primary' | 'secondary';
export type ShipFurnitureKind = ShipFurnitureAssetId
  | 'cargoRack'
  | 'cargoCrateStack';
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
  readonly regionId: ScavengeRegionId;
  readonly branch: boolean;
  readonly localPosition: readonly [number, number, number];
  readonly localRotation: readonly [number, number, number];
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly (readonly [number, number, number])[];
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
  readonly id: 'crew-balcony';
  readonly zoneId: ShipBalconyZoneId;
  readonly ladderId: 'crew-ladder';
  readonly edge: ShipTransverseEdge;
  readonly coamingHeight: number;
  readonly openingWidth: number;
}

export interface ShipLadderSpec {
  readonly id: 'crew-ladder';
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
  readonly stable?: true;
  distance(
    from: readonly [number, number],
    to: readonly [number, number],
  ): number | null;
}

export interface ShipSecondaryAccessRectangle {
  readonly id: string;
  readonly bounds: Rect2;
}
