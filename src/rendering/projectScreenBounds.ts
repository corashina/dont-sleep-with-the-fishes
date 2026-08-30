import {
  Box3,
  Matrix4,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  Vector3,
} from 'three';

export interface ProjectedScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  visible: boolean;
}

export interface ObjectScreenBoundsCacheEntry {
  readonly object: Mesh;
  readonly bounds: Box3;
  readonly rootFromMesh: Matrix4;
}

export interface ObjectScreenBoundsCache {
  readonly entries: readonly ObjectScreenBoundsCacheEntry[];
}

const TARGET_PADDING = 8;
const MINIMUM_TARGET = 44;
const center = new Vector3();
const cameraCenter = new Vector3();
const corner = new Vector3();
const objectCameraCorner = new Vector3();
const objectProjectedCorner = new Vector3();
const objectCacheRootInverse = new Matrix4();
const objectCachedWorldMatrix = new Matrix4();
let objectProjectionCamera: PerspectiveCamera | null = null;
let objectProjectionWidth = 0;
let objectProjectionHeight = 0;
let objectRawLeft = Number.POSITIVE_INFINITY;
let objectRawRight = Number.NEGATIVE_INFINITY;
let objectRawTop = Number.POSITIVE_INFINITY;
let objectRawBottom = Number.NEGATIVE_INFINITY;
let objectMinimumCameraZ = Number.POSITIVE_INFINITY;
let objectMaximumCameraZ = Number.NEGATIVE_INFINITY;
let objectProjectionCrossesCamera = false;
let objectProjectionHasPoint = false;
let screenRawLeft = Number.POSITIVE_INFINITY;
let screenRawRight = Number.NEGATIVE_INFINITY;
let screenRawTop = Number.POSITIVE_INFINITY;
let screenRawBottom = Number.NEGATIVE_INFINITY;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

function hiddenBounds(): ProjectedScreenBounds {
  return { x: 0, y: 0, width: 0, height: 0, depth: 0, visible: false };
}

function writeHiddenBounds(output: ProjectedScreenBounds): ProjectedScreenBounds {
  output.x = 0;
  output.y = 0;
  output.width = 0;
  output.height = 0;
  output.depth = 0;
  output.visible = false;
  return output;
}

function boundsFromExtentsInto(
  output: ProjectedScreenBounds,
  rawLeft: number,
  rawRight: number,
  rawTop: number,
  rawBottom: number,
  depth: number,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  if (rawRight < 0 || rawLeft > viewportWidth || rawBottom < 0 || rawTop > viewportHeight) {
    return writeHiddenBounds(output);
  }

  const clippedLeft = clamp(rawLeft - TARGET_PADDING, 0, viewportWidth);
  const clippedRight = clamp(rawRight + TARGET_PADDING, 0, viewportWidth);
  const clippedTop = clamp(rawTop - TARGET_PADDING, 0, viewportHeight);
  const clippedBottom = clamp(rawBottom + TARGET_PADDING, 0, viewportHeight);
  const width = Math.min(viewportWidth, Math.max(MINIMUM_TARGET, clippedRight - clippedLeft));
  const height = Math.min(viewportHeight, Math.max(MINIMUM_TARGET, clippedBottom - clippedTop));
  const rawX = (clippedLeft + clippedRight) / 2;
  const rawY = (clippedTop + clippedBottom) / 2;

  output.x = clamp(rawX, width / 2, viewportWidth - width / 2);
  output.y = clamp(rawY, height / 2, viewportHeight - height / 2);
  output.width = width;
  output.height = height;
  output.depth = depth;
  output.visible = true;
  return output;
}

function boundsFromExtents(
  rawLeft: number,
  rawRight: number,
  rawTop: number,
  rawBottom: number,
  depth: number,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  return boundsFromExtentsInto(
    hiddenBounds(),
    rawLeft,
    rawRight,
    rawTop,
    rawBottom,
    depth,
    viewportWidth,
    viewportHeight,
  );
}

export function projectScreenBounds(
  bounds: Box3,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  if (bounds.isEmpty() || viewportWidth <= 0 || viewportHeight <= 0) return hiddenBounds();
  camera.updateWorldMatrix(true, false);
  bounds.getCenter(center);
  cameraCenter.copy(center).applyMatrix4(camera.matrixWorldInverse);
  if (cameraCenter.z >= 0) return hiddenBounds();
  if (!projectBoxCorners(bounds, camera, viewportWidth, viewportHeight)) return hiddenBounds();
  return boundsFromExtents(
    screenRawLeft,
    screenRawRight,
    screenRawTop,
    screenRawBottom,
    -cameraCenter.z,
    viewportWidth,
    viewportHeight,
  );
}

function projectBoxCorners(
  bounds: Box3,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  screenRawLeft = Number.POSITIVE_INFINITY;
  screenRawRight = Number.NEGATIVE_INFINITY;
  screenRawTop = Number.POSITIVE_INFINITY;
  screenRawBottom = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < 8; index += 1) {
    corner.set(
      index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y,
      index & 4 ? bounds.max.z : bounds.min.z,
    ).project(camera);
    if (!includeProjectedCorner(viewportWidth, viewportHeight)) return false;
  }
  return screenRawRight >= 0
    && screenRawLeft <= viewportWidth
    && screenRawBottom >= 0
    && screenRawTop <= viewportHeight;
}

function includeProjectedCorner(viewportWidth: number, viewportHeight: number): boolean {
  const x = (corner.x * 0.5 + 0.5) * viewportWidth;
  const y = (-corner.y * 0.5 + 0.5) * viewportHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  screenRawLeft = Math.min(screenRawLeft, x);
  screenRawRight = Math.max(screenRawRight, x);
  screenRawTop = Math.min(screenRawTop, y);
  screenRawBottom = Math.max(screenRawBottom, y);
  return true;
}

function projectVisibleMeshBounds(object: Object3D): void {
  if (!(object instanceof Mesh) || objectProjectionCamera === null) return;
  if (object.geometry.boundingBox === null) object.geometry.computeBoundingBox();
  const bounds = object.geometry.boundingBox;
  if (bounds === null || bounds.isEmpty()) return;
  projectMeshBounds(bounds, object.matrixWorld);
}

function projectMeshBounds(bounds: Box3, matrixWorld: Matrix4): void {
  if (objectProjectionCamera === null) return;
  for (let index = 0; index < 8; index += 1) {
    objectCameraCorner.set(
      index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y,
      index & 4 ? bounds.max.z : bounds.min.z,
    ).applyMatrix4(matrixWorld).applyMatrix4(objectProjectionCamera.matrixWorldInverse);
    if (objectCameraCorner.z >= 0) {
      objectProjectionCrossesCamera = true;
      continue;
    }
    objectMinimumCameraZ = Math.min(objectMinimumCameraZ, objectCameraCorner.z);
    objectMaximumCameraZ = Math.max(objectMaximumCameraZ, objectCameraCorner.z);
    objectProjectedCorner.copy(objectCameraCorner).applyMatrix4(objectProjectionCamera.projectionMatrix);
    const x = (objectProjectedCorner.x * 0.5 + 0.5) * objectProjectionWidth;
    const y = (-objectProjectedCorner.y * 0.5 + 0.5) * objectProjectionHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      objectProjectionCrossesCamera = true;
      continue;
    }
    objectRawLeft = Math.min(objectRawLeft, x);
    objectRawRight = Math.max(objectRawRight, x);
    objectRawTop = Math.min(objectRawTop, y);
    objectRawBottom = Math.max(objectRawBottom, y);
    objectProjectionHasPoint = true;
  }
}

function beginObjectProjection(
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): void {
  objectProjectionCamera = camera;
  objectProjectionWidth = viewportWidth;
  objectProjectionHeight = viewportHeight;
  objectRawLeft = Number.POSITIVE_INFINITY;
  objectRawRight = Number.NEGATIVE_INFINITY;
  objectRawTop = Number.POSITIVE_INFINITY;
  objectRawBottom = Number.NEGATIVE_INFINITY;
  objectMinimumCameraZ = Number.POSITIVE_INFINITY;
  objectMaximumCameraZ = Number.NEGATIVE_INFINITY;
  objectProjectionCrossesCamera = false;
  objectProjectionHasPoint = false;
}

function finishObjectProjectionInto(
  output: ProjectedScreenBounds,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  objectProjectionCamera = null;
  if (!objectProjectionHasPoint || objectProjectionCrossesCamera) {
    return writeHiddenBounds(output);
  }
  return boundsFromExtentsInto(
    output,
    objectRawLeft,
    objectRawRight,
    objectRawTop,
    objectRawBottom,
    -(objectMinimumCameraZ + objectMaximumCameraZ) / 2,
    viewportWidth,
    viewportHeight,
  );
}

export function projectObjectScreenBounds(
  root: Object3D,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  return projectObjectScreenBoundsInto(
    hiddenBounds(),
    root,
    camera,
    viewportWidth,
    viewportHeight,
  );
}

export function projectObjectScreenBoundsInto(
  output: ProjectedScreenBounds,
  root: Object3D,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  if (viewportWidth <= 0 || viewportHeight <= 0 || !root.visible) {
    return writeHiddenBounds(output);
  }
  camera.updateWorldMatrix(true, false);
  root.updateWorldMatrix(true, true);

  beginObjectProjection(camera, viewportWidth, viewportHeight);
  root.traverseVisible(projectVisibleMeshBounds);
  return finishObjectProjectionInto(output, viewportWidth, viewportHeight);
}

export function createObjectScreenBoundsCache(
  root: Object3D,
): ObjectScreenBoundsCache | null {
  root.updateWorldMatrix(true, true);
  objectCacheRootInverse.copy(root.matrixWorld).invert();
  const entries: ObjectScreenBoundsCacheEntry[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object.geometry.boundingBox === null) object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (bounds === null || bounds.isEmpty()) return;
    entries.push(Object.freeze({
      object,
      bounds: bounds.clone(),
      rootFromMesh: new Matrix4().multiplyMatrices(
        objectCacheRootInverse,
        object.matrixWorld,
      ),
    }));
  });
  if (entries.length === 0) return null;
  return Object.freeze({ entries: Object.freeze(entries) });
}

function isVisibleWithinRoot(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

export function projectCachedObjectScreenBounds(
  root: Object3D,
  cache: ObjectScreenBoundsCache | null,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  return projectCachedObjectScreenBoundsInto(
    hiddenBounds(),
    root,
    cache,
    camera,
    viewportWidth,
    viewportHeight,
  );
}

export function projectCachedObjectScreenBoundsInto(
  output: ProjectedScreenBounds,
  root: Object3D,
  cache: ObjectScreenBoundsCache | null,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedScreenBounds {
  if (cache === null) {
    return projectObjectScreenBoundsInto(
      output,
      root,
      camera,
      viewportWidth,
      viewportHeight,
    );
  }
  if (viewportWidth <= 0 || viewportHeight <= 0 || !root.visible) {
    return writeHiddenBounds(output);
  }
  camera.updateWorldMatrix(true, false);
  root.updateWorldMatrix(true, false);

  beginObjectProjection(camera, viewportWidth, viewportHeight);
  for (const entry of cache.entries) {
    if (!isVisibleWithinRoot(entry.object, root)) continue;
    objectCachedWorldMatrix.multiplyMatrices(root.matrixWorld, entry.rootFromMesh);
    projectMeshBounds(entry.bounds, objectCachedWorldMatrix);
  }
  return finishObjectProjectionInto(output, viewportWidth, viewportHeight);
}
