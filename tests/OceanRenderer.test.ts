import { afterEach, describe, expect, it, vi } from 'vitest';
import { Camera, Frustum, Matrix4, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, type BufferGeometry, type WebGLRenderer } from 'three';
import { OceanCapture } from '../src/ocean/OceanCapture';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';

afterEach(() => vi.restoreAllMocks());

function expectClosedSeams(geometries: readonly BufferGeometry[]): void {
  const boundaries = new Map<string, number>();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index), z = positions.getZ(index);
      if (Math.abs(x) === 1100 || Math.abs(z) === 1100) continue;
      if (x !== bounds.min.x && x !== bounds.max.x && z !== bounds.min.z && z !== bounds.max.z) continue;
      const key = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
      boundaries.set(key, (boundaries.get(key) ?? 0) + 1);
    }
  }
  for (const [point, count] of boundaries) expect(count, point).toBeGreaterThanOrEqual(2);
}

describe('ocean quality resources', () => {
  // Importance: 95/100. Prevent cracks, disappearing storm waves, and quality-switch leaks.
  it.each(['high'] as const)('keeps %s horizon seams closed with fewer, cullable triangles', (quality) => {
    const ocean = new OceanRenderer(quality);
    try {
      const panels = ocean.horizonMeshes;
      expect(panels).toHaveLength(8);
      const geometries = [ocean.mesh.geometry, ...panels.map((panel) => panel.geometry)];
      const triangles = geometries.reduce((sum, geometry) => sum + geometry.index!.count / 3, 0);
      expect(triangles).toBeLessThan(quality === 'high' ? 280_000 : 125_000);
      expect(ocean.mesh.geometry.index!.count / 3).toBe(quality === 'high' ? 165_888 : 73_728);
      expectClosedSeams(geometries);

      ocean.update(12, 1.7, 0);
      ocean.mesh.updateMatrixWorld(true);
      const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 1600);
      camera.position.set(0, 2, 0);
      camera.lookAt(0, 2, -100);
      camera.updateMatrixWorld();
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(
        camera.projectionMatrix, camera.matrixWorldInverse,
      ));
      const visible = panels.filter((panel) => frustum.intersectsObject(panel));
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(panels.length);
      for (const panel of panels) {
        expect(panel.frustumCulled).toBe(true);
        const positions = panel.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 17) {
          const x = positions.getX(index), z = positions.getZ(index);
          const wave = sampleWaveField(DEFAULT_WAVES, 12, x, z, 1.7);
          expect(panel.geometry.boundingSphere!.containsPoint(new Vector3(
            x + wave.displacementX, wave.height, z + wave.displacementZ,
          ))).toBe(true);
        }
      }
      const disposals = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
      ocean.setQuality(quality === 'high' ? 'low' : 'high');
      ocean.dispose();
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
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
      for (const panel of ocean.horizonMeshes) {
        panel.onBeforeRender(renderer, scene, camera, panel.geometry, ocean.material, null!);
      }
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
