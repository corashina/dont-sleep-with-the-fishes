import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Bone, SkinnedMesh, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SharkSwarmPresentation } from '../src/survival/events/SharkSwarmPresentation';

async function loadSharks(): Promise<EventModelLibrary> {
  const bytes = await readFile(resolve('src/assets/models/events/shark.glb'));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return EventModelLibrary.load(['shark'], {
    load: async () => {
      const loader = new GLTFLoader().register(() => ({
        name: 'test-textures',
        loadTexture: async () => new Texture(),
      }));
      const { scene, animations } = await loader.parseAsync(data, '');
      scene.animations = animations;
      return scene;
    },
  });
}

describe('SharkSwarmPresentation', () => {
  it('swims with independent production skeletons and resets seeded animation phases', async () => {
    const eventModels = await loadSharks();
    const presentation = new SharkSwarmPresentation({
      eventModels,
      readWorldWaveAmplitudeScale: () => 0,
      sampleWorldWaveInto: () => {},
    } as never);
    const context = { eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 } as const;
    try {
      presentation.stage(context);
      presentation.reveal();
      presentation.skip();
      const sharks = presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'));
      expect(sharks).toHaveLength(5);
      const tails = sharks.map((shark) => shark.getObjectByName('Tail4') as Bone);
      const start = tails.map((tail) => tail.quaternion.clone());
      expect(new Set(tails).size).toBe(5);
      expect(start.some((pose) => !pose.equals(start[0]!))).toBe(true);
      for (const shark of sharks) {
        const meshes: SkinnedMesh[] = [];
        shark.traverse((object) => { if (object instanceof SkinnedMesh) meshes.push(object); });
        expect(meshes.length).toBeGreaterThan(0);
        expect(shark.getObjectByName('Head')).toBeInstanceOf(Bone);
      }
      presentation.update(0.24, 0.24);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(start[index]!)).toBe(false));
      const paused = tails.map((tail) => tail.quaternion.clone());
      presentation.clear();
      presentation.update(1, 0.5);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(paused[index]!)).toBe(true));
      presentation.stage(context);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(start[index]!)).toBe(true));
      const skeletonDisposals: ReturnType<typeof vi.spyOn>[] = [];
      sharks.forEach((shark) => shark.traverse((object) => {
        if (object instanceof SkinnedMesh) skeletonDisposals.push(vi.spyOn(object.skeleton, 'dispose'));
      }));
      presentation.dispose();
      skeletonDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    } finally {
      presentation.dispose();
      eventModels.dispose();
    }
  });
});
