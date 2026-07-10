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
      if (result.y < box.minY || result.y > box.maxY) continue;
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
