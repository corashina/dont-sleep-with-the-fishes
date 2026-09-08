import type { MeshStandardMaterial } from 'three';

/** A thin, uneven water film. Reuses scene lights without reflection renders. */
export function applyShipWetSurface(material: MeshStandardMaterial, strength: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.shipWetStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vShipSurfaceUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvShipSurfaceUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        varying vec2 vShipSurfaceUv;
        uniform float shipWetStrength;
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        // Broad damp patches and narrow runoff follow the authored surface UVs.
        float dampPatch = sin(vShipSurfaceUv.x * 1.7 + sin(vShipSurfaceUv.y * 2.3))
          * sin(vShipSurfaceUv.y * 0.9 + vShipSurfaceUv.x * 0.6);
        float runoff = pow(0.5 + 0.5 * sin(vShipSurfaceUv.x * 19.0
          + sin(vShipSurfaceUv.y * 0.7)), 8.0);
        float shipWetness = shipWetStrength * clamp(
          0.35 + 0.6 * smoothstep(-0.5, 0.65, dampPatch) + runoff * 0.2, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.68, shipWetness);
        roughnessFactor = mix(roughnessFactor, max(0.12, roughnessFactor * 0.22), shipWetness);
      `)
      .replace('#include <lights_fragment_maps>', `
        #include <lights_fragment_maps>
        #if NUM_HEMI_LIGHTS > 0 && defined(RE_IndirectSpecular)
          vec3 wetReflection = reflect(-geometryViewDir, geometryNormal);
          vec3 wetWorldReflection = inverseTransformDirection(wetReflection, viewMatrix);
          float clouds = sin(wetWorldReflection.x * 11.0 + wetWorldReflection.z * 7.0)
            * sin(wetWorldReflection.z * 13.0 - wetWorldReflection.y * 5.0);
          float skySheen = mix(0.4, 1.2, smoothstep(-0.15, 0.65, clouds));
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
            float skyWeight = smoothstep(-0.04, 0.35,
              dot(wetReflection, hemisphereLights[i].direction));
            radiance += mix(hemisphereLights[i].groundColor,
              hemisphereLights[i].skyColor * skySheen, skyWeight) * shipWetness * 0.65;
          }
        #endif
      `);
  };
  material.customProgramCacheKey = () => 'dorothy-wet-surface-v1';
}
