import {
  Bone,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
} from 'three';
import { hasRenderableBounds } from './modelPresentation';

export interface HandJoint {
  readonly object: Object3D;
  readonly baseQuaternion: Quaternion;
  readonly bend: number;
}

export interface ImportedHandRig {
  readonly joints: readonly HandJoint[];
  readonly skeletons: ReadonlySet<Skeleton>;
}

const FINGER_CHAINS = [
  ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
  ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
  ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
  ['RingF_lower', 'RingF_middle', 'RingF_tip'],
  ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
] as const;

function descendsFrom(node: Object3D, ancestor: Object3D): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
}

export function findImportedHandRig(root: Object3D): ImportedHandRig | null {
  const bones: Bone[] = [];
  for (const chain of FINGER_CHAINS) {
    let previous: Bone | null = null;
    for (const name of chain) {
      const bone = root.getObjectByName(name);
      if (!(bone instanceof Bone)) return null;
      if (previous && !descendsFrom(bone, previous)) return null;
      bones.push(bone);
      previous = bone;
    }
  }
  if (new Set(bones).size !== bones.length) return null;

  const skeletons = new Set<Skeleton>();
  let driven = false;
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    skeletons.add(object.skeleton);
    if (bones.every((bone) => object.skeleton.bones.includes(bone))) {
      driven ||= hasRenderableBounds(object);
    }
  });
  if (!driven) return null;

  return {
    joints: bones.map((object, index) => ({
      object,
      baseQuaternion: object.quaternion.clone(),
      bend: index % 3 === 0 ? 0.78 : index % 3 === 1 ? 0.92 : 0.7,
    })),
    skeletons,
  };
}

export function applyHandJointCurl(
  joints: readonly HandJoint[],
  amount: number,
): void {
  const curl = Math.max(0, Math.min(1, amount));
  for (const joint of joints) {
    joint.object.quaternion.copy(joint.baseQuaternion);
    joint.object.rotateX(curl * joint.bend);
  }
}
