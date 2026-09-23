import { Box3, Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { StarryNightPresentation } from '../src/survival/events/StarryNightPresentation';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';

function setup(aspect = 16/9) {
  const camera = new PerspectiveCamera(80, aspect, 0.1, 1000);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const presentation = new StarryNightPresentation({ camera } as DedicatedEventEnvironment);
  new Group().add(presentation.worldRoot, presentation.boatRoot);
  presentation.stage({ eventId: 'starry-night', targetInstanceId: null, variantSeed: 7,
    constellationItems: ['ductTape', 'map'] });
  return { presentation, camera, position, quaternion };
}

describe('Starry Night presentation', () => {
  // Importance: 95/100. Each reward must have a separate, visible sky target.
  it.each([16/9, 1, 9/16])('shows two separate shapes at aspect %s without moving the camera', (aspect) => {
    const { presentation, camera, position, quaternion } = setup(aspect);
    presentation.reveal();
    presentation.skip();
    presentation.worldRoot.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const targets = presentation.interactionTargets();
    expect(targets.map(({ choiceId }) => choiceId)).toEqual(['ductTape', 'map']);
    const bounds = targets.map(({ root }) => new Box3().setFromObject(root));
    for (let index = 0; index < bounds.length; index++) {
      const boundsBox = bounds[index]!;
      for (const point of [boundsBox.min, boundsBox.max]) {
        const projected = point.clone().project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(1);
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
      expect(boundsBox.getSize(new Vector3()).length()).toBeGreaterThan(20);
      for (let other = index + 1; other < bounds.length; other++) {
        expect(boundsBox.intersectsBox(bounds[other]!)).toBe(false);
      }
    }
    expect(camera.position).toEqual(position);
    expect(camera.quaternion.equals(quaternion)).toBe(true);
    presentation.dispose();
  });

  it('cancels a reveal and disposes each owned mesh once', async () => {
    const { presentation } = setup();
    const target = presentation.interactionTargets()[0]!.root;
    const mesh = target.children[0] as import('three').Mesh;
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    const reveal = presentation.reveal();
    presentation.dispose();
    presentation.dispose();
    await reveal;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(presentation.worldRoot.children).toHaveLength(0);
  });
});
