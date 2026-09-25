// Importance: 95/100. The real animated mesh must stay outside the bow before the bite.
import { readFile } from 'node:fs/promises';
import { Box3, Group, Matrix4, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { FogMonster } from '../src/survival/FogMonster';

it('keeps the production mesh outside the bow throughout the approach and windup', async () => {
  const bytes = await readFile('src/assets/models/events/fogMonster.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const models = await EventModelLibrary.load(['fogMonster'], {
    load: async () => {
      const gltf = await new GLTFLoader().register(() => ({
        name: 'test-materials', loadMaterial: async () => new MeshStandardMaterial(),
      })).parseAsync(data, '');
      gltf.scene.animations = gltf.animations;
      return gltf.scene;
    },
  });
  const world = new Group();
  const boat = new Group();
  world.add(boat);
  const monster = new FogMonster(models.create('fogMonster'), new PerspectiveCamera(80, 16 / 9), undefined, boat);
  world.add(monster.root);
  const bounds = new Box3();
  const inverse = new Matrix4();
  try {
    for (const roll of [0, 0.08]) {
      boat.rotation.set(0.035, 0.05, roll);
      boat.position.y = 0.15;
      boat.updateWorldMatrix(true, false);
      inverse.copy(boat.matrixWorld).invert();
      for (const seed of [19, 42]) {
        monster.stage(seed);
        monster.beginAttack();
        let furthest = -Infinity;
        let worstTime = 0;
        for (let frame = 0; frame < 240; frame++) {
          const time = frame / 60;
          monster.updateAttack(time, time / 5);
          world.updateMatrixWorld(true);
          bounds.setFromObject(monster.root, true).applyMatrix4(inverse);
          if (bounds.max.z > furthest) { furthest = bounds.max.z; worstTime = time; }
        }
        expect(furthest, `seed ${seed}, roll ${roll}, time ${worstTime}`).toBeLessThanOrEqual(-3 + 0.001);
      }
    }
  } finally { monster.dispose(); models.dispose(); }
});
