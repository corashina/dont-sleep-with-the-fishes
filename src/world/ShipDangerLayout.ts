import {
  SHIP_LAYOUT,
} from './shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_ROOM_WALL_HEIGHT,
} from './ShipLayoutTypes';

export type DangerRoomId = 'crewCabin' | 'wheelhouse' | 'storageWorkroom';
export type DangerZoneId = DangerRoomId | 'cargoDeck';
export type Vec3Tuple = readonly [number, number, number];

export interface DangerAnchor {
  readonly id: string;
  readonly zoneId: DangerZoneId;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
}

export interface FootprintAnchor extends DangerAnchor {
  readonly size: readonly [number, number];
}

export interface ShipDangerLayout {
  readonly alarms: readonly DangerAnchor[];
  readonly puddles: readonly FootprintAnchor[];
}

export const SHIP_PUDDLE_OUTLINE = Object.freeze([
  [0.49, 0.04], [0.78, 0.26], [0.94, 0.58], [0.69, 0.86],
  [0.23, 0.98], [-0.24, 0.87], [-0.7, 0.72], [-0.96, 0.31],
  [-0.82, -0.2], [-0.41, -0.61], [0.14, -0.73],
] as const);

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
  puddles: Object.freeze<FootprintAnchor[]>([
    { id: 'crew-aft', zoneId: 'crewCabin', position: [3.7, 2.228, 5.85], rotation: [-Math.PI / 2, 0, -0.08], size: [1.9, 1.15] },
    { id: 'crew-forward', zoneId: 'crewCabin', position: [-2.1, 2.228, 12.25], rotation: [-Math.PI / 2, 0, 0.14], size: [1.65, 1] },
    { id: 'crew-center', zoneId: 'crewCabin', position: [2.2, 2.228, 11.35], rotation: [-Math.PI / 2, 0, -0.2], size: [1.5, 0.9] },
    { id: 'wheelhouse-center', zoneId: 'wheelhouse', position: [0, 2.228, 20.2], rotation: [-Math.PI / 2, 0, 0.1], size: [1.9, 1.05] },
    { id: 'wheelhouse-starboard', zoneId: 'wheelhouse', position: [3.15, 2.228, 18.25], rotation: [-Math.PI / 2, 0, -0.18], size: [1.45, 0.9] },
    { id: 'storage-port', zoneId: 'storageWorkroom', position: [-3.6, 2.228, -15.85], rotation: [-Math.PI / 2, 0, 0.12], size: [1.95, 1.2] },
    { id: 'storage-center', zoneId: 'storageWorkroom', position: [0.15, 2.228, -14.1], rotation: [-Math.PI / 2, 0, -0.06], size: [1.65, 0.95] },
    { id: 'storage-starboard', zoneId: 'storageWorkroom', position: [3.65, 2.228, -11.8], rotation: [-Math.PI / 2, 0, -0.16], size: [1.85, 1.1] },
    { id: 'cargo-port', zoneId: 'cargoDeck', position: [-5.25, 2.228, -4.2], rotation: [-Math.PI / 2, 0, 0.2], size: [2.2, 1.2] },
    { id: 'cargo-starboard-wash', zoneId: 'cargoDeck', position: [5.5, 2.228, -7.2], rotation: [-Math.PI / 2, 0, -0.12], size: [2.15, 1.1] },
    { id: 'cargo-port-forward', zoneId: 'cargoDeck', position: [-5.3, 2.228, 15.5], rotation: [-Math.PI / 2, 0, 0.08], size: [2.25, 1.15] },
    { id: 'cargo-starboard-forward', zoneId: 'cargoDeck', position: [6.7, 2.228, 9.8], rotation: [-Math.PI / 2, 0, 0], size: [0.8, 1.25] },
    { id: 'cargo-port-midship', zoneId: 'cargoDeck', position: [-5.5, 2.228, 2.2], rotation: [-Math.PI / 2, 0, -0.09], size: [2.1, 1.05] },
    { id: 'cargo-starboard-midship', zoneId: 'cargoDeck', position: [5.5, 2.228, 2.5], rotation: [-Math.PI / 2, 0, 0.16], size: [2.2, 1.1] },
    { id: 'cargo-port-aft', zoneId: 'cargoDeck', position: [-6.65, 2.228, -18.2], rotation: [-Math.PI / 2, 0, 0], size: [0.75, 0.55] },
    { id: 'cargo-starboard-aft', zoneId: 'cargoDeck', position: [6.65, 2.228, -18.2], rotation: [-Math.PI / 2, 0, 0], size: [0.75, 0.55] },
  ]),
});
