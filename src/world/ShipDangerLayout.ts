import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_HEIGHT,
  type Rect2,
  type ShipLayoutSpec,
} from './ShipLayout';

export type DangerRoomId = 'crewCabin' | 'wheelhouse' | 'storageWorkroom';
export type DangerZoneId = DangerRoomId | 'cargoDeck' | 'outerHull';
export type Vec3Tuple = readonly [number, number, number];

export interface DangerAnchor {
  readonly id: string;
  readonly zoneId: DangerZoneId;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
}

export interface FireAnchor extends DangerAnchor {
  readonly scale: number;
  readonly unreachable: true;
}

export interface LeakAnchor extends DangerAnchor {
  readonly length: number;
  readonly width: number;
  readonly unreachable: boolean;
}

export interface FootprintAnchor extends DangerAnchor {
  readonly size: readonly [number, number];
}

export interface ShipDangerLayout {
  readonly alarms: readonly DangerAnchor[];
  readonly fires: readonly FireAnchor[];
  readonly smokeOutlets: readonly DangerAnchor[];
  readonly leaks: readonly LeakAnchor[];
  readonly puddles: readonly FootprintAnchor[];
  readonly streams: readonly FootprintAnchor[];
  readonly brokenPlanks: readonly FootprintAnchor[];
  readonly wetStreaks: readonly FootprintAnchor[];
}

const FLOOR_Y = FREIGHTER_DIMENSIONS.deckY;
const ROOM_CEILING_Y = FLOOR_Y + SHIP_ROOM_WALL_HEIGHT;

export const SHIP_DANGER_LAYOUT: ShipDangerLayout = Object.freeze({
  alarms: Object.freeze<DangerAnchor[]>([
    { id: 'crew-cabin', zoneId: 'crewCabin', position: [-5.54, 4.58, 10.3], rotation: [0, 0, -Math.PI / 2] },
    { id: 'wheelhouse', zoneId: 'wheelhouse', position: [3.7, 5.25, 17.18], rotation: [Math.PI / 2, 0, 0] },
    { id: 'storage-workroom', zoneId: 'storageWorkroom', position: [5.54, 4.58, -12.2], rotation: [0, 0, Math.PI / 2] },
  ]),
  fires: Object.freeze<FireAnchor[]>([
    { id: 'wheelhouse-roof', zoneId: 'wheelhouse', position: [2.4, 5.78, 20.5], rotation: [0, 0, 0], scale: 1.05, unreachable: true },
    { id: 'machinery-starboard', zoneId: 'cargoDeck', position: [2.85, 4.22, -20.9], rotation: [0, 0, 0], scale: 1.2, unreachable: true },
    { id: 'starboard-hull', zoneId: 'outerHull', position: [8.18, 2.8, -5.8], rotation: [0, 0, -Math.PI / 2], scale: 0.9, unreachable: true },
  ]),
  smokeOutlets: Object.freeze<DangerAnchor[]>([
    { id: 'wheelhouse-roof', zoneId: 'wheelhouse', position: [2.4, 6.1, 20.5], rotation: [0, 0, 0] },
    { id: 'storage-roof', zoneId: 'storageWorkroom', position: [-3.7, 5.85, -12.1], rotation: [0, 0, 0] },
    { id: 'machinery-starboard', zoneId: 'cargoDeck', position: [2.85, 4.65, -20.9], rotation: [0, 0, 0] },
    { id: 'starboard-hull', zoneId: 'outerHull', position: [8.28, 3.15, -5.8], rotation: [0, 0, 0] },
  ]),
  leaks: Object.freeze<LeakAnchor[]>([
    { id: 'crew-starboard', zoneId: 'crewCabin', position: [5.63, 3.5, 11.3], rotation: [0, 0, Math.PI / 2], length: 2.1, width: 0.07, unreachable: false },
    { id: 'storage-port-aft', zoneId: 'storageWorkroom', position: [-5.63, 3.35, -16.25], rotation: [0, 0, -Math.PI / 2], length: 2.25, width: 0.08, unreachable: false },
    { id: 'storage-starboard-forward', zoneId: 'storageWorkroom', position: [5.63, 3.65, -11.45], rotation: [0, 0, Math.PI / 2], length: 2.55, width: 0.08, unreachable: false },
    { id: 'hull-port-aft', zoneId: 'outerHull', position: [-8.16, 1.45, -14], rotation: [0, 0, -Math.PI / 2], length: 2.4, width: 0.1, unreachable: true },
    { id: 'hull-starboard-mid', zoneId: 'outerHull', position: [8.16, 1.65, 5.6], rotation: [0, 0, Math.PI / 2], length: 2.2, width: 0.1, unreachable: true },
    { id: 'hull-port-forward', zoneId: 'outerHull', position: [-8.05, 1.3, 18.2], rotation: [0, 0, -Math.PI / 2], length: 2.7, width: 0.1, unreachable: true },
  ]),
  puddles: Object.freeze<FootprintAnchor[]>([
    { id: 'crew-aft', zoneId: 'crewCabin', position: [3.9, 2.228, 5.35], rotation: [-Math.PI / 2, 0, 0], size: [1.4, 0.85] },
    { id: 'crew-forward', zoneId: 'crewCabin', position: [-2.1, 2.228, 12.25], rotation: [-Math.PI / 2, 0, 0], size: [1.1, 0.7] },
    { id: 'storage-port', zoneId: 'storageWorkroom', position: [-4.2, 2.228, -15.85], rotation: [-Math.PI / 2, 0, 0], size: [1.45, 0.9] },
    { id: 'storage-starboard', zoneId: 'storageWorkroom', position: [4.15, 2.228, -11.8], rotation: [-Math.PI / 2, 0, 0], size: [1.3, 0.75] },
    { id: 'cargo-port', zoneId: 'cargoDeck', position: [-5.25, 2.228, -4.2], rotation: [-Math.PI / 2, 0, 0], size: [1.6, 0.8] },
  ]),
  streams: Object.freeze<FootprintAnchor[]>([
    { id: 'crew-runoff', zoneId: 'crewCabin', position: [4.55, 2.231, 10.6], rotation: [-Math.PI / 2, 0, 0.18], size: [2.1, 0.18] },
    { id: 'storage-port-runoff', zoneId: 'storageWorkroom', position: [-4.65, 2.231, -15.5], rotation: [-Math.PI / 2, 0, -0.35], size: [1.8, 0.2] },
    { id: 'storage-starboard-runoff', zoneId: 'storageWorkroom', position: [4.55, 2.231, -12.15], rotation: [-Math.PI / 2, 0, 0.28], size: [1.9, 0.2] },
  ]),
  brokenPlanks: Object.freeze<FootprintAnchor[]>([
    { id: 'crew-floor', zoneId: 'crewCabin', position: [-0.2, 2.245, 6.2], rotation: [0, 0.08, 0.01], size: [1.8, 0.7] },
    { id: 'storage-floor', zoneId: 'storageWorkroom', position: [0.2, 2.245, -16.8], rotation: [0, -0.1, -0.015], size: [1.7, 0.75] },
    { id: 'cargo-deck', zoneId: 'cargoDeck', position: [-5.1, 2.245, 3.9], rotation: [0, 0.12, 0.01], size: [2, 0.8] },
  ]),
  wetStreaks: Object.freeze<FootprintAnchor[]>([
    { id: 'hull-port-aft', zoneId: 'outerHull', position: [-8.18, 1.2, -14], rotation: [0, Math.PI / 2, 0], size: [1.7, 0.42] },
    { id: 'hull-starboard-mid', zoneId: 'outerHull', position: [8.18, 1.3, 5.6], rotation: [0, -Math.PI / 2, 0], size: [1.5, 0.38] },
    { id: 'hull-port-forward', zoneId: 'outerHull', position: [-8.08, 1.05, 18.2], rotation: [0, Math.PI / 2, 0], size: [1.9, 0.45] },
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
  danger.fires.forEach((fire) => {
    if (!fire.unreachable) throw new Error(`${fire.id} fire must remain unreachable`);
  });

  const groups: ReadonlyArray<readonly DangerAnchor[]> = [
    danger.alarms, danger.fires, danger.smokeOutlets, danger.leaks,
    danger.puddles, danger.streams, danger.brokenPlanks, danger.wetStreaks,
  ];
  for (const group of groups) {
    const ids = new Set<string>();
    for (const anchor of group) {
      if (ids.has(anchor.id)) throw new Error(`Duplicate ship danger id ${anchor.id}`);
      ids.add(anchor.id);
      if (![...anchor.position, ...anchor.rotation].every(Number.isFinite)) {
        throw new Error(`${anchor.id} has a non-finite transform`);
      }
      if (anchor.zoneId === 'outerHull') continue;
      const zone = ship.zones.find(({ id }) => id === anchor.zoneId);
      if (!zone || !pointInPolygon(anchor.position[0], anchor.position[2], zone.polygon)) {
        throw new Error(`${anchor.id} is outside ${anchor.zoneId}`);
      }
      const blocksDoor = ship.doors.some((door) => door.zoneId === anchor.zoneId
        && containsRect(door.approach, anchor.position[0], anchor.position[2]));
      if (blocksDoor) throw new Error(`${anchor.id} overlaps a door approach`);
    }
  }

  danger.fires.forEach(({ id, scale }) => assertPositive(id, scale));
  danger.leaks.forEach(({ id, length, width, zoneId, unreachable }) => {
    assertPositive(id, length);
    assertPositive(id, width);
    if (zoneId === 'outerHull' && !unreachable) {
      throw new Error(`${id} outer-hull leak must remain unreachable`);
    }
  });
  [danger.puddles, danger.streams, danger.brokenPlanks, danger.wetStreaks]
    .flat()
    .forEach(({ id, size }) => {
      assertPositive(id, size[0]);
      assertPositive(id, size[1]);
    });
}
