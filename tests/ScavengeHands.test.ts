// Importance: 4/5. Protects hand model ownership, mirrored setup, and failed construction cleanup.
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  MeshStandardMaterial,
  PerspectiveCamera,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ScavengeHands, type ScavengeHandModelFactory } from '../src/player/ScavengeHands';
import type { EventModelInstance } from '../src/survival/EventModelLibrary';

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
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(
    new Uint16Array(vertices * 4), 4,
  ));
  const weights = new Float32Array(vertices * 4);
  for (let index = 0; index < vertices; index += 1) weights[index * 4] = 1;
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(
    geometry,
    new MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 }),
  );
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  return root;
}

function modelInstance(): EventModelInstance {
  return { root: riggedHand(), dispose: vi.fn() };
}

describe('ScavengeHands', () => {
  it('owns mirrored, weathered hands and resets their keyed gesture', () => {
    const camera = new PerspectiveCamera();
    const left = modelInstance();
    const right = modelInstance();
    const factory: ScavengeHandModelFactory = {
      create: vi.fn()
        .mockReturnValueOnce(left)
        .mockReturnValueOnce(right),
    };
    const hands = new ScavengeHands(camera, factory);

    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(hands.root.parent).toBe(camera);
    expect(hands.available).toBe(true);
    expect(hands.root.getObjectByName('scavenge-hand:left')!.children[0]!.scale.x)
      .toBe(-0.35);
    expect(hands.root.getObjectByName('scavenge-hand:right')!.children[0]!.scale.x)
      .toBe(0.35);
    const leftWrist = hands.root.getObjectByName('scavenge-hand:left')!;
    const rightWrist = hands.root.getObjectByName('scavenge-hand:right')!;
    expect(leftWrist.children[0]!.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(rightWrist.children[0]!.rotation.z).toBeCloseTo(-Math.PI / 2);
    const material = (left.root.children.at(-1) as SkinnedMesh).material;
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect((material as MeshStandardMaterial).roughness).toBe(0.92);
    expect((material as MeshStandardMaterial).metalness).toBe(0);

    hands.update(0, 0, true, false, true);
    expect(hands.root.visible).toBe(true);
    expect(leftWrist.position.y).toBe(-0.42);
    expect(rightWrist.position.y).toBe(-0.43);
    expect(leftWrist.position.x).toBe(-0.36);
    expect(rightWrist.position.x).toBe(0.36);
    expect(leftWrist.position.z).toBe(-0.5);
    expect(rightWrist.position.z).toBe(-0.5);
    hands.update(1.2, 0, true, false, true);
    expect(hands.root.visible).toBe(true);
    expect(leftWrist.position.y).toBeGreaterThan(-0.42);
    expect(rightWrist.position.y).toBeGreaterThan(-0.43);
    hands.playGesture('pickup');
    hands.update(0.32, 0, true, false, true);
    expect(hands.root.userData.gesture).toBe('pickup');
    hands.update(1, 0, true, false, true);
    expect(hands.root.userData.gesture).toBeNull();

    hands.hideAndReset();
    expect(hands.root.visible).toBe(false);
    expect(hands.root.userData.gesture).toBeNull();
    hands.dispose();
    hands.dispose();
    expect(left.dispose).toHaveBeenCalledOnce();
    expect(right.dispose).toHaveBeenCalledOnce();
  });

  it('disposes an earlier instance when creating the pair fails', () => {
    const left = modelInstance();
    const factory: ScavengeHandModelFactory = {
      create: vi.fn()
        .mockReturnValueOnce(left)
        .mockImplementationOnce(() => { throw new Error('missing right hand'); }),
    };

    const hands = new ScavengeHands(new PerspectiveCamera(), factory);

    expect(hands.available).toBe(false);
    expect(hands.root.visible).toBe(false);
    expect(left.dispose).toHaveBeenCalledOnce();
    hands.dispose();
    expect(left.dispose).toHaveBeenCalledOnce();
  });
});
