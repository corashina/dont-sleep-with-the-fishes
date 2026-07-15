export interface CollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
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

export function resolveLocalMovement(
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
