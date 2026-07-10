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
    for (const box of boxes) {
      if (result.y < box.minY || result.y > box.maxY) continue;
      const closestX = Math.max(box.minX, Math.min(result.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(result.z, box.maxZ));
      const dx = result.x - closestX;
      const dz = result.z - closestZ;
      if (dx * dx + dz * dz >= radius * radius) continue;

      if (axis === 'x') {
        if (current.x <= box.minX) result.x = box.minX - radius;
        else if (current.x >= box.maxX) result.x = box.maxX + radius;
      } else {
        if (current.z <= box.minZ) result.z = box.minZ - radius;
        else if (current.z >= box.maxZ) result.z = box.maxZ + radius;
      }
    }
  };

  result.z = current.z;
  resolveAxis('x');
  result.z = desired.z;
  resolveAxis('z');
  return result;
}
