/** Surface foam shared by both water qualities. Coordinates stay anchored to the sea. */
export const OCEAN_FOAM_FUNCTIONS = /* glsl */ `
  float foamHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float foamNoise(vec2 p, float footprint) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float value = mix(
      mix(foamHash(cell), foamHash(cell + vec2(1.0, 0.0)), f.x),
      mix(foamHash(cell + vec2(0.0, 1.0)), foamHash(cell + vec2(1.0)), f.x), f.y);
    // Unresolved pores become their average coverage, without sparkling at distance.
    return mix(value, 0.5, smoothstep(0.45, 1.3, footprint));
  }


  // A porous film, not individual bubble particles. Small holes merge as they
  // become subpixel so the distant foam retains a stable average density.
  float foamPores(vec2 p, float footprint) {
    vec2 cell = floor(p);
    vec2 point = fract(p);
    float nearest = 2.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 id = cell + offset;
        vec2 center = vec2(foamHash(id), foamHash(id + 71.3));
        vec2 delta = offset + center - point;
        nearest = min(nearest, dot(delta, delta));
      }
    }
    float walls = smoothstep(0.028, 0.16, nearest);
    return mix(walls, 0.66, smoothstep(0.30, 0.95, footprint));
  }

  // Signed distance approximation to the same straight sides and elliptical ends
  // used by the water exclusion. Works with asymmetric bow/stern profiles.
  float foamHullDistance(vec2 p, vec4 bounds, vec2 taperStarts) {
    float halfWidth = max((bounds.y - bounds.x) * 0.5, 0.001);
    float x = abs(p.x - (bounds.x + bounds.y) * 0.5);
    float end = p.y < taperStarts.x ? taperStarts.x : taperStarts.y;
    float span = p.y < taperStarts.x ? end - bounds.z : bounds.w - end;
    float along = abs(p.y - end);
    if (p.y >= taperStarts.x && p.y <= taperStarts.y) return x - halfWidth;
    if (span < 0.001) {
      vec2 delta = vec2(x - halfWidth, along);
      return length(max(delta, 0.0)) + min(max(delta.x, delta.y), 0.0);
    }
    vec2 q = vec2(x / halfWidth, along / span);
    float radius = length(q);
    float gradient = length(q / vec2(halfWidth, span));
    return (radius - 1.0) * radius / max(gradient, 0.001);
  }

  float hullFoamSource(vec3 local, vec4 bounds, vec2 taperStarts, float minY, float maxY) {
    float distanceToHull = max(0.0, foamHullDistance(local.xz, bounds, taperStarts));
    float contact = smoothstep(minY - 0.16, minY + 0.08, local.y)
      * (1.0 - smoothstep(maxY - 0.04, maxY + 0.14, local.y));
    float surge = 0.5 + 0.5 * sin(local.z * 1.9 + local.x * 0.8 - uTime * 1.3);
    float width = mix(0.26, 0.56, surge) * clamp(uAmplitudeScale, 0.65, 1.45);
    float fringe = 1.0 - smoothstep(width * 0.25, width + 0.18, distanceToHull);
    return fringe * contact * mix(0.63, 1.0, surge);
  }

  vec3 applyOceanFoam(vec3 water, vec3 normal, float height, float compression, float hullSource) {
    float weather = smoothstep(0.68, 1.5, uAmplitudeScale);
    float crestSource = smoothstep(mix(0.26, 0.14, weather), mix(0.43, 0.34, weather), compression)
      * smoothstep(0.04, 0.56, height);
    float source = max(crestSource, hullSource);
    float distanceFade = 1.0 - smoothstep(45.0, 155.0, vViewDepth);

    // Derivatives must be evaluated before the sparse-foam branch.
    float footprint = max(length(dFdx(vOceanPosition)), length(dFdy(vOceanPosition)));
    if (source < 0.025 || distanceFade <= 0.0) return water;

    // Stretch broad patches along crests; keep the small pores irregular.
    vec2 wind = normalize(uDirections[0]);
    vec2 across = vec2(-wind.y, wind.x);
    vec2 drift = vOceanPosition - wind * uTime * 0.14;
    vec2 p = vec2(dot(drift, wind), dot(drift, across));
    vec2 warp = vec2(foamNoise(p * 0.8, footprint * 0.8), foamNoise(p * 0.8 + 17.3, footprint * 0.8)) - 0.5;
    p += warp * 0.65;
    float islands = foamNoise(p * vec2(2.8, 1.1), footprint * 2.8);
    float grain = foamNoise(p * 8.5 + 9.1, footprint * 8.5);
    float pores = foamNoise(p * 23.0 - 4.7, footprint * 23.0);
    #ifdef HIGH_QUALITY_WATER
      float fine = foamNoise(p * 61.0 + 23.8, footprint * 61.0);
      pores = mix(pores, fine, 0.26);
    #endif
    float structure = islands * 0.49 + grain * 0.33 + pores * 0.18;
    float edge = 0.73 - source * 0.34;
    float feather = clamp(footprint * 1.5, 0.045, 0.16);
    float coverage = smoothstep(edge - feather, edge + feather, structure);
    // Dark pinholes remain within thicker froth; thin margins dissolve into lace.
    float holes = smoothstep(0.23, 0.57, pores);
    #ifdef HIGH_QUALITY_WATER
      holes *= mix(0.25, 1.0, foamPores(p * 18.0, footprint * 18.0));
    #endif
    float density = coverage * mix(0.56, 0.98, source) * holes * distanceFade;
    density *= smoothstep(0.015, 0.10, source);

    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float facing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 foamLight = uSkyColor * 0.65
      + uSunColor * daylight * (0.18 + facing * 0.27);
    vec3 foamColor = foamLight * mix(vec3(0.66, 0.80, 0.79), vec3(0.96, 0.98, 0.93),
      clamp(source * 0.60 + grain * 0.40, 0.0, 1.0));
    foamColor *= 0.82 + 0.18 * pores;
    return mix(water, foamColor, clamp(density, 0.0, 0.96));
  }
`;
