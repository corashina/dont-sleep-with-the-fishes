import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
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
