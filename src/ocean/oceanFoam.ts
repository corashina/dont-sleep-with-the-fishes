/** Noise, filaments, and lighting for foam on ocean waves. */
export const OCEAN_FOAM_FUNCTIONS = /* glsl */ `
  const float oceanSurfaceVisibility = 1.0;
  float foamHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float foamNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(foamHash(cell), foamHash(cell + vec2(1.0, 0.0)), f.x),
      mix(foamHash(cell + vec2(0.0, 1.0)), foamHash(cell + vec2(1.0)), f.x), f.y);
  }

  float foamFilament(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    float first = 8.0, second = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 id = cell + offset;
      vec2 seed = vec2(foamHash(id), foamHash(id + vec2(37.1, 91.7)));
      vec2 delta = offset + 0.15 + seed * 0.7 - f;
      float d = dot(delta, delta);
      second = min(second, max(first, d));
      first = min(first, d);
    }
    return sqrt(second) - sqrt(first);
  }

  vec2 foamFlow(vec2 p) {
    vec2 broad = vec2(foamNoise(p * 0.8), foamNoise(p * 0.83 + 17.2));
    vec2 medium = vec2(foamNoise(p * 2.9 + broad), foamNoise(p * 3.1 + broad + 31.4));
    vec2 fine = vec2(foamNoise(p * 9.7 + medium), foamNoise(p * 10.3 + medium + 47.2));
    return p + (broad - 0.5) * 1.3 + (medium - 0.5) * 0.44 + (fine - 0.5) * 0.11;
  }

  vec3 oceanFoamColor(vec3 normal) {
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float facing = max(dot(normal, normalize(uLightDirection)), 0.0);
    return uSkyColor * 0.30 + vec3(0.62, 0.77, 0.84) * daylight * (0.75 + facing * 0.25);
  }

`;
