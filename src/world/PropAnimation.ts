import {
  AnimationClip,
  AnimationMixer,
  Group,
  LoopRepeat,
  Object3D,
} from 'three';

export const CAPTAIN_WHISKERS_IDLE_CLIP = 'CaptainWhiskersIdle';

function stablePhase(instanceId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function visibleInHierarchy(root: Group): boolean {
  if (root.parent === null) return false;
  let current: Object3D | null = root;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

export interface PropAnimation {
  readonly time: number;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export class KeyedPropAnimation implements PropAnimation {
  private readonly mixer: AnimationMixer;
  private readonly action;
  private disposed = false;

  constructor(
    private readonly root: Group,
    private readonly clip: AnimationClip,
    instanceId: string,
  ) {
    this.mixer = new AnimationMixer(root);
    this.action = this.mixer.clipAction(clip);
    this.action.setLoop(LoopRepeat, Infinity);
    this.action.play();
    this.mixer.setTime(stablePhase(instanceId) * clip.duration);
  }

  get time(): number {
    return this.mixer.time;
  }

  update(deltaSeconds: number): void {
    if (
      this.disposed
      || !visibleInHierarchy(this.root)
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds <= 0
    ) {
      return;
    }
    this.mixer.update(deltaSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.action.stop();
    this.mixer.stopAllAction();
    this.mixer.uncacheAction(this.clip, this.root);
    this.mixer.uncacheClip(this.clip);
    this.mixer.uncacheRoot(this.root);
  }
}
