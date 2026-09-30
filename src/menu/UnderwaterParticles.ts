import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  NormalBlending,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { MENU_SURFACE_HEIGHT } from './UnderwaterSurface';

// Bubbles rise from the wreck, the sunken rowboat, and seabed vents.
const BUBBLE_SOURCES = [
  [-6.2, 3.4, -19.4, 30],
  [3.8, 4.6, -19.2, 36],
  [10.4, 3.1, -19.8, 26],
  [0.55, 0.05, -4.7, 22],
  [-5.6, -0.3, -8.2, 16],
  [7.6, -0.3, -13.2, 18],
  [-9.4, -0.2, -2.8, 12],
] as const;
const MARINE_SNOW_COUNT = 1200;
const MARINE_SNOW_BOUNDS = {
  minX: -30, maxX: 30, minY: -0.6, maxY: MENU_SURFACE_HEIGHT, minZ: -42, maxZ: 6.5,
} as const;

const BUBBLE_VERTEX_SHADER = `
  attribute float phase;
  attribute float bubbleSize;
  attribute float riseSpeed;
  attribute vec2 drift;
  uniform float uTime;
  uniform float uSurfaceHeight;
  varying float vFade;

  void main() {
    float travel = uSurfaceHeight - position.y;
    float risen = mod(phase * travel + uTime * riseSpeed, travel);
    float progress = risen / travel;
    vec3 transformed = position;
    transformed.y += risen;
    float wobble = 0.035 + progress * 0.12;
    transformed.x += sin(uTime * 3.1 * riseSpeed + phase * 40.0) * wobble + drift.x * progress;
    transformed.z += cos(uTime * 2.7 * riseSpeed + phase * 31.0) * wobble + drift.y * progress;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float size = bubbleSize * (0.7 + progress * 0.7);
    gl_PointSize = size * 900.0 / max(1.0, -viewPosition.z);
    gl_Position = projectionMatrix * viewPosition;
    vFade = smoothstep(0.0, 0.04, progress) * (1.0 - smoothstep(0.86, 1.0, progress));
  }
`;

const BUBBLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vFade;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radius = length(point);
    if (radius > 1.0) discard;
    float rim = smoothstep(0.62, 0.94, radius) * (1.0 - smoothstep(0.94, 1.0, radius));
    float glint = 1.0 - smoothstep(0.0, 0.3, length(point - vec2(-0.34, -0.36)));
    float lowerGlow = (1.0 - smoothstep(0.0, 0.45, length(point - vec2(0.2, 0.42)))) * 0.25;
    float alpha = (0.1 + rim * 0.7 + glint * 0.95 + lowerGlow) * vFade;
    gl_FragColor = vec4(uColor * (0.8 + glint * 0.5), alpha);
  }
`;

const SNOW_VERTEX_SHADER = `
  attribute float phase;
  attribute float flakeSize;
  uniform float uTime;
  uniform float uHeight;
  uniform float uFloor;
  varying float vAlpha;

  void main() {
    vec3 transformed = position;
    float span = uHeight - uFloor;
    transformed.y = uFloor + mod(position.y - uFloor - uTime * (0.05 + phase * 0.012), span);
    transformed.x += sin(uTime * 0.17 + phase * 6.3) * 0.35;
    transformed.z += cos(uTime * 0.13 + phase * 4.1) * 0.25;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float depth = max(1.0, -viewPosition.z);
    gl_PointSize = max(1.4, flakeSize * 220.0 / depth);
    gl_Position = projectionMatrix * viewPosition;
    vAlpha = (1.0 - smoothstep(18.0, 46.0, depth)) * smoothstep(0.0, 1.2, depth - 0.4);
  }
`;

const SNOW_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    float radius = length(gl_PointCoord * 2.0 - 1.0);
    float soft = 1.0 - smoothstep(0.1, 1.0, radius);
    if (soft < 0.01) discard;
    gl_FragColor = vec4(uColor, soft * vAlpha * 0.5);
  }
`;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function createBubbleGeometry(): BufferGeometry {
  const random = seededRandom(0x5eab);
  const count = BUBBLE_SOURCES.reduce((total, source) => total + source[3], 0);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const drifts = new Float32Array(count * 2);
  let index = 0;
  for (const [x, y, z, bubbles] of BUBBLE_SOURCES) {
    for (let bubble = 0; bubble < bubbles; bubble += 1) {
      positions[index * 3] = x + (random() - 0.5) * 0.3;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z + (random() - 0.5) * 0.3;
      phases[index] = random();
      sizes[index] = 0.045 + Math.pow(random(), 3) * 0.13;
      speeds[index] = 0.9 + random() * 0.8;
      drifts[index * 2] = (random() - 0.5) * 2.2;
      drifts[index * 2 + 1] = (random() - 0.5) * 1.4;
      index += 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new Float32BufferAttribute(phases, 1));
  geometry.setAttribute('bubbleSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('riseSpeed', new Float32BufferAttribute(speeds, 1));
  geometry.setAttribute('drift', new Float32BufferAttribute(drifts, 2));
  geometry.boundingSphere = new Sphere(new Vector3(0, 6.5, -12), 30);
  return geometry;
}

function createMarineSnowGeometry(): BufferGeometry {
  const random = seededRandom(0x0c3a);
  const bounds = MARINE_SNOW_BOUNDS;
  const positions = new Float32Array(MARINE_SNOW_COUNT * 3);
  const phases = new Float32Array(MARINE_SNOW_COUNT);
  const sizes = new Float32Array(MARINE_SNOW_COUNT);
  for (let index = 0; index < MARINE_SNOW_COUNT; index += 1) {
    positions[index * 3] = bounds.minX + random() * (bounds.maxX - bounds.minX);
    positions[index * 3 + 1] = bounds.minY + random() * (bounds.maxY - bounds.minY);
    positions[index * 3 + 2] = bounds.minZ + random() * (bounds.maxZ - bounds.minZ);
    phases[index] = random();
    sizes[index] = 0.012 + Math.pow(random(), 4) * 0.05;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new Float32BufferAttribute(phases, 1));
  geometry.setAttribute('flakeSize', new Float32BufferAttribute(sizes, 1));
  geometry.boundingSphere = new Sphere(new Vector3(0, 6, -18), 45);
  return geometry;
}

export class UnderwaterParticles {
  readonly root = new Group();
  readonly bubbles: Points<BufferGeometry, ShaderMaterial>;
  readonly marineSnow: Points<BufferGeometry, ShaderMaterial>;
  private disposed = false;

  constructor() {
    this.root.name = 'menu:particles';
    this.bubbles = new Points(createBubbleGeometry(), new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSurfaceHeight: { value: MENU_SURFACE_HEIGHT },
        uColor: { value: new Color(0xc4e7e6) },
      },
      vertexShader: BUBBLE_VERTEX_SHADER,
      fragmentShader: BUBBLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    }));
    this.bubbles.name = 'menu:bubbles';
    this.marineSnow = new Points(createMarineSnowGeometry(), new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: MARINE_SNOW_BOUNDS.maxY },
        uFloor: { value: MARINE_SNOW_BOUNDS.minY },
        uColor: { value: new Color(0x9fbcae) },
      },
      vertexShader: SNOW_VERTEX_SHADER,
      fragmentShader: SNOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }));
    this.marineSnow.name = 'menu:marine-snow';
    this.root.add(this.bubbles, this.marineSnow);
  }

  setBubbleTime(time: number): void {
    this.bubbles.material.uniforms.uTime!.value = time;
  }

  setMatterTime(time: number): void {
    this.marineSnow.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.bubbles.geometry.dispose();
    this.marineSnow.geometry.dispose();
    this.bubbles.material.dispose();
    this.marineSnow.material.dispose();
  }
}
