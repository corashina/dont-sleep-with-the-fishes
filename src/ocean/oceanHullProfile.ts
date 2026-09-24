export const OCEAN_HULL_PROFILE_GLSL = /* glsl */ `
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

  void oceanHullProfile(vec3 local, vec4 lower, vec4 upper, vec2 lowerTaper,
    vec2 upperTaper, float minY, float maxY, out vec4 bounds, out vec2 taper) {
    float amount = clamp((local.y - minY) / max(maxY - minY, 0.0001), 0.0, 1.0);
    bounds = mix(lower, upper, amount);
    taper = mix(lowerTaper, upperTaper, amount);
  }

  bool oceanInsideHull(vec3 local, vec4 bounds, vec2 taper, float minY, float maxY) {
    return local.y >= minY && local.y <= maxY && local.z >= bounds.z
      && local.z <= bounds.w && foamHullDistance(local.xz, bounds, taper) <= 0.0;
  }
`;
