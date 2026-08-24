import {
  Object3D,
  Scene,
} from 'three';

export const HOVER_OUTLINE_NAME = 'interaction-hover-outline';

const SCENE_TARGETS = Symbol('interaction-hover-outline-targets');
const EMPTY_TARGETS: Object3D[] = [];

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

export function sceneHoverOutlineTargets(scene: Scene): Object3D[] {
  return (scene as OutlineScene).userData[SCENE_TARGETS] ?? EMPTY_TARGETS;
}

export class HoverOutline {
  private target: Object3D | null = null;
  private marker: Object3D | null = null;
  private registeredScene: OutlineScene | null = null;
  private disposed = false;

  setTarget(next: Object3D | null): void {
    if (this.disposed || next === this.target) return;
    this.clear();
    if (next === null) return;

    const marker = new Object3D();
    marker.name = HOVER_OUTLINE_NAME;
    next.add(marker);
    const scene = containingScene(next);
    if (scene !== null) {
      const targets = scene.userData[SCENE_TARGETS] ?? [];
      if (scene.userData[SCENE_TARGETS] === undefined) {
        scene.userData[SCENE_TARGETS] = targets;
      }
      targets.push(next);
    }
    this.target = next;
    this.marker = marker;
    this.registeredScene = scene;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private clear(): void {
    if (this.target === null) return;
    const targets = this.registeredScene?.userData[SCENE_TARGETS];
    const index = targets?.indexOf(this.target) ?? -1;
    if (index >= 0) targets!.splice(index, 1);
    this.marker?.removeFromParent();
    this.target = null;
    this.marker = null;
    this.registeredScene = null;
  }
}
