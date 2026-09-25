// Importance: 95/100. Keep the stern reveal outside the initial view and restore the camera after interruptions.
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Box3, Frustum, Group, Matrix4, PerspectiveCamera, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CheckBackPresentation } from '../src/survival/CheckBackPresentation';
import { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import { LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, LIFEBOAT_VISIBLE_STERN_BENCH_Z } from '../src/world/Lifeboat';

let models: SurvivalEventModelLibrary;
beforeAll(async () => {
  const bytes = await readFile('src/assets/models/events/anglerFish.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  models = await SurvivalEventModelLibrary.load(['checkBackAnglerfish'], {
    load: async () => (await new GLTFLoader().register(() => ({
      name: 'test-textures', loadTexture: async () => new Texture(),
    })).parseAsync(data, '')).scene,
  });
});
afterAll(() => models?.dispose());

function rig() {
  const world = new Group();
  const boat = new Group();
  boat.position.set(3, 0.2, -2);
  boat.rotation.set(0.04, 0.3, -0.03);
  world.add(boat);
  const camera = new PerspectiveCamera(80, 535 / 575, 0.1, 500);
  camera.position.set(0, 0.88, 0.96);
  boat.add(camera);
  const bench = new Group();
  bench.position.set(0, LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, LIFEBOAT_VISIBLE_STERN_BENCH_Z);
  bench.rotation.y = Math.PI;
  boat.add(bench);
  const anglerfish = models.clone('checkBackAnglerfish');
  const fish = new Group();
  const cue = vi.fn();
  const presentation = new CheckBackPresentation(fish, anglerfish, camera, bench, bench, cue);
  world.add(presentation.root);
  presentation.stage();
  return { presentation, anglerfish, fish, camera, cue };
}

describe('Check the Back presentation', () => {
  it('reveals offscreen, plays its sound, and stays on the stern', async () => {
    const r = rig();
    try {
      const reaction = r.presentation.react('check-the-back.bad');
      expect(r.anglerfish.visible).toBe(false);
      r.presentation.update(0.44, 0.44);
      expect(r.anglerfish.visible).toBe(false);
      r.presentation.update(0.45, 0.01);
      expect(r.anglerfish.visible).toBe(true);
      r.camera.updateWorldMatrix(true, false);
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(
        r.camera.projectionMatrix, r.camera.matrixWorldInverse,
      ));
      expect(frustum.intersectsBox(new Box3().setFromObject(r.anglerfish, true))).toBe(false);
      r.presentation.update(1.79, 1.34);
      expect(r.cue).not.toHaveBeenCalled();
      r.presentation.update(1.81, 0.02);
      expect(r.cue).toHaveBeenCalledExactlyOnceWith({ eventId: 'check-the-back', cue: 'anglerfish' });
      const start = r.anglerfish.getWorldPosition(new Vector3());
      const view = r.camera.quaternion.clone();
      const rotation = r.anglerfish.getWorldQuaternion(r.camera.quaternion.clone());
      for (let frame = 1; frame <= 180; frame += 1) {
        r.presentation.update(1.81 + frame / 60, 1 / 60);
        expect(r.anglerfish.visible).toBe(true);
        expect(r.anglerfish.getWorldPosition(new Vector3()).distanceTo(start)).toBeLessThan(0.001);
        expect(r.anglerfish.getWorldQuaternion(r.camera.quaternion.clone()).angleTo(rotation)).toBeLessThan(0.00001);
        expect(r.camera.quaternion.angleTo(view)).toBeLessThan(0.00001);
      }
      await reaction;
      expect(r.cue).toHaveBeenCalledTimes(1);
    } finally { r.presentation.dispose(); }
  });
  it('restores the camera after interruption and resets the reveal for replay and visibility changes', async () => {
    const r = rig();
    const originalPosition = r.camera.position.clone();
    const originalRotation = r.camera.quaternion.clone();
    try {
      const first = r.presentation.react('check-the-back.bad');
      const start = r.anglerfish.getWorldPosition(new Vector3());
      r.presentation.update(4.1, 4.1);
      r.presentation.clear();
      await first;
      expect(r.camera.position.distanceTo(originalPosition)).toBeLessThan(0.00001);
      expect(r.camera.quaternion.angleTo(originalRotation)).toBeLessThan(0.00001);
      expect(r.anglerfish.visible).toBe(false);
      r.presentation.stage();
      const second = r.presentation.react('check-the-back.bad');
      expect(r.anglerfish.getWorldPosition(new Vector3()).distanceTo(start)).toBeLessThan(0.001);
      r.presentation.update(4.1, 4.1);
      r.presentation.settleForVisibilityChange();
      await second;
      r.presentation.update(5, 1);
      expect(r.anglerfish.getWorldPosition(new Vector3()).distanceTo(start)).toBeLessThan(0.001);
      expect(r.anglerfish.visible).toBe(true);
      expect(r.cue).toHaveBeenCalledTimes(2);
    } finally { r.presentation.dispose(); }
  });
});
