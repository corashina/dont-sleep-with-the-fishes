import { Material } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createContactDepthLayer } from '../src/world/ContactDepthLayer';

describe('ContactDepthLayer', () => {
  it('shares one footprint geometry, one seam geometry, and one material', () => {
    const layer = createContactDepthLayer();
    const first = layer.addFootprint({
      name: 'first-footprint',
      position: [1, 0, 2],
      scale: [2, 1, 3],
    });
    const second = layer.addFootprint({
      name: 'second-footprint',
      position: [-1, 0, -2],
      scale: [1, 1, 1],
    });
    const seam = layer.addSeam({
      name: 'wall-seam',
      position: [0, 1, 0],
      scale: [3, 0.02, 0.03],
    });

    expect(first.geometry).toBe(second.geometry);
    expect(first.geometry).not.toBe(seam.geometry);
    expect(first.material).toBe(second.material);
    expect(first.material).toBe(seam.material);
    expect(first.name).toBe('first-footprint');
    expect(first.position.toArray()).toEqual([1, 0, 2]);
    expect(first.scale.toArray()).toEqual([2, 1, 3]);
    expect(layer.root.children).toEqual([first, second, seam]);

    const material = first.material as Material & {
      depthWrite: boolean;
      polygonOffset: boolean;
      polygonOffsetFactor: number;
      polygonOffsetUnits: number;
    };
    expect(material).toMatchObject({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    layer.dispose();
  });

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
