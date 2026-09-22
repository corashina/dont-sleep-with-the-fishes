import { expect, it } from 'vitest';
import {
  BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene,
  ShaderLib, Texture, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer,
} from 'three';
import { FogMonster } from '../src/survival/FogMonster';
import { Skybox } from '../src/world/Skybox';

// Importance: 95/100. The monster must use scene fog and release it when weather changes.
it('binds the monster to the current fog volume and clears it with the scene', () => {
  const scene = new Scene();
  const texture = new Texture();
  const sky = new Skybox(scene, { phase: 'night', weather: 'fog', severity: 0 }, texture);
  const material = new MeshStandardMaterial();
  const geometry = new BoxGeometry(1, 2, 1);
  const mesh = new Mesh(geometry, material);
  const root = new Group();
  root.add(mesh);
  const monster = new FogMonster({ root, dispose: () => {} });
  const camera = new PerspectiveCamera();
  const renderer = {} as WebGLRenderer;
  const shader = {
    uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  } as WebGLProgramParametersWithUniforms;
  const draw = (target: Scene) => material.onBeforeRender(renderer, target, camera, geometry, mesh, null!);
  try {
    material.onBeforeCompile(shader, renderer);
    sky.update(2, { phase: 'night', weather: 'fog', severity: 0 }, new Vector3(0, 1.5, 0));
    draw(scene);
    expect(shader.uniforms.uSeaFogAmount!.value).toBe(1);
    expect(shader.uniforms.uSeaFogTime!.value).toBe(sky.fogTime);
    expect(shader.uniforms.uSeaFogColor!.value).toEqual(sky.palette.fogColor);
    draw(new Scene());
    expect(shader.uniforms.uSeaFogAmount!.value).toBe(0);
    draw(scene);
    expect(shader.uniforms.uSeaFogAmount!.value).toBe(1);
    sky.update(2, { phase: 'night', weather: 'calm', severity: 0 }, new Vector3());
    draw(scene);
    expect(shader.uniforms.uSeaFogAmount!.value).toBe(0);
    sky.dispose();
    draw(scene);
    expect(shader.uniforms.uSeaFogAmount!.value).toBe(0);
  } finally {
    monster.dispose();
    geometry.dispose();
    material.dispose();
    sky.dispose();
    texture.dispose();
  }
});
