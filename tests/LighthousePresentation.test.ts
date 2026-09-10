import { BoxGeometry,Group,Mesh,MeshStandardMaterial,PerspectiveCamera } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { LighthousePresentation } from '../src/survival/LighthousePresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';

function setup() {
  const model = new Group();
  const geometry = new BoxGeometry(4, 24, 4);
  const material = new MeshStandardMaterial();
  model.add(new Mesh(geometry, material));
  const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(0, 2, 0);
  const presentation = new LighthousePresentation({
    camera, propModels: { createEventModel: () => ({ root: model }) },
  } as unknown as FocusedEventPresentationDependencies);
  return { presentation, camera, geometry, material };
}

describe('lighthouse presentation', () => {

  it('leaves camera control with the player through reveal, visibility changes, and clear', async () => {
    const { presentation, camera } = setup();
    const initial = camera.quaternion.clone();
    const position = camera.position.clone();
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.update(1, 1);
    presentation.settleForVisibilityChange();
    await reveal;
    expect(camera.quaternion.equals(initial)).toBe(true);
    expect(camera.position.equals(position)).toBe(true);
    camera.rotation.y = 0.7;
    camera.position.x = 2;
    const playerRotation = camera.quaternion.clone();
    const playerPosition = camera.position.clone();
    presentation.update(2, 1);
    presentation.clear();
    expect(camera.quaternion.equals(playerRotation)).toBe(true);
    expect(camera.position.equals(playerPosition)).toBe(true);
    expect(presentation.root.visible).toBe(false);
    presentation.dispose();
  });

  it('cancels pending animation and releases model resources once', async () => {
    const { presentation, geometry, material } = setup();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.dispose();
    presentation.dispose();
    await reveal;
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
