export interface CollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
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

export const PLAYER_BODY_HEIGHT = 1.5;
export const MAX_JUMPABLE_SUPPORT_HEIGHT = 0.6;
const SUPPORT_EPSILON = 1e-6;

function circleOverlapsFootprint(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  box: CollisionBox,
): boolean {
  const closestX = Math.max(box.minX, Math.min(position.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
  return (position.x - closestX) ** 2 + (position.z - closestZ) ** 2 < radius ** 2;
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
    && circleOverlapsFootprint(position, radius, box);
}

export function findSupportEyeHeight(
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
  radius: number,
  deckEyeHeight: number,
  boxes: readonly CollisionBox[],
): number {
  const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
  const candidates = boxes
    .filter((box) => circleOverlapsFootprint(position, radius, box))
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

export function resolveArcMovement(
  _current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  arc: CollisionArc,
): LocalPlayerPosition {
  const playerFeetY = desired.y - PLAYER_BODY_HEIGHT;
  if (playerFeetY >= arc.maxY || desired.y <= arc.minY) return desired;

  const outwardDirection = arc.end === 'bow' ? 1 : -1;
  const localX = desired.x - arc.centerX;
  const localZ = outwardDirection * (desired.z - arc.centerZ);
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
  if (signedDistance < -clearance) return desired;

  return {
    x: arc.centerX + ellipseX - normalX * clearance,
    y: desired.y,
    z: arc.centerZ + outwardDirection * (ellipseZ - normalZ * clearance),
  };
}

function resolveBoxMovement(
  current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
): LocalPlayerPosition {
  const result = { ...desired };
  const resolveAxis = (axis: 'x' | 'z'): void => {
    const perpendicularAxis = axis === 'x' ? 'z' : 'x';
    for (const box of boxes) {
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
  };

  result.z = current.z;
  resolveAxis('x');
  result.z = desired.z;
  resolveAxis('z');
  return result;
}

export function resolveLocalMovement(
  current: LocalPlayerPosition,
  desired: LocalPlayerPosition,
  radius: number,
  boxes: readonly CollisionBox[],
  arcs: readonly CollisionArc[] = [],
): LocalPlayerPosition {
  const boxResolved = resolveBoxMovement(current, desired, radius, boxes);
  if (arcs.length === 0) return boxResolved;

  let arcResolved = boxResolved;
  for (const arc of arcs) {
    arcResolved = resolveArcMovement(current, arcResolved, radius, arc);
  }
  return resolveBoxMovement(current, arcResolved, radius, boxes);
}
