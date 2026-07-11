import { Euler, Vector3 } from 'three';

export interface BoatStorageTransform {
  position: Vector3;
  rotation: Euler;
  scale: number;
}

const BASE_POSITIONS: readonly [number, number, number][] = [
  [-0.72, -0.10, -1.82], [0, -0.10, -1.82], [0.72, -0.10, -1.82],
  [-0.72, -0.10, -1.16], [0, -0.10, -1.16], [0.72, -0.10, -1.16],
  [-0.72, -0.10, -0.50], [0.72, -0.10, -0.50],
  [-0.72, -0.10, 0.16], [0.72, -0.10, 0.16],
  [-0.72, -0.10, 0.82], [0, -0.10, 0.82], [0.72, -0.10, 0.82],
  [0, -0.10, 1.48],
];

export function boatStorageTransform(index: number): BoatStorageTransform {
  const safe = Math.max(0, Math.floor(index));
  const layer = Math.floor(safe / BASE_POSITIONS.length);
  const [x, y, z] = BASE_POSITIONS[safe % BASE_POSITIONS.length]!;
  return {
    position: new Vector3(x, y + layer * 0.28, z),
    rotation: new Euler(0, (safe % 5) * 0.32 - 0.64, 0),
    scale: 0.78,
  };
}
