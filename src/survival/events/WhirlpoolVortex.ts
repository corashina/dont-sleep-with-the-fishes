import {
  BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh,
  type Object3D, ShaderMaterial, Vector2, Vector4,
} from 'three';
import { createWaveUniformPayload, DEFAULT_WAVES, type VortexWaveState } from '../../ocean/WaveField';
import { MODULATED_WAVE_GLSL } from '../../ocean/waveModulation';
import { sceneSeaFogUniforms } from '../../world/SeaFogMaterial';

const RINGS = 72;
const SEGMENTS = 160;
// Matches the ocean shader, which cuts this core out of the sea surface.
const CORE_GLSL = /* glsl */ `
float whirlpoolCore() {
  return uVortexRadius * 0.56 * smoothstep(0.18, 0.72, uVortexStrength);
}
`;

const VORTEX_UNIFORMS_GLSL = /* glsl */ `
uniform vec2 uVortexCenter;
uniform float uVortexRadius;
uniform float uVortexDepression;
uniform float uVortexTangentStrength;
uniform float uVortexPhase;
uniform float uVortexStrength;
`;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmplitudeScale;
uniform vec2 uDirections[4];
uniform vec4 uParameters[4];
uniform float uPhases[4];
uniform float uThroatDepth;
${VORTEX_UNIFORMS_GLSL}
varying vec2 vOceanPosition;
varying vec3 vWorldPosition;
varying float vThroat;
${MODULATED_WAVE_GLSL}
${CORE_GLSL}
// Same surface as the ocean outside the core. Inside, the sea narrows into a deep throat.
vec3 whirlpoolSurface(vec2 worldXZ) {
  vec2 delta = worldXZ - uVortexCenter;
  float distance = length(delta);
  float core = max(0.001, whirlpoolCore());
  float inside = clamp(1.0 - distance / core, 0.0, 1.0);
  float waveScale = 1.0 - smoothstep(0.0, 0.7, inside) * 0.8;
  vec3 displaced = vec3(worldXZ.x, 0.0, worldXZ.y);
  float geometryLod = smoothstep(55.0, 140.0, length(cameraPosition - displaced));
  float height = 0.0;
  for (int i = 0; i < 4; i++) {
    float resolvedGeometryWave = smoothstep(4.0, 11.0, uParameters[i].y);
    float geometryWeight = mix(1.0, resolvedGeometryWave, geometryLod) * waveScale;
    OceanWaveSample wave = sampleOceanWave(i, worldXZ);
    height += wave.height * geometryWeight;
    displaced.xz += wave.displacement * geometryWeight;
  }
  float radius = max(0.001, uVortexRadius);
  float envelopeT = clamp(1.0 - distance / radius, 0.0, 1.0);
  float envelope = envelopeT * envelopeT * (3.0 - 2.0 * envelopeT) * uVortexStrength;
  vec2 radial = distance > 0.0001 ? delta / distance : vec2(0.0);
  float swirl = 0.78 + 0.22 * sin(uVortexPhase + distance * 0.65);
  float tangent = uVortexTangentStrength * envelope * swirl * (1.0 - smoothstep(0.0, 0.8, inside));
  height -= uVortexDepression * envelope;
  height -= uThroatDepth * uVortexStrength * pow(inside, 1.7);
  displaced.x += -radial.y * tangent;
  displaced.z += radial.x * tangent;
  displaced.y = height;
  vThroat = inside;
  return displaced;
}
void main() {
  vec2 worldXZ = (modelMatrix * vec4(position, 1.0)).xz;
  vec3 surface = whirlpoolSurface(worldXZ);
  // Lift the foam just clear of the ocean triangles.
  surface.y += 0.05 * (1.0 - vThroat);
  vOceanPosition = worldXZ;
  vWorldPosition = surface;
  gl_Position = projectionMatrix * viewMatrix * vec4(surface, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uFlow;
uniform float uLight;
uniform mat4 uBoatWorldToLocal;
${VORTEX_UNIFORMS_GLSL}
varying vec2 vOceanPosition;
varying vec3 vWorldPosition;
varying float vThroat;
${CORE_GLSL}
// Keep foam off the deck. The hull footprint matches the ocean water exclusion.
bool insideHull() {
  vec3 local = (uBoatWorldToLocal * vec4(vWorldPosition, 1.0)).xyz;
  vec2 hull = vec2(local.x / 1.65, max(0.0, abs(local.z) - 1.1) / 2.0);
  return dot(hull, hull) < 1.0 && abs(local.z) < 3.1;
}
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
    mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
    mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float turbulence(vec3 p) {
  return noise3(p) * 0.57 + noise3(p * 2.03 + 8.1) * 0.28
    + noise3(p * 4.07 + 19.3) * 0.15;
}
// Water turns faster near the throat. Two layers restart in turn so the shear stays bounded.
float streaks(vec2 delta, float r, float cycle, float seed) {
  float angularSpeed = 0.35 + 2.6 * pow(1.0 - clamp(r / uVortexRadius, 0.0, 1.0), 2.0);
  float angle = angularSpeed * cycle * 7.0 + log(max(r, 0.3)) * 2.4;
  float c = cos(angle), s = sin(angle);
  vec2 q = mat2(c, s, -s, c) * delta;
  return turbulence(vec3(q * 0.42, r * 1.9 + seed));
}
void main() {
  vec2 delta = vOceanPosition - uVortexCenter;
  float r = length(delta);
  float u = r / max(0.001, uVortexRadius);
  if (u >= 1.0 || uVortexStrength <= 0.0 || insideHull()) discard;
  float core = whirlpoolCore();
  float cycleA = fract(uFlow / 7.0);
  float cycleB = fract(uFlow / 7.0 + 0.5);
  float weightA = 1.0 - abs(cycleA * 2.0 - 1.0);
  float pattern = mix(streaks(delta, r, cycleB, 13.7), streaks(delta, r, cycleA, 0.0), weightA);
  float rim = 1.0 - smoothstep(0.62, 1.0, u);
  float foam = smoothstep(0.5, 0.74, pattern) * rim;
  float lip = exp(-pow((r - core) / 1.1, 2.0)) * smoothstep(0.1, 0.5, uVortexStrength);
  foam = max(foam, lip * smoothstep(0.35, 0.62, pattern));
  vec3 foamColor = vec3(0.66, 0.76, 0.78) * uLight;
  vec3 waterColor = vec3(0.012, 0.03, 0.04) * uLight;
  if (r < core) {
    // Opaque throat: streaks stretch down into a black centre.
    float depth = vThroat;
    float throatFoam = foam * (1.0 - smoothstep(0.1, 0.75, depth));
    vec3 color = mix(waterColor, foamColor, throatFoam * 0.85);
    color *= 1.0 - smoothstep(0.2, 0.95, depth) * 0.97;
    gl_FragColor = vec4(color, 1.0);
  } else {
    float shade = (1.0 - smoothstep(0.35, 1.0, u)) * 0.55;
    float alpha = max(foam * 0.9, shade) * uVortexStrength;
    vec3 color = mix(waterColor, foamColor, foam / max(foam + shade, 0.001));
    gl_FragColor = vec4(color, alpha);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createDiscGeometry(radius: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  // Rings bunch toward the throat, where the surface bends the most.
  for (let ring = 0; ring <= RINGS; ring += 1) {
    const ringRadius = radius * Math.pow(ring / RINGS, 1.35);
    for (let segment = 0; segment <= SEGMENTS; segment += 1) {
      const angle = (segment / SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    }
  }
  const stride = SEGMENTS + 1;
  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const a = ring * stride + segment;
      const b = a + stride;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createUniforms() {
  const payload = createWaveUniformPayload(DEFAULT_WAVES);
  return {
    uTime: { value: 0 },
    uAmplitudeScale: { value: 1 },
    uDirections: { value: payload.directions.map(([x, z]) => new Vector2(x, z)) },
    uParameters: { value: payload.parameters.map(([a, b, c, d]) => new Vector4(a, b, c, d)) },
    uPhases: { value: payload.phases },
    uVortexCenter: { value: new Vector2() },
    uVortexRadius: { value: 0 },
    uVortexDepression: { value: 0 },
    uVortexTangentStrength: { value: 0 },
    uVortexPhase: { value: 0 },
    uVortexStrength: { value: 0 },
    uThroatDepth: { value: 0 },
    uFlow: { value: 0 },
    uLight: { value: 1 },
    uBoatWorldToLocal: { value: new Matrix4() },
  };
}

/** Sea surface foam and throat drawn over the ocean's vortex depression. */
export class WhirlpoolVortex {
  readonly root = new Group();
  private readonly geometry: BufferGeometry;
  private readonly uniforms = createUniforms();
  private readonly material = new ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false,
  });
  private disposed = false;

  constructor(radius: number, throatDepth: number, boat: Object3D | undefined) {
    this.uniforms.uThroatDepth.value = throatDepth;
    this.geometry = createDiscGeometry(radius);
    this.root.name = 'whirlpool-vortex';
    const surface = new Mesh(this.geometry, this.material);
    surface.name = 'whirlpool-surface';
    surface.frustumCulled = false;
    surface.renderOrder = 2;
    surface.onBeforeRender = (_renderer, scene) => {
      const sky = sceneSeaFogUniforms.get(scene);
      this.uniforms.uLight.value = sky ? 0.3 + 0.7 * sky.uSunVisibility!.value : 1;
      if (boat === undefined) return;
      boat.updateWorldMatrix(true, false);
      this.uniforms.uBoatWorldToLocal.value.copy(boat.matrixWorld).invert();
    };
    this.root.add(surface);
    this.root.visible = false;
  }

  update(
    waveTime: number,
    amplitudeScale: number,
    flow: number,
    vortex: Readonly<VortexWaveState>,
  ): void {
    if (this.disposed) return;
    const uniforms = this.uniforms;
    uniforms.uTime.value = waveTime;
    uniforms.uAmplitudeScale.value = amplitudeScale;
    uniforms.uFlow.value = flow;
    uniforms.uVortexCenter.value.set(vortex.centerX, vortex.centerZ);
    uniforms.uVortexRadius.value = vortex.radius;
    uniforms.uVortexDepression.value = vortex.depression;
    uniforms.uVortexTangentStrength.value = vortex.tangentStrength;
    uniforms.uVortexPhase.value = vortex.phase;
    uniforms.uVortexStrength.value = vortex.strength;
    this.root.visible = vortex.strength > 0.005;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
