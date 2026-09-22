import { Color, ShaderChunk, Vector3, type IUniform, type MeshStandardMaterial, type Scene } from 'three';
import { seaFogShader } from './seaFogShader';

// Scene ownership prevents previews and water reflection renders from sharing weather state.
export const sceneSeaFogUniforms = new WeakMap<Scene, Record<string, IUniform>>();

/** Apply the sky and water volume to an opaque or transparent standard material. */
export function applySeaFogMaterial(material: MeshStandardMaterial): void {
  const uniforms = {
    uSeaFogAmount: { value: 0 },
    uSeaFogTime: { value: 0 },
    uSeaFogColor: { value: new Color() },
    uSeaFogLightColor: { value: new Color() },
    uSeaFogLightDirection: { value: new Vector3() },
  };
  const beforeCompile = material.onBeforeCompile;
  const beforeRender = material.onBeforeRender;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => cacheKey + ':sea-fog';
  material.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
    beforeRender.call(this, renderer, scene, camera, geometry, object, group);
    const sky = sceneSeaFogUniforms.get(scene);
    uniforms.uSeaFogAmount.value = sky?.uFogVolume?.value ?? 0;
    if (!sky || uniforms.uSeaFogAmount.value <= 0) return;
    uniforms.uSeaFogTime.value = sky.uFogTime!.value;
    uniforms.uSeaFogColor.value.copy(sky.uFogColor!.value);
    const moon = sky.uMoonVisibility!.value as number;
    const sun = sky.uSunVisibility!.value as number;
    const light = uniforms.uSeaFogLightColor.value;
    const sunColor = sky.uSunColor!.value as Color;
    light.copy(sky.uMoonColor!.value).multiplyScalar(moon);
    light.r += sunColor.r * sun;
    light.g += sunColor.g * sun;
    light.b += sunColor.b * sun;
    uniforms.uSeaFogLightDirection.value.copy(sky[moon > 0 ? 'uMoonDirection' : 'uSunDirection']!.value);
  };
  material.onBeforeCompile = function (shader, renderer) {
    beforeCompile.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform float uSeaFogAmount;
      uniform float uSeaFogTime;
      uniform vec3 uSeaFogColor;
      uniform vec3 uSeaFogLightColor;
      uniform vec3 uSeaFogLightDirection;
      ${seaFogShader}
    `).replace('#include <opaque_fragment>', `
      #include <opaque_fragment>
      if (uSeaFogAmount > 0.001) {
        float fogDistance = length(vViewPosition);
        vec3 fogDirection = (-vViewPosition / max(fogDistance, 0.001)) * mat3(viewMatrix);
        vec4 fog = seaFog(cameraPosition, fogDirection, fogDistance, uSeaFogTime,
          uSeaFogColor, uSeaFogLightColor, uSeaFogLightDirection);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * fog.a + fog.rgb, uSeaFogAmount);
      }
    `).replace('#include <fog_fragment>', ShaderChunk.fog_fragment.replace(
      'fogColor, fogFactor', 'fogColor, fogFactor * (1.0 - uSeaFogAmount)',
    ));
  };
  material.needsUpdate = true;
}
