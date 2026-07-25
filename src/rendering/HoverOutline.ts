import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export const HOVER_OUTLINE_NAME = 'interaction-hover-outline';

const SCENE_TARGETS = Symbol('interaction-hover-outline-targets');
const EMPTY_TARGETS: Object3D[] = [];
const MINIMUM_PROXY_DEPTH = 0.02;

type OutlineScene = Scene & {
  userData: {
    [SCENE_TARGETS]?: Object3D[];
  };
};

function containingScene(object: Object3D): OutlineScene | null {
  let current: Object3D | null = object;
  while (current !== null) {
    if (current instanceof Scene) return current as OutlineScene;
    current = current.parent;
  }
  return null;
}

function visibleFromTarget(object: Object3D, target: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    if (current === target) return true;
    current = current.parent;
  }
  return false;
}

function collectTargetPoints(target: Object3D): Vector3[] {
  target.updateWorldMatrix(true, true);
  const inverseTarget = new Matrix4().copy(target.matrixWorld).invert();
  const localFromMesh = new Matrix4();
  const point = new Vector3();
  const points: Vector3[] = [];
  target.traverse((object) => {
    if (
      !(object instanceof Mesh)
      || object.name === HOVER_OUTLINE_NAME
      || !visibleFromTarget(object, target)
    ) return;
    const positions = object.geometry.getAttribute('position');
    if (positions === undefined) return;
    localFromMesh.multiplyMatrices(inverseTarget, object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(localFromMesh);
      points.push(point.clone());
    }
  });
  return points;
}

function createProxyGeometry(points: Vector3[]): BufferGeometry | null {
  if (points.length === 0) return null;
  const bounds = new Box3().setFromPoints(points);
  const size = bounds.getSize(new Vector3());
  if (
    points.length >= 4
    && size.x > MINIMUM_PROXY_DEPTH
    && size.y > MINIMUM_PROXY_DEPTH
    && size.z > MINIMUM_PROXY_DEPTH
  ) {
    return new ConvexGeometry(points);
  }
  size.set(
    Math.max(MINIMUM_PROXY_DEPTH, size.x),
    Math.max(MINIMUM_PROXY_DEPTH, size.y),
    Math.max(MINIMUM_PROXY_DEPTH, size.z),
  );
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  geometry.translate(...bounds.getCenter(new Vector3()).toArray());
  return geometry;
}

export function sceneHoverOutlineTargets(scene: Scene): Object3D[] {
  return (scene as OutlineScene).userData[SCENE_TARGETS] ?? EMPTY_TARGETS;
}

export class HoverOutline {
  private readonly proxyMaterial = new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  private proxy: Mesh | null = null;
  private registeredScene: OutlineScene | null = null;
  private disposed = false;

  setTarget(next: Object3D | null): void {
    if (this.disposed || next === this.proxy?.parent) return;
    this.clear();
    if (next === null) return;

    const geometry = createProxyGeometry(collectTargetPoints(next));
    const scene = containingScene(next);
    if (geometry === null) return;
    const proxy = new Mesh(geometry, this.proxyMaterial);
    proxy.name = HOVER_OUTLINE_NAME;
    proxy.raycast = () => undefined;
    next.add(proxy);
    if (scene !== null) {
      const targets = scene.userData[SCENE_TARGETS] ?? [];
      if (scene.userData[SCENE_TARGETS] === undefined) scene.userData[SCENE_TARGETS] = targets;
      targets.push(proxy);
    }
    this.proxy = proxy;
    this.registeredScene = scene;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.proxyMaterial.dispose();
    this.disposed = true;
  }

  private clear(): void {
    if (this.proxy === null) return;
    const targets = this.registeredScene?.userData[SCENE_TARGETS];
    const index = targets?.indexOf(this.proxy) ?? -1;
    if (index >= 0) targets!.splice(index, 1);
    this.proxy.removeFromParent();
    this.proxy.geometry.dispose();
    this.proxy = null;
    this.registeredScene = null;
  }
}
