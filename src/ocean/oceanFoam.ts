/** Branching white foam strands following the projected hull through wave motion. */
export const OCEAN_FOAM_FUNCTIONS = /* glsl */ `
  const vec2 oceanEffectVisibility = vec2(1.0);
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

  vec3 applyOceanFoam(vec3 water, vec3 normal) {
    float hullFoamVisibility = oceanEffectVisibility.y;
    float foam = 0.0;
    for (int i = 0; i < 2; i++) {
      if (i >= uExclusionCount) break;
      vec3 local = (uExclusionWorldToLocal[i] * vec4(vWorldPosition, 1.0)).xyz;
      vec4 bounds; vec2 taper;
      float minY = uExclusionMinimumLocalYs[i], maxY = uExclusionUpperLocalYs[i];
      oceanHullProfile(local, uExclusionLowerBounds[i], uExclusionBounds[i],
        uExclusionLowerTaperStarts[i], uExclusionTaperStarts[i], minY, maxY, bounds, taper);
      float hullDistance = foamHullDistance(local.xz, bounds, taper);
      // Extend the outer edge past the timber, without shifting the inner edge.
      float distanceToHull = hullDistance - 0.14;
      float aa = max(fwidth(distanceToHull), 0.008);
      float footprint = max(length(dFdx(local.xz)), length(dFdy(local.xz)));
      // Compute derivatives before limiting the cellular detail to the hull edge.
      if (distanceToHull > 0.95 + aa) continue;
      vec2 drift = local.xz * vec2(3.6, 2.4) + vec2(uTime * 0.12, -uTime * 0.09);
      vec2 flow = foamFlow(drift);
      float shape = foamNoise(drift * 0.8 + 7.1);
      float gap = foamFilament(flow);
      float fineGap = foamFilament(foamFlow(drift * 2.5 + vec2(13.1, 29.3)));
      float width = mix(0.085, 0.170, shape);
      float threadAA = max(footprint * 4.5, 0.008);
      float thread = (1.0 - smoothstep(width - threadAA, width + threadAA, gap))
        * width / max(width, threadAA);
      float fiberAA = max(footprint * 11.25, 0.008);
      float fibers = (1.0 - smoothstep(0.065 - fiberAA, 0.065 + fiberAA, fineGap))
        * 0.065 / max(0.065, fiberAA);
      float broken = smoothstep(0.23, 0.66, foamNoise(flow * 4.3 + 13.0));
      float strands = thread * mix(0.65, 1.0, broken) + fibers * 0.50;
      // A soft, uneven footprint lets branches fade into the surrounding water.
      float edge = 1.0 - smoothstep(0.16, 0.48 + shape * 0.40 + aa, distanceToHull);
      // The hull depth and water exclusion hide the inner film. Do not cut a second hole.
      foam = max(foam, strands * edge);
    }
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float lightFacing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 foamColor = uSkyColor * 0.25 + vec3(0.72, 0.82, 0.86) * daylight * (0.85 + lightFacing * 0.15);
    return mix(water, foamColor, clamp(foam * hullFoamVisibility, 0.0, 0.96));
  }
`;
