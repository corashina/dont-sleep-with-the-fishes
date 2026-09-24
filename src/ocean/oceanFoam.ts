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


  // Cavities in a connected foam film. Thick foam has small, deep pores;
  // thin foam opens into larger holes with narrow, lit rims.
  vec2 foamCells(vec2 p, float footprint, float thickness) {
    vec2 cell = floor(p);
    vec2 point = fract(p);
    float nearest = 2.0;
    vec2 nearestDelta = vec2(1.0, 0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 id = cell + offset;
        float seed = foamHash(id);
        vec2 center = vec2(seed, foamHash(id + 71.3));
        vec2 delta = (offset + center - point) * vec2(1.0 + seed * 0.45, 1.0 - seed * 0.20);
        float radius = mix(0.36, 0.10, thickness) * mix(0.50, 1.35, seed);
        float distanceToRim = length(delta) - radius;
        if (distanceToRim < nearest) {
          nearest = distanceToRim;
          nearestDelta = delta;
        }
      }
    }
    float aa = clamp(footprint * 0.6, 0.025, 0.24);
    float film = smoothstep(-aa, aa, nearest);
    float rim = 1.0 - smoothstep(0.015, 0.13 + aa, abs(nearest));
    float facing = dot(normalize(nearestDelta + vec2(0.0001)), vec2(-0.6, 0.8));
    float relief = rim * facing;
    float filtered = smoothstep(0.32, 1.0, footprint);
    return mix(vec2(film, relief), vec2(mix(0.40, 0.91, thickness), 0.0), filtered);
  }

  // Signed distance approximation to the same straight sides and elliptical ends
  // used by the water exclusion. Works with asymmetric bow/stern profiles.
  float hullFoamSource(vec3 local, vec4 bounds, vec2 taperStarts, float minY, float maxY) {
    float distanceToHull = max(0.0, foamHullDistance(local.xz, bounds, taperStarts));
    float contact = smoothstep(minY - 0.16, minY + 0.08, local.y)
      * (1.0 - smoothstep(maxY - 0.04, maxY + 0.14, local.y));
    float surge = 0.5 + 0.5 * sin(local.z * 1.9 + local.x * 0.8 - uTime * 1.3);
    float width = mix(0.52, 1.04, surge) * clamp(uAmplitudeScale, 0.65, 1.45);
    float fringe = 1.0 - smoothstep(width * 0.20, width + 0.32, distanceToHull);
    return fringe * contact * mix(0.76, 1.0, surge);
  }

  vec3 applyOceanFoam(vec3 water, vec3 normal, float height, float compression, float hullSource) {
    float weather = smoothstep(0.68, 1.5, uAmplitudeScale);
    float crestSource = smoothstep(mix(0.22, 0.085, weather), mix(0.38, 0.27, weather), compression)
      * smoothstep(-0.06, 0.43, height);
    float source = max(crestSource, hullSource);
    float distanceFade = 1.0 - smoothstep(65.0, 185.0, vViewDepth);

    // Evaluate derivatives before the branch so fine detail stays stable at patch edges.
    float footprint = max(length(dFdx(vOceanPosition)), length(dFdy(vOceanPosition)));
    if (source < 0.025 || distanceFade <= 0.0) return water;

    vec2 wind = normalize(uDirections[0]);
    vec2 across = vec2(-wind.y, wind.x);
    vec2 drift = vOceanPosition - wind * uTime * 0.18;
    vec2 p = vec2(dot(drift, wind), dot(drift, across));
    vec2 warp = vec2(foamNoise(p * 0.65, footprint * 0.65),
      foamNoise(p * 0.65 + 17.3, footprint * 0.65)) - 0.5;
    p += warp * 0.95;
    float rafts = foamNoise(p * vec2(1.6, 0.70), footprint * 1.6);
    float folds = foamNoise(p * vec2(6.5, 3.2) + 9.1, footprint * 6.5);
    float grain = foamNoise(p * 24.0 - 4.7, footprint * 24.0);

    // Broad connected bodies tear into branching strips at their trailing edges.
    float structure = rafts * 0.56 + folds * 0.30 + grain * 0.14;
    float edge = 0.69 - source * 0.36;
    float feather = clamp(footprint * 1.2, 0.035, 0.14);
    float body = smoothstep(edge - feather, edge + feather, structure);
    float thickness = smoothstep(edge - 0.04, edge + 0.22, structure)
      * mix(0.48, 1.0, source);
    float film = mix(0.40, 0.92, smoothstep(0.20, 0.70, grain));
    float relief = (folds - 0.5) * 0.22;
    #ifdef HIGH_QUALITY_WATER
      vec2 cells = foamCells(p * 15.0, footprint * 15.0, thickness);
      vec2 micro = foamCells(p * 47.0 + 29.7, footprint * 47.0, thickness * 0.7 + 0.3);
      film = cells.x * mix(0.65, 1.0, micro.x);
      relief += cells.y * 0.18 + micro.y * 0.06;
    #endif

    float density = body * film * mix(0.65, 0.99, thickness);
    // Translucent wet froth joins the bright islands without flattening the water.
    float wetFringe = smoothstep(edge - 0.15, edge + 0.02, structure) * 0.12 * source;
    density = max(density, wetFringe) * distanceFade * smoothstep(0.015, 0.10, source);

    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float facing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 foamLight = uSkyColor * 0.80
      + uSunColor * daylight * (0.21 + facing * 0.31);
    vec3 wetColor = foamLight * vec3(0.53, 0.70, 0.72);
    vec3 dryColor = foamLight * vec3(0.97, 0.99, 0.96);
    vec3 foamColor = mix(wetColor, dryColor, smoothstep(0.08, 0.78, thickness));
    foamColor *= 0.92 + relief + grain * 0.08;
    return mix(water, foamColor, clamp(density, 0.0, 0.98));
  }
`;
