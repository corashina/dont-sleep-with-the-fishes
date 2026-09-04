import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
import { snatcherItemDuration } from '../src/survival/events/snatcherChoreography';
import { lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';

async function loadProductionSnatcher(): Promise<EventModelLibrary> {
  const bytes = await readFile(resolve('src/assets/models/events/snatcher.glb'));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  if (typeof globalThis.self === 'undefined') {
    Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
  }
  return EventModelLibrary.load(['snatcher'], {
    load: () => new Promise((onLoad, onError) => {
      new GLTFLoader().parse(data, '', ({ scene, animations }) => {
        scene.animations = animations.slice();
        onLoad(scene);
      }, onError);
    }),
  });
}

describe('SnatcherPresentation', () => {
  it('keeps the knife target on the nearest animated surface', () => {
    const modelRoot = new Group();
    const geometry = new BufferGeometry();
    const position = new Float32BufferAttribute([
      0, 1.25, 0.44,
      0.08, 1.25, 0.44,
    ], 3);
    geometry.setAttribute('position', position);
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute([
      1, 0, 0, 0,
      0, 0, 0, 0,
    ], 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([
      1, 0, 0, 0,
      1, 0, 0, 0,
    ], 4));
    const material = new MeshBasicMaterial();
    const mesh = new SkinnedMesh(geometry, material);
    const baseBone = new Bone();
    const movingBone = new Bone();
    baseBone.name = 'Tentacle8';
    movingBone.name = 'Tentacle9';
    movingBone.position.y = 1;
    baseBone.add(movingBone);
    mesh.add(baseBone);
    const skeleton = new Skeleton([baseBone, movingBone]);
    mesh.bind(skeleton);
    modelRoot.add(mesh);
    const presentation = new SnatcherPresentation({
      eventModels: {
        create: () => ({ root: modelRoot, dispose: vi.fn() }),
      },
    } as never);
    const target = presentation.itemAimTarget;
    presentation.stage({ eventId: 'snatcher' } as never);

    movingBone.position.y = -1;
    presentation.update(0, 0);
    mesh.updateWorldMatrix(true, true);
    skeleton.update();
    const expectedPosition = new Vector3().fromBufferAttribute(position, 1);
    mesh.applyBoneTransform(1, expectedPosition);
    mesh.localToWorld(expectedPosition);
    const targetPosition = new Vector3();
    target.getWorldPosition(targetPosition);

    expect(targetPosition.distanceTo(expectedPosition)).toBeLessThan(0.0001);
    presentation.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('keeps the production knife target at tentacle height during its animation', async () => {
    const eventModels = await loadProductionSnatcher();
    const presentation = new SnatcherPresentation({ eventModels } as never);
    presentation.stage({ eventId: 'snatcher' } as never);
    const itemUse = presentation.playItemUse('knife', 'knife-1' as never);
    const targetPosition = new Vector3();
    const duration = snatcherItemDuration('knife');

    for (let frame = 0; frame <= 60; frame += 1) {
      presentation.update(frame * duration / 60, duration / 60);
      presentation.itemAimTarget.getWorldPosition(targetPosition);
      expect(targetPosition.y).toBeGreaterThan(0.1);
      const hullHalfWidth = lifeboatHullHalfWidthAt(targetPosition.z);
      expect(hullHalfWidth).not.toBeNull();
      expect(targetPosition.x).toBeGreaterThan(hullHalfWidth!);
    }

    await itemUse;
    presentation.dispose();
    eventModels.dispose();
  });
});
