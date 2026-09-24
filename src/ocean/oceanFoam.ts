/** Persistent foam coverage with age-dependent detail and sun-lit relief. */
export const OCEAN_FOAM_FUNCTIONS = /* glsl */ `
  uniform sampler2D uFoamCurrent;
  uniform sampler2D uFoamPrevious;
  uniform sampler2D uFoamDetail;
  uniform vec2 uFoamCurrentOrigin;
  uniform vec2 uFoamPreviousOrigin;
  uniform float uFoamExtent;
  uniform float uFoamMix;

  float foamMaterialHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float foamMaterialNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(foamMaterialHash(cell), foamMaterialHash(cell + vec2(1.0, 0.0)), f.x),
      mix(foamMaterialHash(cell + vec2(0.0, 1.0)), foamMaterialHash(cell + vec2(1.0)), f.x), f.y);
  }
  vec4 foamField(sampler2D field, vec2 origin) {
    vec2 uv = (vWorldPosition.xz - origin) / uFoamExtent + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
    return texture2D(field, uv);
  }
  vec4 foamFlowDetail(vec2 uv, vec2 flow, vec2 dx, vec2 dy) {
    float phase = fract(uTime * 0.5), other = fract(uTime * 0.5 + 0.5);
    float weight = 1.0 - abs(phase * 2.0 - 1.0);
    return textureGrad(uFoamDetail, uv - flow * phase * 2.0, dx, dy) * weight
      + textureGrad(uFoamDetail, uv - flow * other * 2.0, dx, dy) * (1.0 - weight);
  }

  vec3 applyOceanFoam(vec3 water, vec3 normal) {
    const vec2 foamVisibility = vec2(1.0);
    vec4 field = mix(foamField(uFoamPrevious, uFoamPreviousOrigin),
      foamField(uFoamCurrent, uFoamCurrentOrigin), uFoamMix);
    field *= foamVisibility.xxyy;
    float coverage = 1.0 - (1.0 - field.r) * (1.0 - field.b);
    float freshness = clamp((field.g + field.a) / max(field.r + field.b, 0.0001), 0.0, 1.0);
    vec2 dx = dFdx(vWorldPosition.xz) * 1.25, dy = dFdy(vWorldPosition.xz) * 1.25;
    float footprint = max(length(dx), length(dy));
    vec2 border = abs(vWorldPosition.xz - uFoamCurrentOrigin);
    float edgeFade = 1.0 - smoothstep(uFoamExtent * 0.5 - 16.0, uFoamExtent * 0.5, max(border.x, border.y));
    if (coverage < 0.008 || edgeFade <= 0.0) return water;

    vec2 flow = normalize(uDirections[0]) * 0.18;
    for (int i = 0; i < 4; i++) flow += sampleOceanWave(i, vOceanPosition).velocity.xz;
    vec2 uv = vWorldPosition.xz * 1.25;
    vec4 detail = foamFlowDetail(uv, flow * 1.25, dx, dy);
    float ageMix = sqrt(freshness);
    float film = mix(detail.g, detail.r, ageMix);
    float relief = mix(detail.a, detail.b, ageMix);
    vec2 gradient = vec2(0.0);
    #ifdef HIGH_QUALITY_WATER
      const float texel = 1.0 / 256.0;
      vec4 sx = foamFlowDetail(uv + vec2(texel, 0.0), flow * 1.25, dx, dy);
      vec4 sy = foamFlowDetail(uv + vec2(0.0, texel), flow * 1.25, dx, dy);
      gradient = vec2(mix(sx.a, sx.b, ageMix), mix(sy.a, sy.b, ageMix)) - relief;
      gradient *= 1.25 / texel * 0.007 * (1.0 - smoothstep(0.015, 0.10, footprint));
      mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
      vec4 fine = foamFlowDetail(rotation * uv * 2.73 + vec2(13.7, 27.2),
        rotation * flow * (1.25 * 2.73), rotation * dx * 2.73, rotation * dy * 2.73);
      film *= 0.65 + 0.35 * mix(fine.g, fine.r, ageMix);
    #endif
    vec2 wind = normalize(uDirections[0]);
    vec2 macroUV = vec2(dot(vWorldPosition.xz, wind), dot(vWorldPosition.xz, vec2(-wind.y, wind.x)));
    float folds = foamMaterialNoise(macroUV * vec2(0.9, 1.7));
    float body = smoothstep(0.055, 0.30, coverage - (1.0 - folds) * 0.16);
    float wet = smoothstep(0.02, 0.15, coverage) * 0.055;
    float density = max(wet, body * film * mix(0.62, 0.98, ageMix)) * edgeFade;
    vec3 bump = vec3(gradient.x, 0.0, gradient.y);
    bump -= normal * dot(normal, bump);
    vec3 foamNormal = normalize(normal - bump);
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float facing = max(dot(foamNormal, normalize(uLightDirection)), 0.0);
    vec3 light = uSkyColor * 0.80 + uSunColor * daylight * (0.18 + facing * 0.35);
    vec3 wetColor = light * vec3(0.48, 0.66, 0.68);
    vec3 dryColor = light * vec3(0.97, 0.99, 0.95);
    vec3 foamColor = mix(wetColor, dryColor, smoothstep(0.04, 0.22, coverage) * mix(0.82, 1.0, ageMix));
    vec3 halfVector = normalize(normalize(cameraPosition - vWorldPosition) + normalize(uLightDirection));
    float highlight = pow(max(dot(foamNormal, halfVector), 0.0), 12.0);
    foamColor += uSunColor * daylight * highlight * 0.055 * (1.0 - ageMix * 0.5);
    foamColor *= 0.94 + relief * 0.12;
    return mix(water, foamColor, clamp(density, 0.0, 0.98));
  }
`;
