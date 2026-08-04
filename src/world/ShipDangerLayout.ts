import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_HEIGHT,
  type Rect2,
  type ShipLayoutSpec,
} from './ShipLayout';

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
    { id: 'storage-port', zoneId: 'storageWorkroom', position: [-3.75, 2.228, -15.85], rotation: [-Math.PI / 2, 0, 0.12], size: [1.95, 1.2] },
    { id: 'storage-center', zoneId: 'storageWorkroom', position: [0.15, 2.228, -14.1], rotation: [-Math.PI / 2, 0, -0.06], size: [1.65, 0.95] },
    { id: 'storage-starboard', zoneId: 'storageWorkroom', position: [3.85, 2.228, -11.8], rotation: [-Math.PI / 2, 0, -0.16], size: [1.85, 1.1] },
    { id: 'cargo-port', zoneId: 'cargoDeck', position: [-5.25, 2.228, -4.2], rotation: [-Math.PI / 2, 0, 0.2], size: [2.2, 1.2] },
    { id: 'cargo-starboard-wash', zoneId: 'cargoDeck', position: [5.5, 2.228, -7.2], rotation: [-Math.PI / 2, 0, -0.12], size: [2.15, 1.1] },
    { id: 'cargo-port-forward', zoneId: 'cargoDeck', position: [-5.3, 2.228, 15.5], rotation: [-Math.PI / 2, 0, 0.08], size: [2.25, 1.15] },
    { id: 'cargo-starboard-forward', zoneId: 'cargoDeck', position: [5.2, 2.228, 9.8], rotation: [-Math.PI / 2, 0, -0.15], size: [2.35, 1.25] },
    { id: 'cargo-port-midship', zoneId: 'cargoDeck', position: [-5.5, 2.228, 2.2], rotation: [-Math.PI / 2, 0, -0.09], size: [2.1, 1.05] },
    { id: 'cargo-starboard-midship', zoneId: 'cargoDeck', position: [5.5, 2.228, 3.7], rotation: [-Math.PI / 2, 0, 0.16], size: [2.2, 1.1] },
    { id: 'cargo-port-aft', zoneId: 'cargoDeck', position: [-5.3, 2.228, -20.4], rotation: [-Math.PI / 2, 0, -0.18], size: [2.3, 1.2] },
    { id: 'cargo-starboard-aft', zoneId: 'cargoDeck', position: [4.3, 2.228, -22.6], rotation: [-Math.PI / 2, 0, 0.11], size: [2.4, 1.3] },
  ]),
});

function containsRect(bounds: Rect2, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX
    && z >= bounds.minZ && z <= bounds.maxZ;
}

function assertPositive(id: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${id} requires positive finite sizes`);
  }
}

function pointInPolygon(
  x: number,
  z: number,
  polygon: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x1, z1] = polygon[index]!;
    const [x2, z2] = polygon[previous]!;
    const cross = (x - x1) * (z2 - z1) - (z - z1) * (x2 - x1);
    const onEdge = Math.abs(cross) <= 1e-8
      && x >= Math.min(x1, x2) && x <= Math.max(x1, x2)
      && z >= Math.min(z1, z2) && z <= Math.max(z1, z2);
    if (onEdge) return true;
    const crosses = (z1 > z) !== (z2 > z)
      && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function validateShipDangerLayout(
  danger: ShipDangerLayout,
  ship: ShipLayoutSpec = SHIP_LAYOUT,
): void {
  if (!Number.isFinite(FREIGHTER_DIMENSIONS.width) || !Number.isFinite(ROOM_CEILING_Y)) {
    throw new Error('Ship danger layout requires finite ship dimensions');
  }
  const enclosed = ship.zones.filter(({ enclosed: isEnclosed }) => isEnclosed).map(({ id }) => id).sort();
  const alarmRooms = danger.alarms.map(({ zoneId }) => zoneId).sort();
  if (alarmRooms.join('|') !== enclosed.join('|')) {
    throw new Error('Ship danger layout requires one alarm in every enclosed room');
  }
  danger.alarms.forEach((alarm) => {
    const room = ship.zones.find(({ id }) => id === alarm.zoneId);
    if (room === undefined) return;
    const centerX = (room.bounds.minX + room.bounds.maxX) / 2;
    const centerZ = (room.bounds.minZ + room.bounds.maxZ) / 2;
    if (Math.abs(alarm.position[0] - centerX) > 1e-6
      || Math.abs(alarm.position[1] - (ROOM_CEILING_Y - 0.08)) > 1e-6
      || Math.abs(alarm.position[2] - centerZ) > 1e-6) {
      throw new Error(`${alarm.id} alarm must stay centered on its room ceiling`);
    }
  });
  const groups: ReadonlyArray<readonly DangerAnchor[]> = [
    danger.alarms, danger.puddles,
  ];
  for (const group of groups) {
    const ids = new Set<string>();
    for (const anchor of group) {
      if (ids.has(anchor.id)) throw new Error(`Duplicate ship danger id ${anchor.id}`);
      ids.add(anchor.id);
      if (![...anchor.position, ...anchor.rotation].every(Number.isFinite)) {
        throw new Error(`${anchor.id} has a non-finite transform`);
      }
      const zone = ship.zones.find(({ id }) => id === anchor.zoneId);
      if (!zone || !pointInPolygon(anchor.position[0], anchor.position[2], zone.polygon)) {
        throw new Error(`${anchor.id} is outside ${anchor.zoneId}`);
      }
      const blocksDoor = ship.doors.some((door) => door.zoneId === anchor.zoneId
        && containsRect(door.approach, anchor.position[0], anchor.position[2]));
      if (blocksDoor) throw new Error(`${anchor.id} overlaps a door approach`);
    }
  }

  danger.puddles.forEach((puddle) => {
    const { id, size } = puddle;
    assertPositive(id, size[0]);
    assertPositive(id, size[1]);
    const zone = ship.zones.find(({ id: zoneId }) => zoneId === puddle.zoneId);
    if (zone === undefined) throw new Error(`Missing ${puddle.zoneId} zone`);
    const cosine = Math.cos(puddle.rotation[2]);
    const sine = Math.sin(puddle.rotation[2]);
    const crossesBoundary = SHIP_PUDDLE_OUTLINE.some(([outlineX, outlineZ]) => {
      const scaledX = outlineX * size[0];
      const scaledZ = outlineZ * size[1];
      const worldX = puddle.position[0] + scaledX * cosine - scaledZ * sine;
      const worldZ = puddle.position[2] - scaledX * sine - scaledZ * cosine;
      return !pointInPolygon(worldX, worldZ, zone.polygon);
    });
    if (!crossesBoundary) return;
    if (puddle.zoneId === 'cargoDeck') {
      throw new Error(`${id} puddle crosses the cargo rail`);
    }
    throw new Error(`${id} puddle crosses the ${puddle.zoneId} walls`);
  });
}
