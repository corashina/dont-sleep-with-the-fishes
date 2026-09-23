// Importance: 90/100. A finite sky must stay centered for both render cameras.
import { Mesh, PerspectiveCamera, Scene, Texture, Vector3, type Material, type WebGLRenderer } from 'three';
import { expect, it } from 'vitest';
import { Skybox } from '../src/world/Skybox';

it('centers the sky on each render camera, including the reflected view', () => {
  const scene = new Scene();
  const texture = new Texture();
  const sky = new Skybox(scene, { phase: 'day', weather: 'calm', severity: 0 }, texture);
  const mesh = scene.getObjectByName('procedural-skybox') as Mesh;
  const camera = new PerspectiveCamera();
  sky.update(0, { phase: 'day', weather: 'calm', severity: 0 }, new Vector3(3, 8, 12));
  scene.updateMatrixWorld();
  try {
    for (const height of [8, -8, 8]) {
      camera.position.set(3, height, 12);
      camera.updateMatrixWorld();
      mesh.onBeforeRender({} as WebGLRenderer, scene, camera, mesh.geometry, mesh.material as Material, null!);
      expect(new Vector3().setFromMatrixPosition(mesh.matrixWorld)).toEqual(camera.position);
    }
  } finally { sky.dispose(); texture.dispose(); }
});

// Importance: 95/100. Suppress water clouds without removing clouds from the visible sky.
it('hides clouds only for reflection cameras and restores the visible sky', () => {
  const scene = new Scene();
  const texture = new Texture();
  const sky = new Skybox(scene, { phase: 'day', weather: 'calm', severity: 0 }, texture);
  const mesh = scene.getObjectByName('procedural-skybox') as Mesh;
  const camera = new PerspectiveCamera();
  const reflectionCamera = new PerspectiveCamera();
  reflectionCamera.userData.hideSkyClouds = true;
  const material = mesh.material as import('three').ShaderMaterial;
  const draw = (view: PerspectiveCamera) => mesh.onBeforeRender(
    {} as WebGLRenderer, scene, view, mesh.geometry, material, null!,
  );
  try {
    const coverage = sky.palette.cloudCoverage;
    expect(coverage).toBeGreaterThan(0);
    draw(camera);
    expect(material.uniforms.uCloudCoverage!.value).toBe(coverage);
    draw(reflectionCamera);
    expect(material.uniforms.uCloudCoverage!.value).toBe(0);
    draw(camera);
    expect(material.uniforms.uCloudCoverage!.value).toBe(coverage);
  } finally { sky.dispose(); texture.dispose(); }
});
