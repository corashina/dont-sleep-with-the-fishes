import { OCEAN_FOAM_FUNCTIONS } from '../../src/ocean/oceanFoam';
import type { ShaderMaterial } from 'three';

/** Lab-only whole-surface material study. Does not change game materials. */
const WATER_PROTOTYPE = /* glsl */ `
  float waterFilament(vec2 p) {
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

  vec3 prototypeWater(vec3 water, vec3 normal) {
    vec2 p = vOceanPosition * vec2(1.0, 1.7) + vec2(uTime * 0.026, -uTime * 0.035);
    vec2 warp = vec2(foamNoise(p * 1.7 + uTime * 0.045),
      foamNoise(p * 1.6 + vec2(15.4, 6.1) - uTime * 0.035));
    p += (warp - 0.5) * 1.05;
    p += (vec2(foamNoise(p * 5.0), foamNoise(p * 5.0 + 17.0)) - 0.5) * 0.14;
    p += vec2(sin(p.y * 8.0 + uTime * 0.24), sin(p.x * 7.0 - uTime * 0.20)) * 0.026;
    float gap = waterFilament(p);
    float aa = max(fwidth(gap) * 0.6, 0.0015);
    float spread = foamNoise(p * 0.71 + vec2(4.3, 9.7));
    float lineWidth = mix(0.003, 0.010, spread);
    float line = 1.0 - smoothstep(lineWidth, lineWidth + aa, gap);
    float fiberOffset = 0.020 + foamNoise(p * 6.3) * 0.034;
    float fibers = 1.0 - smoothstep(0.002, 0.002 + aa, abs(gap - fiberOffset));
    fibers *= smoothstep(0.43, 0.66, foamNoise(p * 8.1 + uTime * 0.05));
    float fringe = (1.0 - smoothstep(0.025, 0.12, gap)) * 0.065;
    float breaks = smoothstep(0.35, 0.67, foamNoise(p * 2.8 + 13.0));
    float distanceFade = 1.0 - smoothstep(35.0, 120.0, vViewDepth);
    float daylight = clamp(uDirectLightStrength, 0.0, 1.0);
    float facing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 body = water * vec3(0.30, 0.52, 0.66);
    body += vec3(0.009, 0.028, 0.037) * daylight;
    vec3 streakColor = uSkyColor * 0.48 + vec3(0.36, 0.61, 0.72) * daylight * (0.65 + facing * 0.35);
    float opacity = (line * breaks * 0.65 + fibers * breaks * 0.25 + fringe * breaks) * distanceFade;
    return mix(body, streakColor, opacity);
  }
`;

export function installWaterPrototype(material: ShaderMaterial): void {
  const hull = OCEAN_FOAM_FUNCTIONS.replace('vec3 applyOceanFoam(', 'vec3 applyHullFoam(')
    .replace('const float hullFoamVisibility = 1.0;', 'float hullFoamVisibility = uFoamPreviewMask.y;');
  material.fragmentShader = material.fragmentShader.replace(OCEAN_FOAM_FUNCTIONS,
    'uniform vec2 uFoamPreviewMask;\n' + hull + WATER_PROTOTYPE + /* glsl */ `
      vec3 applyOceanFoam(vec3 water, vec3 normal) {
        vec3 study = water;
        if (uFoamPreviewMask.x > 0.5) study = prototypeWater(water, normal);
        return applyHullFoam(mix(water, study, uFoamPreviewMask.x), normal);
      }
    `);
}
