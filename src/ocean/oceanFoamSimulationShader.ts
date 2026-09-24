import { MODULATED_WAVE_GLSL } from './waveModulation';
import { OCEAN_SURFACE_SAMPLING_GLSL } from './oceanSurfaceSampling';
import { OCEAN_HULL_PROFILE_GLSL } from './oceanHullProfile';

export const OCEAN_FOAM_SIMULATION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const OCEAN_FOAM_SIMULATION_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uFoamHistory;
  uniform vec2 uFoamHistoryOrigin;
  uniform vec2 uFoamTargetOrigin;
  uniform float uFoamExtent;
  uniform float uFoamTexel;
  uniform float uFoamStep;
  uniform vec3 uFoamViewer;
  uniform vec2 uFoamSourceMask;
  uniform float uTime;
  uniform float uAmplitudeScale;
  uniform vec2 uDirections[4];
  uniform vec4 uParameters[4];
  uniform float uPhases[4];
  uniform vec2 uVortexCenter;
  uniform float uVortexRadius;
  uniform float uVortexDepression;
  uniform float uVortexTangentStrength;
  uniform float uVortexPhase;
  uniform float uVortexStrength;
  uniform int uExclusionCount;
  uniform mat4 uExclusionWorldToLocal[2];
  uniform mat4 uHullPreviousLocalToWorld[2];
  uniform mat4 uHullLocalToWorld[2];
  uniform float uHullIntervals[2];
  uniform vec4 uExclusionBounds[2];
  uniform vec4 uExclusionLowerBounds[2];
  uniform vec2 uExclusionTaperStarts[2];
  uniform vec2 uExclusionLowerTaperStarts[2];
  uniform float uExclusionMinimumLocalYs[2];
  uniform float uExclusionUpperLocalYs[2];
  ${MODULATED_WAVE_GLSL}
  ${OCEAN_SURFACE_SAMPLING_GLSL}
  ${OCEAN_HULL_PROFILE_GLSL}

  vec4 sampleHistoryWithinBounds(vec2 uv) {
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
    return texture2D(uFoamHistory, uv);
  }

  void main() {
    vec2 worldXZ = uFoamTargetOrigin + (vUv - 0.5) * uFoamExtent;
    vec2 q = oceanWaveCoordinate(worldXZ, uFoamViewer);
    vec3 surface = oceanGeometryPosition(q, uFoamViewer);
    surface.xz = worldXZ;
    vec3 velocity = vec3(0.0);
    vec2 tangentX = vec2(1.0, 0.0), tangentZ = vec2(0.0, 1.0);
    float height = 0.0;
    for (int i = 0; i < 4; i++) {
      OceanWaveSample wave = sampleOceanWave(i, q);
      velocity += wave.velocity;
      height += wave.height;
      vec2 direction = normalize(uDirections[i]);
      tangentX += direction * wave.horizontalSlope.x;
      tangentZ += direction * wave.horizontalSlope.y;
    }
    velocity.xz += normalize(uDirections[0]) * 0.18;
    vec2 uv = (worldXZ - velocity.xz * uFoamStep - uFoamHistoryOrigin) / uFoamExtent + 0.5;
    vec4 state = sampleHistoryWithinBounds(uv);
    vec2 dx = vec2(uFoamTexel, 0.0), dy = dx.yx;
    vec4 neighbors = (sampleHistoryWithinBounds(uv + dx) + sampleHistoryWithinBounds(uv - dx)
      + sampleHistoryWithinBounds(uv + dy) + sampleHistoryWithinBounds(uv - dy)) * 0.25;
    state = mix(state, neighbors, 0.05);
    state.rb *= exp2(-uFoamStep / 3.0);
    state.ga *= exp2(-uFoamStep / 0.8);

    float compression = 1.0 - (tangentX.x * tangentZ.y - tangentX.y * tangentZ.x);
    float weather = smoothstep(0.68, 1.5, uAmplitudeScale);
    float crest = smoothstep(mix(0.24, 0.13, weather), mix(0.40, 0.32, weather), compression)
      * smoothstep(-0.06, 0.43, height);
    float hull = 0.0;
    bool inside = false;
    for (int i = 0; i < 2; i++) {
      if (i >= uExclusionCount) break;
      vec3 local = (uExclusionWorldToLocal[i] * vec4(surface, 1.0)).xyz;
      vec4 bounds; vec2 taper;
      float minY = uExclusionMinimumLocalYs[i], maxY = uExclusionUpperLocalYs[i];
      oceanHullProfile(local, uExclusionLowerBounds[i], uExclusionBounds[i],
        uExclusionLowerTaperStarts[i], uExclusionTaperStarts[i], minY, maxY, bounds, taper);
      inside = inside || oceanInsideHull(local, bounds, taper, minY, maxY);
      float distanceToHull = foamHullDistance(local.xz, bounds, taper);
      vec3 hullVelocity = vec3(0.0);
      if (uHullIntervals[i] > 0.00001) {
        vec3 previous = (uHullPreviousLocalToWorld[i] * vec4(local, 1.0)).xyz;
        hullVelocity = (surface - previous) / uHullIntervals[i];
      }
      vec3 relative = velocity - hullVelocity;
      vec3 localVelocity = (uExclusionWorldToLocal[i] * vec4(relative, 0.0)).xyz;
      vec2 outward = normalize(vec2(
        foamHullDistance(local.xz + vec2(0.05, 0.0), bounds, taper) - distanceToHull,
        foamHullDistance(local.xz + vec2(0.0, 0.05), bounds, taper) - distanceToHull) + vec2(0.00001));
      float approach = max(0.0, -dot(localVelocity.xz, outward));
      float speed = min(length(relative), 3.0);
      float width = 0.8 + speed * 0.23;
      float contact = smoothstep(minY - 0.16, minY + 0.08, local.y)
        * (1.0 - smoothstep(maxY - 0.04, maxY + 0.14, local.y));
      float band = 1.0 - smoothstep(width * 0.2, width + 0.3, max(distanceToHull, 0.0));
      hull = max(hull, contact * band * (0.2 + speed) * (0.45 + min(approach, 1.0) * 0.55));
    }
    vec2 sourceRate = vec2(crest * 1.5, hull * 3.0) * uFoamSourceMask;
    if (inside) sourceRate = vec2(0.0);
    vec2 added = (1.0 - state.rb) * (1.0 - exp(-sourceRate * uFoamStep));
    state.rb += added;
    state.ga = min(state.rb, state.ga + added);
    gl_FragColor = clamp(state, 0.0, 1.0);
  }
`;
