import { Box3, Euler, Matrix4, Vector3 } from 'three';

type VectorTuple = readonly [number, number, number];

export interface RawModelBounds {
  readonly min: VectorTuple;
  readonly max: VectorTuple;
}

export function normalizeGeneratedBounds(
  bounds: RawModelBounds,
  rotation: VectorTuple,
  targetLongestDimension: number,
  offset: VectorTuple,
) {
  const raw = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  const corners = [
    new Vector3(raw.min.x, raw.min.y, raw.min.z),
    new Vector3(raw.min.x, raw.min.y, raw.max.z),
    new Vector3(raw.min.x, raw.max.y, raw.min.z),
    new Vector3(raw.min.x, raw.max.y, raw.max.z),
    new Vector3(raw.max.x, raw.min.y, raw.min.z),
    new Vector3(raw.max.x, raw.min.y, raw.max.z),
    new Vector3(raw.max.x, raw.max.y, raw.min.z),
    new Vector3(raw.max.x, raw.max.y, raw.max.z),
  ];
  const matrix = new Matrix4().makeRotationFromEuler(new Euler(...rotation));
  const size = new Box3().setFromPoints(corners.map((point) => point.applyMatrix4(matrix)))
    .getSize(new Vector3());
  const scale = targetLongestDimension / Math.max(size.x, size.y, size.z);
  const normalizedSize = size.multiplyScalar(scale);
  const halfSize = normalizedSize.clone().multiplyScalar(0.5);
  const translation = new Vector3(...offset);
  const epsilon = 1e-9;
  return {
    normalizedSize: normalizedSize.toArray() as [number, number, number],
    normalizedBounds: {
      min: halfSize.clone().multiplyScalar(-1).add(translation)
        .addScalar(-epsilon).toArray() as [number, number, number],
      max: halfSize.add(translation)
        .addScalar(epsilon).toArray() as [number, number, number],
    },
  };
}
