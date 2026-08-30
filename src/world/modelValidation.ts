import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
} from 'three';

type ModelError = (message: string) => Error;

export interface LongestDimensionSpec {
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly targetLongestDimension: number;
  readonly maxTriangles: number;
}

export function geometryTriangles(geometry: BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  return count / 3;
}

export function validatedGeometryTriangles(
  geometry: BufferGeometry,
  error: ModelError,
): number {
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) throw error('mesh has missing or empty position data');
  for (let index = 0; index < position.count; index += 1) {
    if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) {
      throw error('mesh contains non-finite position data');
    }
  }
  const elementCount = geometry.index?.count ?? position.count;
  if (elementCount % 3 !== 0) {
    throw error('mesh element count does not describe complete triangles');
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return elementCount / 3;
}

export function finiteBox(box: Box3): boolean {
  return [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite);
}

function validateTemplateMeshes(root: Group, spec: LongestDimensionSpec, error: ModelError): number {
  let meshCount = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    triangles += validatedGeometryTriangles(object.geometry, error);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  if (meshCount === 0) throw error('scene contains no meshes');
  if (triangles > spec.maxTriangles) {
    throw error(`triangle count ${triangles} exceeds the ${spec.maxTriangles} limit`);
  }
  return triangles;
}

function validBounds(bounds: Box3): boolean {
  return !bounds.isEmpty() && finiteBox(bounds);
}

function longestDimension(bounds: Box3): number {
  const size = bounds.getSize(new Vector3());
  return Math.max(size.x, size.y, size.z);
}

export function normalizeLongestDimensionTemplate(
  root: Group,
  spec: LongestDimensionSpec,
  error: ModelError,
  finalTolerance?: number,
): number {
  root.rotation.set(...spec.rotation);
  root.updateMatrixWorld(true);
  const triangles = validateTemplateMeshes(root, spec, error);

  const sourceBounds = new Box3().setFromObject(root);
  if (!validBounds(sourceBounds)) {
    throw error('scene has empty or non-finite bounds');
  }
  const longestSide = longestDimension(sourceBounds);
  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    throw error('scene has zero-length bounds');
  }

  root.scale.multiplyScalar(spec.targetLongestDimension / longestSide);
  root.updateMatrixWorld(true);
  const scaledBounds = new Box3().setFromObject(root);
  if (!validBounds(scaledBounds)) {
    throw error('normalized scene has empty or non-finite bounds');
  }
  const center = scaledBounds.getCenter(new Vector3());
  root.position.add(new Vector3(...spec.offset).sub(center));
  root.updateMatrixWorld(true);

  const finalBounds = new Box3().setFromObject(root);
  const finalLongestSide = longestDimension(finalBounds);
  const invalidLength = !Number.isFinite(finalLongestSide) || finalLongestSide <= 0;
  const missesTolerance = finalTolerance !== undefined
    && Math.abs(finalLongestSide - spec.targetLongestDimension) > finalTolerance;
  if (!validBounds(finalBounds) || invalidLength || missesTolerance) {
    throw error('normalized scene has invalid bounds');
  }
  return triangles;
}
