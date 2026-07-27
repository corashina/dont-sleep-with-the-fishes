import type { LocalPlayerPosition } from './collisions';

const CLIMB_SPEED = 2.4;
const ENTRY_EPSILON = 0.08;
const MOVEMENT_INTENT_EPSILON = 1e-8;

export interface LadderEntryArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface LadderClimbZone {
  readonly id: string;
  readonly climbX: number;
  readonly climbZ: number;
  readonly outwardX: number;
  readonly outwardZ: number;
  readonly bottomEyeY: number;
  readonly topEyeY: number;
  readonly bottomEntry: LadderEntryArea;
  readonly topEntry: LadderEntryArea;
  readonly bottomDismount: readonly [number, number];
  readonly topDismount: readonly [number, number];
}

export interface LadderTraversalInput {
  readonly position: LocalPlayerPosition;
  readonly activeLadderId: string | null;
  readonly planarMovement: readonly [number, number];
  readonly verticalInput: number;
  readonly deltaSeconds: number;
  readonly floorEyeY: number;
}

export interface LadderTraversalResult {
  readonly position: LocalPlayerPosition;
  readonly activeLadderId: string | null;
  readonly floorEyeY: number;
  readonly consumed: boolean;
}

function contains(entry: LadderEntryArea, position: LocalPlayerPosition): boolean {
  return position.x >= entry.minX
    && position.x <= entry.maxX
    && position.z >= entry.minZ
    && position.z <= entry.maxZ;
}

function movingToward(
  movement: readonly [number, number],
  directionX: number,
  directionZ: number,
): boolean {
  return movement[0] * directionX + movement[1] * directionZ > MOVEMENT_INTENT_EPSILON;
}

function atHeight(position: LocalPlayerPosition, eyeY: number): boolean {
  return Math.abs(position.y - eyeY) <= ENTRY_EPSILON;
}

function unchanged(input: LadderTraversalInput): LadderTraversalResult {
  return {
    position: { ...input.position },
    activeLadderId: null,
    floorEyeY: input.floorEyeY,
    consumed: false,
  };
}

function captured(zone: LadderClimbZone, input: LadderTraversalInput): LadderTraversalResult {
  return {
    position: { x: zone.climbX, y: input.position.y, z: zone.climbZ },
    activeLadderId: zone.id,
    floorEyeY: input.floorEyeY,
    consumed: true,
  };
}

function findCapture(
  input: LadderTraversalInput,
  zones: readonly LadderClimbZone[],
): LadderClimbZone | undefined {
  return zones.find((zone) => (
    contains(zone.bottomEntry, input.position)
      && atHeight(input.position, zone.bottomEyeY)
      && movingToward(input.planarMovement, -zone.outwardX, -zone.outwardZ)
  ) || (
    contains(zone.topEntry, input.position)
      && atHeight(input.position, zone.topEyeY)
      && movingToward(input.planarMovement, zone.outwardX, zone.outwardZ)
  ));
}

export function resolveLadderTraversal(
  input: LadderTraversalInput,
  zones: readonly LadderClimbZone[],
): LadderTraversalResult {
  if (input.activeLadderId === null) {
    const zone = findCapture(input, zones);
    return zone ? captured(zone, input) : unchanged(input);
  }

  const zone = zones.find(({ id }) => id === input.activeLadderId);
  if (!zone) return unchanged(input);

  const nextY = input.position.y + input.verticalInput * CLIMB_SPEED * input.deltaSeconds;
  if (nextY >= zone.topEyeY) {
    return {
      position: { x: zone.topDismount[0], y: zone.topEyeY, z: zone.topDismount[1] },
      activeLadderId: null,
      floorEyeY: zone.topEyeY,
      consumed: true,
    };
  }
  if (nextY <= zone.bottomEyeY) {
    return {
      position: { x: zone.bottomDismount[0], y: zone.bottomEyeY, z: zone.bottomDismount[1] },
      activeLadderId: null,
      floorEyeY: zone.bottomEyeY,
      consumed: true,
    };
  }

  return {
    position: { x: zone.climbX, y: nextY, z: zone.climbZ },
    activeLadderId: zone.id,
    floorEyeY: input.floorEyeY,
    consumed: true,
  };
}
