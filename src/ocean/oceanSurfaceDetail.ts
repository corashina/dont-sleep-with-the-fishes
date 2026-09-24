/** Ocean-wide filament detail and fine ripple normals, before blood and fog. */
export const OCEAN_SURFACE_DETAIL_FUNCTIONS = /* glsl */ `
  vec2 surfaceNoiseGradient(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = foamHash(cell), b = foamHash(cell + vec2(1.0, 0.0));
    float c = foamHash(cell + vec2(0.0, 1.0)), d = foamHash(cell + vec2(1.0));
    vec2 gradient = vec2(mix(b - a, d - c, u.y), mix(c - a, d - b, u.x)) * du;
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    return gradient * (1.0 - smoothstep(0.35, 1.2, footprint));
  }

  vec3 surfaceRippleNormal(vec3 normal) {
    vec2 wind = normalize(uDirections[0]);
    vec2 crossWind = vec2(-wind.y, wind.x);
    vec2 p = vec2(dot(vOceanPosition, wind), dot(vOceanPosition, crossWind));
    p += vec2(foamNoise(p * 0.7), foamNoise(p * 0.8 + 19.0)) * 0.38;
    vec2 slope = surfaceNoiseGradient(p * vec2(2.7, 5.1) + vec2(uTime * 0.13, 0.0)) * vec2(0.055, 0.11);
    slope += surfaceNoiseGradient(p * vec2(8.3, 13.7) - vec2(0.0, uTime * 0.23)) * vec2(0.032, 0.060);
    slope += surfaceNoiseGradient(p * vec2(23.1, 31.7) + vec2(37.0, uTime * 0.31)) * vec2(0.020, 0.025);
    vec2 worldSlope = wind * slope.x + crossWind * slope.y;
    vec3 bump = vec3(worldSlope.x, 0.0, worldSlope.y);
    bump -= normal * dot(normal, bump);
    return normalize(normal - bump);
  }

  float surfaceThread(float gap, float width) {
    float aa = max(fwidth(gap), 0.002);
    return (1.0 - smoothstep(width - aa, width + aa, gap)) * width / max(width, aa);
  }

  vec3 shadeSurfaceDetail(vec3 water, vec3 normal) {
    vec2 wind = normalize(uDirections[0]);
    vec2 across = vec2(-wind.y, wind.x);
    vec2 p = vec2(dot(vOceanPosition, wind), dot(vOceanPosition, across));
    p = p * vec2(0.95, 2.6) + vec2(uTime * 0.045, -uTime * 0.031);
    vec2 flow = foamFlow(p);
    float ridge = smoothstep(-0.22, 0.70, vWorldPosition.y);
    float patches = foamNoise(p * 0.63 + vec2(14.6, 7.1));
    float strands = foamFilament(flow);
    float fineStrands = foamFilament(foamFlow(p * 2.65 + vec2(13.1, 29.3)));
    float width = mix(0.018, 0.085, ridge) * mix(0.65, 1.25, patches);
    float thread = surfaceThread(strands, width);
    float fibers = surfaceThread(fineStrands, mix(0.014, 0.060, ridge));
    float broken = smoothstep(0.28, 0.62, foamNoise(flow * 4.3 + 13.0));
    float wisps = (1.0 - smoothstep(0.03, 0.18, strands)) * fibers;
    float opacity = thread * mix(0.15, 0.65, broken) + fibers * 0.37 + wisps * ridge * 0.65;
    opacity *= mix(0.23, 1.55, ridge) * mix(0.55, 1.0, patches);
    opacity *= 1.0 - smoothstep(45.0, 150.0, vViewDepth);
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);

    vec3 body = water * vec3(0.16, 0.34, 0.48) / (vec3(1.0) + water * 1.6);
    body += vec3(0.004, 0.012, 0.020) * daylight;
    vec3 streakColor = oceanFoamColor(normal);
    return mix(body, streakColor, clamp(opacity, 0.0, 0.85));
  }

  vec3 applyOceanSurface(vec3 water, vec3 normal) {
    if (oceanSurfaceVisibility > 0.5) return shadeSurfaceDetail(water, normal);
    return water;
  }
`;
