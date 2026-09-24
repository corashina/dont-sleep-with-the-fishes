/* Shared displaced geometry. Wave uniforms and MODULATED_WAVE_GLSL precede this block. */
export const OCEAN_SURFACE_SAMPLING_GLSL = /* glsl */ `
  vec3 oceanGeometryPosition(vec2 worldXZ, vec3 viewer) {
    vec3 displaced = vec3(worldXZ.x, 0.0, worldXZ.y);
    float geometryLod = smoothstep(
      55.0,
      140.0,
      length(viewer - vec3(worldXZ.x, 0.0, worldXZ.y))
    );
    float height = 0.0;
    for (int i = 0; i < 4; i++) {
      float wavelength = uParameters[i].y;
      float resolvedGeometryWave = smoothstep(4.0, 11.0, wavelength);
      float geometryWeight = mix(1.0, resolvedGeometryWave, geometryLod);
      OceanWaveSample wave = sampleOceanWave(i, worldXZ);
      height += wave.height * geometryWeight;
      displaced.xz += wave.displacement * geometryWeight;
    }
    if (uVortexStrength != 0.0) {
      vec2 vortexDelta = worldXZ - uVortexCenter;
      float vortexDistance = length(vortexDelta);
      float vortexRadius = max(0.001, uVortexRadius);
      float envelopeT = clamp(1.0 - vortexDistance / vortexRadius, 0.0, 1.0);
      float envelope = envelopeT * envelopeT * (3.0 - 2.0 * envelopeT) * uVortexStrength;
      float inverseDistance = vortexDistance > 0.0001 ? 1.0 / vortexDistance : 0.0;
      vec2 radial = vortexDelta * inverseDistance;
      float swirl = 0.78 + 0.22 * sin(uVortexPhase + vortexDistance * 0.65);
      height -= uVortexDepression * envelope;
      displaced.x += -radial.y * uVortexTangentStrength * envelope * swirl;
      displaced.z += radial.x * uVortexTangentStrength * envelope * swirl;
    }
    displaced.y += height;
    return displaced;
  }

`;
