import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Bone, Box3, PerspectiveCamera, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { FogMonster } from '../src/survival/FogMonster';

async function loadMonster(): Promise<EventModelLibrary> {
  const bytes = await readFile(resolve('src/assets/models/events/fogMonster.glb'));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return EventModelLibrary.load(['fogMonster'], {
    load: async () => {
      const loader = new GLTFLoader().register(() => ({ name: 'test-textures', loadTexture: async () => new Texture() }));
      const { scene, animations } = await loader.parseAsync(data, '');
      scene.animations = animations;
      return scene;
    },
  });
}

describe('FogMonster', () => {
  it.each([16 / 9, 9 / 16])('moves the real monster across the water inside a %s viewport', async (aspect) => {
    const models = await loadMonster();
    const instance = models.create('fogMonster');
    const camera = new PerspectiveCamera(80, aspect, 0.05, 100);
    camera.position.set(0, 2, 1.3);
    camera.lookAt(0, 1.2, -9);
    camera.updateMatrixWorld(true);
    const monster = new FogMonster(instance, camera, {
      readWorldWaveAmplitudeScale: () => 1,
      sampleWorldWaveInto: (output, time) => { output.height = Math.sin(time) * 0.12; },
    });
    try {
      monster.stage(42);
      monster.setVisibility(1);
      const bones: Bone[] = [];
      instance.root.traverse((object) => { if (object instanceof Bone) bones.push(object); });
      expect(bones.length).toBeGreaterThan(0);
      const initialBones = bones.map((bone) => bone.quaternion.clone());
      const path: number[] = [];
      const bounds = new Box3();
      const projected = new Vector3();
      for (let frame = 0; frame < 900; frame += 1) {
        const time = frame / 30;
        monster.update(time, 1 / 30);
        path.push(monster.root.position.x);
        expect(monster.root.position.y).toBeCloseTo(Math.sin(time) * 0.12 + 0.03);
        if (frame % 30 !== 0) continue;
        monster.root.updateMatrixWorld(true);
        instance.root.traverse((object) => { if (object instanceof SkinnedMesh) object.computeBoundingBox(); });
        bounds.setFromObject(monster.root);
        expect(bounds.min.y).toBeGreaterThan(Math.sin(time) * 0.12 - 0.15);
        for (const x of [bounds.min.x, bounds.max.x]) {
          projected.set(x, (bounds.min.y + bounds.max.y) / 2, bounds.max.z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(0.95);
        }
      }
      expect(Math.min(...path)).toBeLessThan(-0.3);
      expect(Math.max(...path)).toBeGreaterThan(0.3);
      expect(bones.some((bone, index) => !bone.quaternion.equals(initialBones[index]!))).toBe(true);
      monster.stage(42);
      for (let frame = 0; frame < 60; frame += 1) {
        monster.update(frame / 30, 1 / 30);
        expect(monster.root.position.x).toBeCloseTo(path[frame]!);
      }
      monster.stage(91);
      monster.update(0, 1 / 30);
      expect(monster.root.position.x).not.toBeCloseTo(path[0]!);
      const dispose = vi.spyOn(instance, 'dispose');
      monster.dispose();
      monster.dispose();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      monster.dispose();
      models.dispose();
    }
  });
});
