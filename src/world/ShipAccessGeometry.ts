import {
  BufferGeometry,
  CubicBezierCurve3,
  Group,
  Vector3,
} from 'three';
import { PLAYER_BODY_HEIGHT } from '../player/collisions';
import type { LadderClimbZone, LadderEntryArea } from '../player/LadderTraversal';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  requiredShipZone,
  shipRoomRoofTopY,
  type ShipBalconySpec,
  type ShipLadderSpec,
  type ShipLayoutSpec,
} from './ShipLayoutTypes';
import type { ShipMaterials } from './ShipMaterials';
import type { ShipGeometryBuildContext } from './ShipGeometryPrimitives';
import { ShipDetailGeometry } from './ShipDetailGeometry';

const LADDER_RAIL_WIDTH = 0.08;
const LADDER_RUNG_DEPTH = 0.11;
const LADDER_CLIMB_CLEARANCE = PLAYER_LAYOUT_RADIUS + LADDER_RUNG_DEPTH / 2 + 0.03;
const LADDER_GRAB_RISE = 0.72;
const LADDER_ENTRY_DEPTH = 0.9;
const LADDER_DISMOUNT_DISTANCE = 0.75;

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
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: ShipMaterials,
  layout: ShipLayoutSpec,
): readonly LadderClimbZone[] {
  const climbZones = layout.ladders.map((ladderSpec) => {
    const zone = requiredShipZone(layout, ladderSpec.zoneId);
    const balcony = layout.balconies.find(({ ladderId }) => ladderId === ladderSpec.id);
    if (!balcony) throw new Error(`Ship geometry requires balcony for ${ladderSpec.id}`);
    const outwardZ = ladderSpec.edge === 'aft' ? -1 : 1;
    const wallZ = ladderSpec.edge === 'aft' ? zone.bounds.minZ : zone.bounds.maxZ;
    const ladderZ = wallZ + outwardZ * ladderSpec.wallOffset;
    const bottomFloorY = FREIGHTER_DIMENSIONS.deckY;
    const topFloorY = shipRoomRoofTopY(zone.id);
    const ladderHeight = topFloorY - bottomFloorY;
    const ladder = new Group();
    ladder.name = `ladder:${ladderSpec.id}`;
    ladder.position.set(ladderSpec.centerX, 0, ladderZ);
    root.add(ladder);

    const details = new ShipDetailGeometry(geometries);
    ([-1, 1] as const).forEach((side) => {
      const x = side * ladderSpec.width / 2;
      const gripY = topFloorY + LADDER_GRAB_RISE - 0.18;
      const returnZ = -outwardZ * (ladderSpec.wallOffset + 0.18);
      details.rod(materials.paintedSteel, [x, bottomFloorY, 0], [x, gripY, 0], LADDER_RAIL_WIDTH / 2);
      details.tube(materials.paintedSteel, new CubicBezierCurve3(
        new Vector3(x, gripY, 0), new Vector3(x, gripY + 0.24, 0),
        new Vector3(x, gripY + 0.24, returnZ), new Vector3(x, gripY, returnZ)), 10, LADDER_RAIL_WIDTH / 2);
      details.rod(materials.paintedSteel, [x, gripY, returnZ], [x, topFloorY, returnZ], LADDER_RAIL_WIDTH / 2);
      details.box(materials.paintedSteel, [0.14, 0.025, 0.14], [x, topFloorY + 0.0125, returnZ], 0, 0);
      for (let bracketIndex = 0; bracketIndex < 3; bracketIndex += 1) {
        const y = bottomFloorY + ladderHeight * ((bracketIndex + 1) / 4);
        const wallOffsetZ = -outwardZ * ladderSpec.wallOffset;
        details.rod(materials.paintedSteel, [x, y, 0], [x, y, wallOffsetZ], 0.025);
        details.box(materials.paintedSteel, [0.13, 0.16, 0.025], [x, y, wallOffsetZ], 0, 0);
      }
    });

    const rungCount = Math.floor(ladderHeight / ladderSpec.rungSpacing);
    for (let index = 0; index <= rungCount; index += 1) {
      const y = bottomFloorY + Math.min(index * ladderSpec.rungSpacing, ladderHeight);
      details.rod(materials.exposedMetal, [-ladderSpec.width / 2, y, 0],
        [ladderSpec.width / 2, y, 0], 0.033);
    }
    details.finish(ladder, 'ladder-fittings');

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
    context.root,
    context.geometries,
    context.materials,
    layout,
  );
}
