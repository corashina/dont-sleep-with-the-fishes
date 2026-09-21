import { Group, PerspectiveCamera } from 'three';
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
  presentation.stage({ eventId: 'starry-night', targetInstanceId: null, variantSeed: 7 });
  return { presentation, camera, position, quaternion };
}

describe('Starry Night presentation', () => {
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
