// The same hull profile controls surface contact and interior clipping.
export const WATER_EXCLUSION_UNIFORMS = /* glsl */ `
  uniform int uExclusionCount;
  uniform int uExclusionHullContacts[2];
  uniform mat4 uExclusionWorldToLocal[2];
  uniform vec4 uExclusionBounds[2];
  uniform vec4 uExclusionLowerBounds[2];
  uniform vec2 uExclusionTaperStarts[2];
  uniform vec2 uExclusionLowerTaperStarts[2];
  uniform float uExclusionMinimumLocalYs[2];
  uniform float uExclusionUpperLocalYs[2];
`;

export const WATER_CONTACT_FUNCTIONS = /* glsl */ `
  float hullContactDistance(vec2 p, vec4 bounds, vec2 taperStarts) {
    float halfWidth = max(0.001, (bounds.y - bounds.x) * 0.5);
    float x = p.x - (bounds.x + bounds.y) * 0.5;
    float sideDistance = abs(x) - halfWidth;
    float span;
    float endDistance;
    if (p.y < taperStarts.x) {
      span = taperStarts.x - bounds.z;
      endDistance = taperStarts.x - p.y;
    } else if (p.y > taperStarts.y) {
      span = bounds.w - taperStarts.y;
      endDistance = p.y - taperStarts.y;
    } else {
      return sideDistance;
    }
    if (span < 0.001) return max(sideDistance, endDistance);
    return (length(vec2(x / halfWidth, endDistance / span)) - 1.0)
      * min(halfWidth, span);
  }

  void applyHullContact(inout vec3 worldPosition, out float contact) {
    contact = 0.0;
    for (int i = 0; i < 2; i++) {
      if (i >= uExclusionCount) break;
      if (uExclusionHullContacts[i] == 0) continue;
      vec3 local = (uExclusionWorldToLocal[i] * vec4(worldPosition, 1.0)).xyz;
      // Leave headroom for interpolation across the coarser Low water triangles.
      float excess = max(0.0, local.y - (uExclusionUpperLocalYs[i] - 0.25));
      if (excess <= 0.0) continue;
      float distanceToHull = hullContactDistance(local.xz, uExclusionBounds[i], uExclusionTaperStarts[i]);
      float weight = 1.0 - smoothstep(1.0, 3.0, distanceToHull);
      // Smooth onset avoids a hard crease as a crest first reaches the rim.
      float depression = excess * excess / (excess + 0.08);
      worldPosition.y -= depression * weight / max(0.1, uExclusionWorldToLocal[i][1][1]);
      contact = max(contact, weight * smoothstep(0.0, 0.18, excess));
    }
  }
`;

export const WATER_CONTACT_NORMAL = /* glsl */ `
  vec3 hullContactNormal(vec3 waveNormal) {
    if (vHullContact <= 0.0001) return waveNormal;
    // Sample the smooth contact shape, without exposing the ocean mesh triangles.
    float inverseUp = 1.0 / max(0.05, waveNormal.y);
    vec3 center = vUnclampedWorldPosition;
    vec3 alongX = center + 0.025 * vec3(1.0, -waveNormal.x * inverseUp, 0.0);
    vec3 alongZ = center + 0.025 * vec3(0.0, -waveNormal.z * inverseUp, 1.0);
    float contact;
    applyHullContact(center, contact);
    applyHullContact(alongX, contact);
    applyHullContact(alongZ, contact);
    return normalize(cross(alongZ - center, alongX - center));
  }
`;
