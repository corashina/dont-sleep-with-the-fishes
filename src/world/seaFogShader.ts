/** Shared world-space extinction and scattering for water, sky, and scene materials. */
export const seaFogShader = /* glsl */`
  float seaFogHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float seaFogNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
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
      marchLength = min(marchLength, max(0.0, (12.0 - origin.y) / direction.y));
    }
    float transmission = 1.0;
    vec3 scattering = vec3(0.0);
    vec3 drift = vec3(time * 0.16, 0.0, time * 0.055);
    // A forward scattering lobe gives the sun and moon a soft glow through the banks.
    float lightCosine = clamp(dot(direction, lightDirection), -1.0, 1.0);
    float phase = 0.6975 / pow(1.3025 - 1.1 * lightCosine, 1.5);
    float previousDistance = 0.0;
    // More samples close to the viewer preserve wisps and avoid a flat fog boundary.
    for (int i = 0; i < 24; i++) {
      float fraction = float(i + 1) / 24.0;
      float endDistance = marchLength * fraction * fraction;
      float stepLength = endDistance - previousDistance;
      float distanceAlongRay = previousDistance + stepLength * 0.5;
      previousDistance = endDistance;
      vec3 position = origin + direction * distanceAlongRay;
      vec3 flow = position - drift;
      float bank = seaFogNoise(flow * vec3(0.065, 0.14, 0.065));
      float wisp = seaFogNoise(flow * vec3(0.3, 0.42, 0.3) + bank * 1.3);
      // Broad rolling banks have a gradual vertical tail, never a clipped top plane.
      float bankHeight = 0.45 + bank * 1.1;
      float heightAboveBank = max(position.y - bankHeight, 0.0);
      float seaLayer = exp(-pow(heightAboveBank / 0.95, 1.6));
      float bankDensity = mix(0.65, 1.25, smoothstep(0.2, 0.8, bank))
        * mix(0.78, 1.18, wisp);
      float upperHaze = 0.004 * exp(-max(position.y, 0.0) * 0.4);
      float extinction = (0.22 * seaLayer * bankDensity + upperHaze)
        * smoothstep(0.8, 4.0, distanceAlongRay);
      float stepTransmission = exp(-extinction * stepLength);
      // Approximate the fog column above each sample without another noise march.
      float lightAccess = exp(-seaLayer * bankDensity * 0.8);
      vec3 source = fogColor * mix(0.68, 1.0, lightAccess)
        + lightColor * (0.015 + phase * 0.045) * lightAccess;
      scattering += transmission * (1.0 - stepTransmission) * source;
      transmission *= stepTransmission;
      if (transmission < 0.003) break;
    }
    return vec4(scattering, transmission);
  }
`;
