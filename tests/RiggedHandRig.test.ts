// Importance: 8/10 (scaled from 4/5). Protects hand skeleton validation, pose restoration, and joint control.
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyHandJointCurl,
  findImportedHandRig,
} from '../src/rendering/RiggedHandRig';

const CHAINS = [
  ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
  ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
  ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
  ['RingF_lower', 'RingF_middle', 'RingF_tip'],
  ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
] as const;

function riggedHand(): Group {
  const root = new Group();
  const bones: Bone[] = [];
  for (const chain of CHAINS) {
    let parent: Bone | null = null;
    for (const name of chain) {
      const bone = new Bone();
      bone.name = name;
      if (parent) parent.add(bone);
      else root.add(bone);
      bones.push(bone);
      parent = bone;
    }
  }
  const geometry = new BoxGeometry(1, 1, 1);
  const vertices = geometry.getAttribute('position').count;
  const indices = new Uint16Array(vertices * 4);
  const weights = new Float32Array(vertices * 4);
  for (let index = 0; index < vertices; index += 1) weights[index * 4] = 1;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  return root;
}

describe('RiggedHandRig', () => {
  it('finds all named joints in a driven hand mesh', () => {
    expect(findImportedHandRig(riggedHand())?.joints).toHaveLength(15);
  });

  it('rejects a missing or disconnected finger joint', () => {
    const root = riggedHand();
    root.getObjectByName('IndexF_tip')!.removeFromParent();
    expect(findImportedHandRig(root)).toBeNull();
  });

  it('restores base rotations before applying clamped curl', () => {
    const rig = findImportedHandRig(riggedHand())!;
    applyHandJointCurl(rig.joints, 1);
    const curled = rig.joints[0]!.object.rotation.x;
    applyHandJointCurl(rig.joints, 0);
    expect(curled).toBeCloseTo(0.78);
    expect(rig.joints[0]!.object.rotation.x).toBeCloseTo(0);
  });
});
