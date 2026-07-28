export interface CollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  orientedFootprint?: {
    readonly centerX: number;
    readonly centerZ: number;
    readonly halfWidth: number;
    readonly halfDepth: number;
    readonly rotationY: number;
  };
}

export interface CollisionArc {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  end: 'bow' | 'stern';
  thickness: number;
  minY: number;
  maxY: number;
}

export interface LocalPlayerPosition {
  x: number;
  y: number;
  z: number;
}

export interface MovementAxes {
  x: number;
  z: number;
}

export interface SegmentBoxInterval {
  readonly minimum: number;
  readonly maximum: number;
}

export const PLAYER_BODY_HEIGHT = 1.5;
export const MAX_JUMPABLE_SUPPORT_HEIGHT = 0.6;
const SUPPORT_EPSILON = 1e-6;

export function segmentBoxInterval(
  start: LocalPlayerPosition,
  end: LocalPlayerPosition,
  box: CollisionBox,
): SegmentBoxInterval | undefined {
  const footprint = box.orientedFootprint;
  const cosine = footprint ? Math.cos(footprint.rotationY) : 1;
  const sine = footprint ? Math.sin(footprint.rotationY) : 0;
  const startOffsetX = footprint ? start.x - footprint.centerX : start.x;
  const startOffsetZ = footprint ? start.z - footprint.centerZ : start.z;
  const endOffsetX = footprint ? end.x - footprint.centerX : end.x;
  const endOffsetZ = footprint ? end.z - footprint.centerZ : end.z;
  const localStartX = footprint
    ? cosine * startOffsetX - sine * startOffsetZ
    : start.x;
  const localStartZ = footprint
    ? sine * startOffsetX + cosine * startOffsetZ
    : start.z;
  const localEndX = footprint
    ? cosine * endOffsetX - sine * endOffsetZ
    : end.x;
  const localEndZ = footprint
    ? sine * endOffsetX + cosine * endOffsetZ
    : end.z;
  let minimum = 0;
  let maximum = 1;
  for (const [startValue, delta, min, max] of [
    [
      localStartX,
      localEndX - localStartX,
      footprint ? -footprint.halfWidth : box.minX,
      footprint ? footprint.halfWidth : box.maxX,
    ],
    [start.y, end.y - start.y, box.minY, box.maxY],
    [
      localStartZ,
      localEndZ - localStartZ,
      footprint ? -footprint.halfDepth : box.minZ,
      footprint ? footprint.halfDepth : box.maxZ,
    ],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (startValue < min || startValue > max) return undefined;
      continue;
    }
    const first = (min - startValue) / delta;
    const second = (max - startValue) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return undefined;
  }
  return maximum > 1e-6 && minimum < 1 - 1e-6
    ? { minimum, maximum }
    : undefined;
}

export function circleOverlapsCollisionFootprint(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  box: CollisionBox,
): boolean {
  const footprint = box.orientedFootprint;
  if (footprint) {
    const cosine = Math.cos(footprint.rotationY);
    const sine = Math.sin(footprint.rotationY);
    const offsetX = position.x - footprint.centerX;
    const offsetZ = position.z - footprint.centerZ;
    const localX = cosine * offsetX - sine * offsetZ;
    const localZ = sine * offsetX + cosine * offsetZ;
    const closestX = Math.max(-footprint.halfWidth, Math.min(localX, footprint.halfWidth));
    const closestZ = Math.max(-footprint.halfDepth, Math.min(localZ, footprint.halfDepth));
    return (localX - closestX) ** 2 + (localZ - closestZ) ** 2 < radius ** 2;
  }
  const closestX = Math.max(box.minX, Math.min(position.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
  return (position.x - closestX) ** 2 + (position.z - closestZ) ** 2 < radius ** 2;
}

export function pointInsideCollisionBox(
  position: LocalPlayerPosition,
  box: CollisionBox,
): boolean {
  if (position.y < box.minY || position.y > box.maxY) return false;
  const footprint = box.orientedFootprint;
  if (!footprint) {
    return position.x >= box.minX && position.x <= box.maxX
      && position.z >= box.minZ && position.z <= box.maxZ;
  }
  const cosine = Math.cos(footprint.rotationY);
  const sine = Math.sin(footprint.rotationY);
  const offsetX = position.x - footprint.centerX;
  const offsetZ = position.z - footprint.centerZ;
  const localX = cosine * offsetX - sine * offsetZ;
  const localZ = sine * offsetX + cosine * offsetZ;
  return Math.abs(localX) <= footprint.halfWidth
    && Math.abs(localZ) <= footprint.halfDepth;
}

function bodyOverlapsBox(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  eyeHeight: number,
  radius: number,
  box: CollisionBox,
): boolean {
  const feetY = eyeHeight - PLAYER_BODY_HEIGHT;
  return feetY < box.maxY
    && eyeHeight > box.minY
    && circleOverlapsCollisionFootprint(position, radius, box);
}

export function findSupportEyeHeight(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  deckEyeHeight: number,
  boxes: readonly CollisionBox[],
): number {
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const candidates = boxes
    .filter((box) => circleOverlapsCollisionFootprint(position, radius, box))
    .filter((box) => {
      const supportHeight = box.maxY - deckFeetY;
      return supportHeight > SUPPORT_EPSILON
        && supportHeight <= MAX_JUMPABLE_SUPPORT_HEIGHT + SUPPORT_EPSILON;
    })
    .sort((left, right) => right.maxY - left.maxY);

  for (const candidate of candidates) {
    const eyeHeight = candidate.maxY + PLAYER_BODY_HEIGHT;
    const obstructed = boxes.some((box) => (
      box !== candidate && bodyOverlapsBox(position, eyeHeight, radius, box)
    ));
    if (!obstructed) return eyeHeight;
  }
  return deckEyeHeight;
}

export function movementAxes(pressed: ReadonlySet<string>): MovementAxes {
  const x = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
  const z = Number(pressed.has('KeyS')) - Number(pressed.has('KeyW'));
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

function closestHalfEllipsePointParameter(
  pointX: number,
  pointZ: number,
  radiusX: number,
  radiusZ: number,
): number {
  const quadrantX = Math.abs(pointX);
  let parameter = Math.atan2(
    Math.max(0, pointZ) * radiusX,
    quadrantX * radiusZ,
  );
  parameter = Math.max(0, Math.min(Math.PI / 2, parameter));

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const cosine = Math.cos(parameter);
    const sine = Math.sin(parameter);
    const ellipseX = radiusX * cosine;
    const ellipseZ = radiusZ * sine;
    const tangentX = -radiusX * sine;
    const tangentZ = radiusZ * cosine;
    const differenceX = ellipseX - quadrantX;
    const differenceZ = ellipseZ - pointZ;
    const derivative = differenceX * tangentX + differenceZ * tangentZ;
    const secondDerivative = tangentX * tangentX
      - differenceX * ellipseX
      + tangentZ * tangentZ
      - differenceZ * ellipseZ;
    if (Math.abs(secondDerivative) <= Number.EPSILON) break;
    parameter = Math.max(
      0,
      Math.min(Math.PI / 2, parameter - derivative / secondDerivative),
    );
  }

  const cosine = Math.cos(parameter);
  const sine = Math.sin(parameter);
  const differenceX = radiusX * cosine - quadrantX;
  const differenceZ = radiusZ * sine - pointZ;
  let closestDistanceSquared = differenceX * differenceX + differenceZ * differenceZ;

  const shoulderDistanceSquared = (radiusX - quadrantX) ** 2 + pointZ ** 2;
  if (shoulderDistanceSquared < closestDistanceSquared) {
    parameter = 0;
    closestDistanceSquared = shoulderDistanceSquared;
  }

  const centerDistanceSquared = quadrantX ** 2 + (radiusZ - pointZ) ** 2;
  if (centerDistanceSquared < closestDistanceSquared) parameter = Math.PI / 2;
  return pointX < 0 ? Math.PI - parameter : parameter;
}

function resolveArcMovementInPlace(
  result: LocalPlayerPosition,
  radius: number,
  arc: CollisionArc,
): void {
  const playerFeetY = result.y - PLAYER_BODY_HEIGHT;
  if (playerFeetY >= arc.maxY || result.y <= arc.minY) return;

  const outwardDirection = arc.end === 'bow' ? 1 : -1;
  const localX = result.x - arc.centerX;
  const localZ = outwardDirection * (result.z - arc.centerZ);
  if (localZ <= 0) return;

  const parameter = closestHalfEllipsePointParameter(
    localX,
    localZ,
    arc.radiusX,
    arc.radiusZ,
  );
  const ellipseX = arc.radiusX * Math.cos(parameter);
  const ellipseZ = arc.radiusZ * Math.sin(parameter);
  let normalX = Math.cos(parameter) / arc.radiusX;
  let normalZ = Math.sin(parameter) / arc.radiusZ;
  const normalLength = Math.hypot(normalX, normalZ);
  normalX /= normalLength;
  normalZ /= normalLength;
  const signedDistance = (localX - ellipseX) * normalX + (localZ - ellipseZ) * normalZ;
  const clearance = radius + arc.thickness / 2;
  if (signedDistance < -clearance) return;

  result.x = arc.centerX + ellipseX - normalX * clearance;
  result.z = arc.centerZ + outwardDirection * (ellipseZ - normalZ * clearance);
}

export function resolveArcMovement(
  _current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  arc: CollisionArc,
): LocalPlayerPosition {
  const result = { ...desired };
  resolveArcMovementInPlace(result, radius, arc);
  return result;
}

function resolveBoxAxisInPlace(
  current: LocalPlayerPosition,
  result: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
  axis: 'x' | 'z',
): void {
  const perpendicularAxis = axis === 'x' ? 'z' : 'x';
  for (const box of boxes) {
    if (box.orientedFootprint) continue;
    const playerFeetY = result.y - PLAYER_BODY_HEIGHT;
    const verticallyOverlaps = playerFeetY < box.maxY && result.y > box.minY;
    if (!verticallyOverlaps) continue;
    const perpendicular = result[perpendicularAxis];
    const perpendicularMin = perpendicularAxis === 'x' ? box.minX : box.minZ;
    const perpendicularMax = perpendicularAxis === 'x' ? box.maxX : box.maxZ;
    const perpendicularDistance = perpendicular < perpendicularMin
      ? perpendicularMin - perpendicular
      : Math.max(0, perpendicular - perpendicularMax);
    if (perpendicularDistance >= radius) continue;

    const axisMin = axis === 'x' ? box.minX : box.minZ;
    const axisMax = axis === 'x' ? box.maxX : box.maxZ;
    const radiusAtAxis = Math.sqrt(radius * radius - perpendicularDistance * perpendicularDistance);
    const lowerBoundary = axisMin - radiusAtAxis;
    const upperBoundary = axisMax + radiusAtAxis;
    const start = current[axis];
    const target = result[axis];

    if (start <= axisMin && target >= start && target > lowerBoundary) {
      result[axis] = lowerBoundary;
    } else if (start >= axisMax && target <= start && target < upperBoundary) {
      result[axis] = upperBoundary;
    }
  }
}

function resolveOrientedBoxMovementInPlace(
  current: LocalPlayerPosition,
  result: LocalPlayerPosition,
  radius: number,
  box: CollisionBox,
): void {
  const footprint = box.orientedFootprint;
  if (!footprint) return;
  const playerFeetY = result.y - PLAYER_BODY_HEIGHT;
  if (playerFeetY >= box.maxY || result.y <= box.minY) return;

  const cosine = Math.cos(footprint.rotationY);
  const sine = Math.sin(footprint.rotationY);
  const currentOffsetX = current.x - footprint.centerX;
  const currentOffsetZ = current.z - footprint.centerZ;
  const resultOffsetX = result.x - footprint.centerX;
  const resultOffsetZ = result.z - footprint.centerZ;
  const currentLocalX = cosine * currentOffsetX - sine * currentOffsetZ;
  const currentLocalZ = sine * currentOffsetX + cosine * currentOffsetZ;
  let resultLocalX = cosine * resultOffsetX - sine * resultOffsetZ;
  const desiredLocalZ = sine * resultOffsetX + cosine * resultOffsetZ;

  const zDistance = currentLocalZ < -footprint.halfDepth
    ? -footprint.halfDepth - currentLocalZ
    : Math.max(0, currentLocalZ - footprint.halfDepth);
  if (zDistance < radius) {
    const radiusAtX = Math.sqrt(radius * radius - zDistance * zDistance);
    const lowerBoundary = -footprint.halfWidth - radiusAtX;
    const upperBoundary = footprint.halfWidth + radiusAtX;
    if (currentLocalX <= -footprint.halfWidth
      && resultLocalX >= currentLocalX
      && resultLocalX > lowerBoundary) {
      resultLocalX = lowerBoundary;
    } else if (currentLocalX >= footprint.halfWidth
      && resultLocalX <= currentLocalX
      && resultLocalX < upperBoundary) {
      resultLocalX = upperBoundary;
    }
  }

  let resultLocalZ = desiredLocalZ;
  const xDistance = resultLocalX < -footprint.halfWidth
    ? -footprint.halfWidth - resultLocalX
    : Math.max(0, resultLocalX - footprint.halfWidth);
  if (xDistance < radius) {
    const radiusAtZ = Math.sqrt(radius * radius - xDistance * xDistance);
    const lowerBoundary = -footprint.halfDepth - radiusAtZ;
    const upperBoundary = footprint.halfDepth + radiusAtZ;
    if (currentLocalZ <= -footprint.halfDepth
      && resultLocalZ >= currentLocalZ
      && resultLocalZ > lowerBoundary) {
      resultLocalZ = lowerBoundary;
    } else if (currentLocalZ >= footprint.halfDepth
      && resultLocalZ <= currentLocalZ
      && resultLocalZ < upperBoundary) {
      resultLocalZ = upperBoundary;
    }
  }

  result.x = footprint.centerX + cosine * resultLocalX + sine * resultLocalZ;
  result.z = footprint.centerZ - sine * resultLocalX + cosine * resultLocalZ;
}

function resolveBoxMovementInPlace(
  current: LocalPlayerPosition,
  result: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
): void {
  const desiredZ = result.z;
  result.z = current.z;
  resolveBoxAxisInPlace(current, result, radius, boxes, 'x');
  result.z = desiredZ;
  resolveBoxAxisInPlace(current, result, radius, boxes, 'z');
  for (const box of boxes) {
    resolveOrientedBoxMovementInPlace(current, result, radius, box);
  }
  resolveBoxAxisInPlace(current, result, radius, boxes, 'x');
  resolveBoxAxisInPlace(current, result, radius, boxes, 'z');
}

export function resolveLocalMovement(
  current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
  arcs?: readonly CollisionArc[],
): LocalPlayerPosition {
  const result = { ...desired };
  resolveBoxMovementInPlace(current, result, radius, boxes);
  if (!arcs?.length) return result;

  for (const arc of arcs) {
    resolveArcMovementInPlace(result, radius, arc);
  }
  resolveBoxMovementInPlace(current, result, radius, boxes);
  return result;
}
