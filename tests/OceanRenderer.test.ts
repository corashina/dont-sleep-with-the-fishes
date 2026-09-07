import { afterEach, describe, expect, it, vi } from 'vitest';
import { Camera, MeshBasicMaterial, Scene, type WebGLRenderer } from 'three';
import { OceanCapture } from '../src/ocean/OceanCapture';
import { OceanFoam } from '../src/ocean/OceanFoam';
import { OceanRenderer } from '../src/ocean/OceanRenderer';

afterEach(() => vi.restoreAllMocks());

describe('ocean quality resources', () => {
  it('allocates High resources only for High and releases them when switching to Low', () => {
    const captureDispose = vi.spyOn(OceanCapture.prototype, 'dispose');
    const foamDispose = vi.spyOn(OceanFoam.prototype, 'dispose');
    const ocean = new OceanRenderer('low');
    const uniforms = ocean.material.uniforms;
    expect(uniforms.uWaterColor!.value).toBeNull();
    ocean.setQuality('high');
    const firstTexture = uniforms.uWaterColor!.value;
    expect(firstTexture.isTexture).toBe(true);
    ocean.setQuality('high');
    expect(uniforms.uWaterColor!.value).toBe(firstTexture);
    ocean.setQuality('low');
    expect(captureDispose).toHaveBeenCalledTimes(1);
    expect(foamDispose).toHaveBeenCalledTimes(1);
    expect(uniforms.uWaterColor!.value).toBeNull();
    expect(uniforms.uWaterReady!.value).toBe(0);
    ocean.setQuality('high');
    expect(uniforms.uWaterColor!.value).not.toBe(firstTexture);
    ocean.dispose();
    ocean.dispose();
    expect(captureDispose).toHaveBeenCalledTimes(2);
    expect(foamDispose).toHaveBeenCalledTimes(2);
  });

  it('prepares once per update and camera, and skips depth and outline draws', () => {
    const capture = vi.spyOn(OceanCapture.prototype, 'update').mockImplementation(() => {});
    const foam = vi.spyOn(OceanFoam.prototype, 'update').mockImplementation(() => {});
    const ocean = new OceanRenderer('high');
    const scene = new Scene();
    const camera = new Camera();
    const renderer = {} as WebGLRenderer;
    const override = new MeshBasicMaterial();
    const draw = (material = ocean.material) => ocean.mesh.onBeforeRender(
      renderer, scene, camera, ocean.mesh.geometry, material, null!,
    );
    try {
      scene.overrideMaterial = override;
      draw();
      expect(capture).not.toHaveBeenCalled();
      scene.overrideMaterial = null;
      ocean.mesh.onBeforeRender(renderer, scene, camera, ocean.mesh.geometry, override, null!);
      expect(capture).not.toHaveBeenCalled();
      ocean.update(1, 1, 0.01);
      draw();
      draw();
      ocean.horizonMesh.onBeforeRender(renderer, scene, camera, ocean.horizonMesh.geometry, ocean.material, null!);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(foam).toHaveBeenCalledTimes(1);
      expect(ocean.material.uniforms.uWaterReady!.value).toBe(1);
      ocean.update(1.016, 1, 0.01);
      draw();
      expect(capture).toHaveBeenCalledTimes(2);
      ocean.mesh.onBeforeRender(renderer, scene, new Camera(), ocean.mesh.geometry, ocean.material, null!);
      expect(capture).toHaveBeenCalledTimes(3);
    } finally {
      ocean.dispose();
      override.dispose();
    }
  });

  it('can retry preparation after a capture error', () => {
    vi.spyOn(OceanFoam.prototype, 'update').mockImplementation(() => {});
    const capture = vi.spyOn(OceanCapture.prototype, 'update')
      .mockImplementationOnce(() => { throw new Error('capture failed'); })
      .mockImplementation(() => {});
    const ocean = new OceanRenderer('high');
    const scene = new Scene();
    const camera = new Camera();
    const draw = () => ocean.mesh.onBeforeRender(
      {} as WebGLRenderer, scene, camera, ocean.mesh.geometry, ocean.material, null!,
    );
    try {
      expect(draw).toThrow('capture failed');
      expect(ocean.material.uniforms.uWaterReady!.value).toBe(0);
      draw();
      expect(capture).toHaveBeenCalledTimes(2);
      expect(ocean.material.uniforms.uWaterReady!.value).toBe(1);
    } finally {
      ocean.dispose();
    }
  });
});
