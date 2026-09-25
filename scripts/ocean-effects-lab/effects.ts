import { Vector4 } from 'three';
import type { OceanRenderer } from '../../src/ocean/OceanRenderer';

// Preview only. Gameplay shaders are imported unchanged and patched on this material.
const effects = /* glsl */ `
  uniform vec4 uPreviewEffects;
  uniform float uPreviewLighting;

  float previewHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float previewNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(previewHash(i), previewHash(i + vec2(1, 0)), f.x),
      mix(previewHash(i + vec2(0, 1)), previewHash(i + vec2(1)), f.x), f.y);
  }
  float previewGrain(vec2 p) {
    return previewNoise(p) * 0.57 + previewNoise(p * 2.13 + 7.2) * 0.28
      + previewNoise(p * 4.37 - 3.1) * 0.15;
  }
  float previewHullDistance() {
    vec3 local = (uExclusionWorldToLocal[0] * vec4(vWorldPosition, 1.0)).xyz;
    vec2 q = abs(local.xz) - vec2(1.9, 3.5);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  float previewContact() {
    vec3 local = (uExclusionWorldToLocal[0] * vec4(vWorldPosition, 1.0)).xyz;
    float contact = 1.0 - smoothstep(0.28, 0.65, abs(local.y));
    float d = max(0.0, previewHullDistance());
    float surge = 0.6 + 0.4 * sin(uTime * 1.4 + local.z * 1.3);
    return exp(-d * 3.8) * contact * surge;
  }
  vec2 previewRipples(vec2 p) {
    float d = max(0.0, previewHullDistance());
    vec2 radial = normalize(p / vec2(1.9, 3.5) + vec2(0.0001));
    float envelope = exp(-d * 0.75) * smoothstep(0.02, 0.35, d);
    float rings = filteredRipple(d * 19.0 - uTime * 4.8 + previewNoise(p * 1.5) * 1.3);
    vec2 fine = vec2(0.92, 0.39) * filteredRipple(dot(p, vec2(0.92, 0.39)) * 36.0
      - uTime * 5.1 + previewNoise(p * 0.6) * 4.0) * 0.019;
    return (radial * rings * envelope * 0.09 + fine) * uPreviewEffects.w;
  }
  float previewBubbles(vec2 p) {
    vec2 cells = p * 13.0;
    vec2 base = floor(cells);
    float result = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 id = base + vec2(float(x), float(y));
        float seed = previewHash(id);
        vec2 center = id + vec2(0.2 + 0.6 * seed, 0.2 + 0.6 * previewHash(id + 41.7));
        float age = fract(uTime * (0.18 + seed * 0.14) + seed * 9.0);
        float radius = mix(0.12, 0.32, seed) * smoothstep(0.0, 0.15, age);
        float dist = length(cells - center);
        float aa = max(fwidth(dist), 0.035);
        float ring = 1.0 - smoothstep(0.025, 0.025 + aa, abs(dist - radius));
        float life = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.72, 1.0, age));
        result = max(result, ring * life * step(0.24, seed));
      }
    }
    return result;
  }
  vec3 previewSurface(vec3 color, float height, float compression, vec3 normal) {
    vec2 p = vOceanPosition + windWarp(vOceanPosition) * 0.6;
    vec2 drift = p + vec2(-0.16, -0.075) * uTime;
    float grain = previewGrain(drift * 4.0);
    float weather = clamp((uAmplitudeScale - 0.62) / 1.03, 0.0, 1.0);
    float crest = smoothstep(mix(0.26, 0.13, weather), mix(0.43, 0.32, weather), compression)
      * smoothstep(0.04, 0.55, height);
    float lace = smoothstep(0.34, 0.66, grain);
    float fragments = previewNoise(drift * 1.1);
    float crestFoam = crest * lace * smoothstep(0.27, 0.57, fragments);
    float contact = previewContact();
    float hullFoam = contact * smoothstep(0.25, 0.64, grain);
    float foam = max(crestFoam * uPreviewEffects.x, hullFoam * uPreviewEffects.y);
    float bubbleZone = max(crest * 0.45, contact) * smoothstep(0.2, 0.55, fragments);
    float bubbles = previewBubbles(drift) * bubbleZone * uPreviewEffects.z;
    float fade = 1.0 - smoothstep(28.0, 90.0, vViewDepth);
    float light = clamp(uDirectLightStrength, 0.0, 1.0);
    vec3 plainFoam = vec3(0.61, 0.72, 0.70) * mix(0.10, 1.0, light);
    float facing = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 litFoam = uSkyColor * 0.30 + uSunColor * (0.13 + facing * 0.40) * light;
    vec3 foamColor = mix(plainFoam, litFoam, uPreviewLighting);
    color = mix(color, foamColor, clamp(foam * 0.92 + bubbles * 0.60, 0.0, 0.95) * fade);
    return color;
  }
`;

export function installPreviewEffects(ocean: OceanRenderer): void {
  const material = ocean.material;
  material.uniforms.uPreviewEffects = { value: new Vector4() };
  material.uniforms.uPreviewLighting = { value: 0 };
  const replace = (source: string, target: string, replacement: string): string => {
    if (!source.includes(target)) throw new Error(`Ocean preview hook missing: ${target}`);
    return source.replace(target, replacement);
  };
  let shader = replace(material.fragmentShader, '  vec2 opticalRippleSlope(vec2 p) {',
    `${effects}\n  vec2 opticalRippleSlope(vec2 p) {`);
  shader = replace(shader, '    return slope * mix(0.62, 1.15,',
    '    slope += previewRipples(p);\n    return slope * mix(0.62, 1.15,');
  shader = replace(shader, '    float fresnel = 0.02037 + 0.97963 * pow(1.0 - nv, 5.0);',
    '    roughness = mix(roughness, min(0.42, roughness + 0.065), uPreviewLighting);\n    float fresnel = 0.02037 + 0.97963 * pow(1.0 - nv, 5.0);');
  shader = replace(shader, '    return color;\n  }\n  #endif',
    '    return previewSurface(color, height, compression, n);\n  }\n  #endif');
  material.fragmentShader = shader;
  material.needsUpdate = true;
}
