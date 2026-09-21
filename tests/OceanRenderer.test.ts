import { afterEach, describe, expect, it, vi } from 'vitest';
import { Camera, Color, MeshBasicMaterial, Scene, type WebGLRenderer } from 'three';
import { OceanCapture } from '../src/ocean/OceanCapture';
import { OceanRenderer } from '../src/ocean/OceanRenderer';

afterEach(() => vi.restoreAllMocks());

describe('ocean quality resources', () => {
  it('covers distant water with weather fog in both qualities and clears it afterward', () => {
    const ocean = new OceanRenderer('high');
    const atmosphere = {
      phase: 'night' as const, denseFog: true,
      fogColor: new Color(0x34454a), horizonColor: new Color(0x34454a),
      skyColor: new Color(0x26373d), sunColor: new Color(0xc3ced2), sunVisibility: 0,
    };
    try {
      for (const quality of ['high', 'low', 'high'] as const) {
        ocean.setQuality(quality);
        ocean.update(1, 0.65, 0.1, atmosphere);
        const uniforms = ocean.material.uniforms;
        expect(uniforms.uFogDensity!.value).toBe(0.1);
        expect(uniforms.uFogColor!.value).toEqual(atmosphere.fogColor);
        expect(uniforms.uHorizonFog!.value.z).toBe(1);
        expect(uniforms.uHorizonColor!.value).toEqual(atmosphere.fogColor);
      }
      atmosphere.denseFog = false;
      ocean.update(2, 1, 0.01, atmosphere);
      expect(ocean.material.uniforms.uHorizonFog!.value.z).toBeLessThan(1);
      expect(ocean.material.uniforms.uFogDensity!.value).toBeLessThan(0.02);
    } finally {
      ocean.dispose();
    }
  });

  it('allocates High resources only for High and releases them when switching to Low', () => {
    const captureDispose = vi.spyOn(OceanCapture.prototype, 'dispose');
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
    expect(uniforms.uWaterColor!.value).toBeNull();
    expect(uniforms.uWaterReady!.value).toBe(0);
    ocean.setQuality('high');
    expect(uniforms.uWaterColor!.value).not.toBe(firstTexture);
    ocean.dispose();
    ocean.dispose();
    expect(captureDispose).toHaveBeenCalledTimes(2);
  });

  it('prepares once per update and camera, and skips depth and outline draws', () => {
    const capture = vi.spyOn(OceanCapture.prototype, 'update').mockImplementation(() => {});
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
