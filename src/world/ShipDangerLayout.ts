import {
  SHIP_LAYOUT,
} from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_ROOM_WALL_HEIGHT,
} from './ShipLayoutTypes';

export type DangerRoomId = 'crewCabin' | 'wheelhouse' | 'storageWorkroom';
export type Vec3Tuple = readonly [number, number, number];

export interface DangerAnchor {
  readonly id: string;
  readonly zoneId: DangerRoomId;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
}

export interface ShipDangerLayout {
  readonly alarms: readonly DangerAnchor[];
}

const FLOOR_Y = FREIGHTER_DIMENSIONS.deckY;
const ROOM_CEILING_Y = FLOOR_Y + SHIP_ROOM_WALL_HEIGHT;

function centeredCeilingAlarm(
  id: string,
  zoneId: DangerRoomId,
): DangerAnchor {
  const zone = SHIP_LAYOUT.zones.find(({ id: current }) => current === zoneId);
  if (zone === undefined) throw new Error(`Missing alarm room ${zoneId}`);
  return {
    id,
    zoneId,
    position: [
      (zone.bounds.minX + zone.bounds.maxX) / 2,
      ROOM_CEILING_Y - 0.08,
      (zone.bounds.minZ + zone.bounds.maxZ) / 2,
    ],
    rotation: [Math.PI / 2, 0, 0],
  };
}

export const SHIP_DANGER_LAYOUT: ShipDangerLayout = Object.freeze({
  alarms: Object.freeze<DangerAnchor[]>([
    centeredCeilingAlarm('crew-cabin', 'crewCabin'),
    centeredCeilingAlarm('wheelhouse', 'wheelhouse'),
    centeredCeilingAlarm('storage-workroom', 'storageWorkroom'),
  ]),
});
