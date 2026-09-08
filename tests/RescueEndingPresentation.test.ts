import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { RescueEndingPresentation } from '../src/survival/RescueEndingPresentation';

function setup() {
  const boat = new Group();
  const geometry = new BoxGeometry(4, 6, 12);
  const material = new MeshStandardMaterial();
  boat.add(new Mesh(geometry, material));
  const camera = new PerspectiveCamera();
  camera.position.set(0, 1.4, 1.5);
  camera.lookAt(0, 0, -3);
  const fade = vi.fn();
  const presentation = new RescueEndingPresentation(boat, camera, fade);
  return { boat, camera, fade, presentation, dispose() {
    presentation.dispose(); geometry.dispose(); material.dispose();
  } };
}

describe('rescue ending presentation', () => {
  it('waits before turning, approaches, then fades only after the boat arrives', async () => {
    const test = setup();
    try {
      const start = test.camera.quaternion.clone();
      const finished = vi.fn();
      void test.presentation.finished.then(finished);
      test.presentation.update(0.5, 0.5, 1);
      expect(test.camera.quaternion.angleTo(start)).toBeCloseTo(0);
      expect(test.fade).toHaveBeenLastCalledWith(0);
      test.presentation.update(2, 2.5, 1);
      expect(test.camera.getWorldDirection(new Vector3()).x).toBeGreaterThan(0.8);
      expect(test.boat.position.x).toBeGreaterThan(11);
      test.presentation.update(4.2, 6.7, 1);
      expect(test.boat.position.x).toBeCloseTo(11);
      expect(test.fade).toHaveBeenLastCalledWith(0);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      test.presentation.update(1.55, 8.25, 1);
      expect(test.fade).toHaveBeenLastCalledWith(0.5);
      test.presentation.update(0.75, 9, 1);
      await test.presentation.finished;
      expect(test.fade).toHaveBeenLastCalledWith(1);
      expect(finished).toHaveBeenCalledOnce();
    } finally { test.dispose(); }
  });

  it('keeps timing fixed during a pause and settles on disposal', async () => {
    const test = setup();
    test.presentation.update(3, 3, 1);
    const position = test.boat.position.clone();
    test.presentation.update(0, 3, 1);
    expect(test.boat.position).toEqual(position);
    test.dispose();
    await expect(test.presentation.finished).resolves.toBeUndefined();
  });
});
