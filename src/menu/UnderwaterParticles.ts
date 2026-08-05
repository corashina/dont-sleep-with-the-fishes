import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';

const BUBBLE_COUNT = 72;
const MATTER_COUNT = 96;

const PARTICLE_VERTEX_SHADER = `
  attribute vec3 basePosition;
  attribute float phase;
  uniform float uTime;
  uniform float uRise;
  uniform float uPointSize;
  varying float vPhase;

  void main() {
    vec3 transformed = basePosition;
    if (uRise > 0.5) {
      transformed.y = mod(basePosition.y + uTime * (0.13 + phase * 0.018) + 0.5, 6.4) - 0.5;
      transformed.x += sin(uTime * 0.42 + phase) * 0.08;
    } else {
      transformed.x += sin(uTime * 0.13 + phase) * 0.045;
      transformed.y += cos(uTime * 0.11 + phase * 1.3) * 0.035;
    }
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_PointSize = uPointSize * (9.0 / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
    vPhase = phase;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uFogColor;
  uniform float uRing;
  varying float vPhase;

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    float disc = 1.0 - smoothstep(0.34, 0.5, radius);
    float ring = smoothstep(0.22, 0.34, radius) * disc;
    float shape = mix(disc, ring, uRing);
    if (shape < 0.02) discard;
    float shimmer = 0.72 + 0.2 * sin(vPhase * 2.7);
    gl_FragColor = vec4(mix(uFogColor, uColor, shimmer), shape * 0.62);
  }
`;

interface ParticlePool {
  readonly geometry: BufferGeometry;
  readonly material: ShaderMaterial;
  readonly points: Points<BufferGeometry, ShaderMaterial>;
}

function createParticlePool(
  count: number,
  name: string,
  color: number,
  pointSize: number,
  bubbles: boolean,
): ParticlePool {
  const basePositions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const sequence = index * 2.399963229728653;
    const radius = 1.8 + (index % 13) * 0.49;
    basePositions[offset] = Math.cos(sequence) * radius;
    basePositions[offset + 1] = -0.35 + (index % 19) * 0.31;
    basePositions[offset + 2] = -3.2 - Math.sin(sequence) * radius - (index % 7) * 0.72;
    phases[index] = (index % 23) / 23 * Math.PI * 2;
  }

  const geometry = new BufferGeometry();
  const basePosition = new Float32BufferAttribute(basePositions, 3);
  geometry.setAttribute('position', basePosition);
  geometry.setAttribute('basePosition', basePosition);
  geometry.setAttribute('phase', new Float32BufferAttribute(phases, 1));
  geometry.boundingSphere = new Sphere(new Vector3(0, 2.7, -7), 13);
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uFogColor: { value: new Color(0x0b3440) },
      uRise: { value: bubbles ? 1 : 0 },
      uPointSize: { value: pointSize },
      uRing: { value: bubbles ? 1 : 0 },
    },
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.name = name;
  return { geometry, material, points };
}

export class UnderwaterParticles {
  readonly root = new Group();
  readonly bubbles: Points<BufferGeometry, ShaderMaterial>;
  readonly suspendedMatter: Points<BufferGeometry, ShaderMaterial>;

  private readonly bubblePool: ParticlePool;
  private readonly matterPool: ParticlePool;
  private disposed = false;

  constructor() {
    this.root.name = 'menu:particles';
    this.bubblePool = createParticlePool(
      BUBBLE_COUNT,
      'menu:bubbles',
      0x9fcbd0,
      11,
      true,
    );
    this.matterPool = createParticlePool(
      MATTER_COUNT,
      'menu:suspended-matter',
      0x8a9d87,
      5,
      false,
    );
    this.bubbles = this.bubblePool.points;
    this.suspendedMatter = this.matterPool.points;
    this.root.add(this.bubbles, this.suspendedMatter);
  }

  setBubbleTime(time: number): void {
    this.bubblePool.material.uniforms.uTime!.value = time;
  }

  setMatterTime(time: number): void {
    this.matterPool.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.bubblePool.geometry.dispose();
    this.matterPool.geometry.dispose();
    this.bubblePool.material.dispose();
    this.matterPool.material.dispose();
  }
}

export { BUBBLE_COUNT, MATTER_COUNT };
