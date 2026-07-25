import { Material } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createContactDepthLayer } from '../src/world/ContactDepthLayer';

describe('ContactDepthLayer', () => {

  it('disposes shared resources and detaches the root exactly once', () => {
    const layer = createContactDepthLayer();
    const footprint = layer.addFootprint({
      name: 'footprint',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    });
    const seam = layer.addSeam({
      name: 'seam',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    });
    const footprintDispose = vi.spyOn(footprint.geometry, 'dispose');
    const seamDispose = vi.spyOn(seam.geometry, 'dispose');
    const materialDispose = vi.spyOn(footprint.material as Material, 'dispose');

    layer.dispose();
    layer.dispose();

    expect(footprintDispose).toHaveBeenCalledOnce();
    expect(seamDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(layer.root.children).toEqual([]);
  });
});
