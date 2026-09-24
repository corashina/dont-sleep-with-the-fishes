/** Thin, broken cartoon ribbons at the hull's water contact. */
export const OCEAN_FOAM_FUNCTIONS = /* glsl */ `
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

  vec3 applyOceanFoam(vec3 water, vec3 normal) {
    const float hullFoamVisibility = 1.0;
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
      vec2 drift = local.xz * 2.0 + vec2(uTime * 0.24, -uTime * 0.16);
      float shape = foamNoise(drift);
      float fine = foamNoise(drift * 2.7 + vec2(7.1, 3.4));
      float width = 0.09 + shape * 0.10 + fine * 0.025;
      float ribbon = 1.0 - smoothstep(width - aa, width + aa, distanceToHull);
      float breaks = smoothstep(0.27, 0.43, shape);
      float seam = 1.0 - smoothstep(0.025, 0.05 + aa, distanceToHull);
      ribbon = max(seam, ribbon * breaks);
      float outerDistance = 0.29 + (shape - 0.5) * 0.12;
      float outerWidth = 0.015 + fine * 0.018;
      float outer = 1.0 - smoothstep(outerWidth, outerWidth + aa,
        abs(distanceToHull - outerDistance));
      outer *= smoothstep(0.53, 0.68, shape) * smoothstep(0.28, 0.5, fine);
      float contact = smoothstep(minY - 0.22, minY - 0.06, local.y)
        * (1.0 - smoothstep(maxY - 0.025, maxY + 0.035, local.y));
      // The hull depth and water exclusion hide the inner film. Do not cut a second hole.
      foam = max(foam, max(ribbon, outer) * contact);
    }
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float lightFacing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 foamColor = uSkyColor * 0.25 + vec3(0.72, 0.82, 0.86) * daylight * (0.85 + lightFacing * 0.15);
    return mix(water, foamColor, clamp(foam * hullFoamVisibility, 0.0, 0.96));
  }
`;
