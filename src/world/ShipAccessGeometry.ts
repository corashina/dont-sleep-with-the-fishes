import {
  BufferGeometry,
  Group,
} from 'three';
import { PLAYER_BODY_HEIGHT } from '../player/collisions';
import type { LadderClimbZone, LadderEntryArea } from '../player/LadderTraversal';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_ROOM_ROOF_THICKNESS,
  SHIP_ROOM_WALL_HEIGHT,
  type ShipBalconySpec,
  type ShipLadderSpec,
  type ShipLayoutSpec,
  type ShipZoneId,
  type ShipZoneSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import {
  addBlock,
  type ShipGeometryBuildContext,
} from './ShipGeometryPrimitives';

const ROOM_WALL_HEIGHT = SHIP_ROOM_WALL_HEIGHT;

const LADDER_RAIL_WIDTH = 0.08;
const LADDER_RAIL_DEPTH = 0.1;
const LADDER_RUNG_HEIGHT = 0.065;
const LADDER_RUNG_DEPTH = 0.11;
const LADDER_CLIMB_CLEARANCE = PLAYER_LAYOUT_RADIUS + LADDER_RUNG_DEPTH / 2 + 0.03;
const LADDER_GRAB_RISE = 0.72;
const LADDER_ENTRY_DEPTH = 0.9;
const LADDER_DISMOUNT_DISTANCE = 0.75;

function requiredZone(layout: ShipLayoutSpec, id: ShipZoneId): ShipZoneSpec {
  const zone = layout.zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Ship geometry requires zone ${id}`);
  return zone;
}

function roomWallHeight(_zoneId: ShipZoneId): number {
  return ROOM_WALL_HEIGHT;
}

function balconyDeckTopY(zoneId: ShipZoneId): number {
  return FREIGHTER_DIMENSIONS.deckY
    + roomWallHeight(zoneId)
    + SHIP_ROOM_ROOF_THICKNESS;
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

export function addShipAccess(
  context: ShipGeometryBuildContext,
  layout: ShipLayoutSpec,
): readonly LadderClimbZone[] {
  return addLadders(
    context,
    context.root,
    context.geometries,
    context.materials,
    layout,
  );
}
