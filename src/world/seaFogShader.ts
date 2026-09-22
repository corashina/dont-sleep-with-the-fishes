/** Shared world-space integration keeps sea fog continuous across water and sky. */
export const seaFogShader = /* glsl */`
  float seaFogHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float seaFogNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(seaFogHash(cell), seaFogHash(cell + vec3(1, 0, 0)), f.x),
          mix(seaFogHash(cell + vec3(0, 1, 0)), seaFogHash(cell + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(seaFogHash(cell + vec3(0, 0, 1)), seaFogHash(cell + vec3(1, 0, 1)), f.x),
          mix(seaFogHash(cell + vec3(0, 1, 1)), seaFogHash(cell + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  // RGB is accumulated in-scattered light; alpha is the remaining transmission.
  vec4 seaFog(vec3 origin, vec3 direction, float distanceToSurface, float time,
              vec3 fogColor, vec3 lightColor, vec3 lightDirection) {
    float marchLength = min(distanceToSurface, 110.0);
    if (direction.y > 0.001) {
      marchLength = min(marchLength, max(0.0, (18.0 - origin.y) / direction.y));
    }
    float transmission = 1.0;
    vec3 scattering = vec3(0.0);
    vec3 drift = vec3(time * 0.19, 0.0, time * 0.075);
    float forwardLight = pow(max(dot(direction, lightDirection), 0.0), 12.0);
    float previousDistance = 0.0;
    // Quadratic spacing resolves nearby wisps without spending samples on hidden water.
    for (int i = 0; i < 16; i++) {
      float fraction = float(i + 1) / 16.0;
      float endDistance = marchLength * fraction * fraction;
      float stepLength = endDistance - previousDistance;
      float distanceAlongRay = previousDistance + stepLength * 0.5;
      previousDistance = endDistance;
      vec3 position = origin + direction * distanceAlongRay;
      vec3 flow = position - drift;
      float bank = seaFogNoise(flow * vec3(0.085, 0.19, 0.085));
      float wisp = seaFogNoise(flow * vec3(0.42, 0.55, 0.42) + bank * 1.7);
      float heightDensity = exp(-max(position.y - 0.6, 0.0) * 0.48);
      float density = (0.28 + smoothstep(0.24, 0.78, bank) * 1.5)
        * mix(0.62, 1.25, wisp) * heightDensity;
      float lowBank = 1.0 + 0.8 * (1.0 - smoothstep(0.5, 3.5, position.y));
      float extinction = density * lowBank * 0.24 * smoothstep(1.5, 7.0, distanceAlongRay);
      float stepTransmission = exp(-extinction * stepLength);
      float lightAccess = exp(-density * 0.85);
      vec3 source = fogColor * mix(0.64, 1.12, lightAccess)
        + lightColor * (0.025 + forwardLight * 0.16) * lightAccess;
      scattering += transmission * (1.0 - stepTransmission) * source;
      transmission *= stepTransmission;
      if (transmission < 0.003) break;
    }
    return vec4(scattering, transmission);
  }
`;
