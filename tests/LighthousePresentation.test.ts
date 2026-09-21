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
