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
const segmentInterval = { minimum: 0, maximum: 1 };

export function segmentBoxInterval(
  start: LocalPlayerPosition,
  end: LocalPlayerPosition,
  box: CollisionBox,
): SegmentBoxInterval | undefined {
  if (!clipSegmentToBox(start, end, box)) return undefined;
  return segmentInterval.maximum > 1e-6 && segmentInterval.minimum < 1 - 1e-6
    ? { minimum: segmentInterval.minimum, maximum: segmentInterval.maximum }
    : undefined;
}

function clipSegmentToBox(
  start: LocalPlayerPosition,
  end: LocalPlayerPosition,
  box: CollisionBox,
): boolean {
  segmentInterval.minimum = 0;
  segmentInterval.maximum = 1;
  const footprint = box.orientedFootprint;
  if (footprint === undefined) return clipAxisAlignedSegment(start, end, box);
  return clipOrientedSegment(start, end, box, footprint);
}

function clipAxisAlignedSegment(
  start: LocalPlayerPosition,
  end: LocalPlayerPosition,
  box: CollisionBox,
): boolean {
  return clipSegmentAxis(start.x, end.x - start.x, box.minX, box.maxX)
    && clipSegmentAxis(start.y, end.y - start.y, box.minY, box.maxY)
    && clipSegmentAxis(start.z, end.z - start.z, box.minZ, box.maxZ);
}

function clipOrientedSegment(
  start: LocalPlayerPosition,
  end: LocalPlayerPosition,
  box: CollisionBox,
  footprint: NonNullable<CollisionBox['orientedFootprint']>,
): boolean {
  const cosine = Math.cos(footprint.rotationY);
  const sine = Math.sin(footprint.rotationY);
  const startX = localFootprintX(start, footprint, cosine, sine);
  const startZ = localFootprintZ(start, footprint, cosine, sine);
  const endX = localFootprintX(end, footprint, cosine, sine);
  const endZ = localFootprintZ(end, footprint, cosine, sine);
  return clipSegmentAxis(startX, endX - startX, -footprint.halfWidth, footprint.halfWidth)
    && clipSegmentAxis(start.y, end.y - start.y, box.minY, box.maxY)
    && clipSegmentAxis(startZ, endZ - startZ, -footprint.halfDepth, footprint.halfDepth);
}

function clipSegmentAxis(start: number, delta: number, minimum: number, maximum: number): boolean {
  if (Math.abs(delta) < 1e-9) return start >= minimum && start <= maximum;
  const first = (minimum - start) / delta;
  const second = (maximum - start) / delta;
  segmentInterval.minimum = Math.max(segmentInterval.minimum, Math.min(first, second));
  segmentInterval.maximum = Math.min(segmentInterval.maximum, Math.max(first, second));
  return segmentInterval.minimum <= segmentInterval.maximum;
}

function localFootprintX(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  footprint: NonNullable<CollisionBox['orientedFootprint']>,
  cosine: number,
  sine: number,
): number {
  const offsetX = position.x - footprint.centerX;
  const offsetZ = position.z - footprint.centerZ;
  return cosine * offsetX - sine * offsetZ;
}

function localFootprintZ(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  footprint: NonNullable<CollisionBox['orientedFootprint']>,
  cosine: number,
  sine: number,
): number {
  const offsetX = position.x - footprint.centerX;
  const offsetZ = position.z - footprint.centerZ;
  return sine * offsetX + cosine * offsetZ;
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
  for (const box of boxes) {
    if (box.orientedFootprint) continue;
    resolveAxisAgainstBox(current, result, radius, box, axis);
  }
}

function resolveAxisAgainstBox(
  current: LocalPlayerPosition,
  result: LocalPlayerPosition,
  radius: number,
  box: CollisionBox,
  axis: 'x' | 'z',
): void {
  if (!verticallyOverlapsBox(result, box)) return;
  const perpendicularAxis = axis === 'x' ? 'z' : 'x';
  const distance = distanceOutsideAxis(result[perpendicularAxis], box, perpendicularAxis);
  if (distance >= radius) return;
  const minimum = boxAxisMinimum(box, axis);
  const maximum = boxAxisMaximum(box, axis);
  const radiusAtAxis = Math.sqrt(radius * radius - distance * distance);
  result[axis] = resolveLocalAxisMovement(
    current[axis], result[axis], 0, minimum, maximum, radiusAtAxis,
  );
}

function verticallyOverlapsBox(position: LocalPlayerPosition, box: CollisionBox): boolean {
  const feetY = position.y - PLAYER_BODY_HEIGHT;
  return feetY < box.maxY && position.y > box.minY;
}

function distanceOutsideAxis(value: number, box: CollisionBox, axis: 'x' | 'z'): number {
  const minimum = boxAxisMinimum(box, axis);
  const maximum = boxAxisMaximum(box, axis);
  return value < minimum ? minimum - value : Math.max(0, value - maximum);
}

function boxAxisMinimum(box: CollisionBox, axis: 'x' | 'z'): number {
  return axis === 'x' ? box.minX : box.minZ;
}

function boxAxisMaximum(box: CollisionBox, axis: 'x' | 'z'): number {
  return axis === 'x' ? box.maxX : box.maxZ;
}

function resolveOrientedBoxMovementInPlace(
  current: LocalPlayerPosition,
  result: LocalPlayerPosition,
  radius: number,
  box: CollisionBox,
): void {
  const footprint = box.orientedFootprint;
  if (!footprint) return;
  if (!verticallyOverlapsBox(result, box)) return;

  const cosine = Math.cos(footprint.rotationY);
  const sine = Math.sin(footprint.rotationY);
  const currentLocalX = localFootprintX(current, footprint, cosine, sine);
  const currentLocalZ = localFootprintZ(current, footprint, cosine, sine);
  let resultLocalX = localFootprintX(result, footprint, cosine, sine);
  const desiredLocalZ = localFootprintZ(result, footprint, cosine, sine);
  resultLocalX = resolveLocalAxisMovement(
    currentLocalX, resultLocalX, currentLocalZ,
    -footprint.halfWidth, footprint.halfWidth, radius, footprint.halfDepth,
  );
  const resultLocalZ = resolveLocalAxisMovement(
    currentLocalZ, desiredLocalZ, resultLocalX,
    -footprint.halfDepth, footprint.halfDepth, radius, footprint.halfWidth,
  );

  result.x = footprint.centerX + cosine * resultLocalX + sine * resultLocalZ;
  result.z = footprint.centerZ - sine * resultLocalX + cosine * resultLocalZ;
}

function resolveLocalAxisMovement(
  start: number,
  target: number,
  perpendicular: number,
  minimum: number,
  maximum: number,
  radius: number,
  perpendicularHalfExtent = 0,
): number {
  const distance = perpendicularHalfExtent === 0
    ? 0
    : distanceOutsideRange(perpendicular, -perpendicularHalfExtent, perpendicularHalfExtent);
  if (distance >= radius) return target;
  const radiusAtAxis = Math.sqrt(radius * radius - distance * distance);
  const lowerBoundary = minimum - radiusAtAxis;
  const upperBoundary = maximum + radiusAtAxis;
  if (start <= minimum && target >= start && target > lowerBoundary) return lowerBoundary;
  if (start >= maximum && target <= start && target < upperBoundary) return upperBoundary;
  return target;
}

function distanceOutsideRange(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum - value : Math.max(0, value - maximum);
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
