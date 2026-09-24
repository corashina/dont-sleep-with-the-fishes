import {
  AdditiveBlending, BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute,
  Mesh, ShaderMaterial, Vector3,
} from 'three';

const VERTEX_SHADER = `
  attribute vec3 tangent;
  attribute float width;
  attribute float strength;
  varying float vSide;
  varying float vStrength;

  void main() {
    vec4 center = modelViewMatrix * vec4(position, 1.0);
    vec2 direction = (modelViewMatrix * vec4(tangent, 0.0)).xy;
    vec2 normal = vec2(-direction.y, direction.x) / max(length(direction), 0.0001);
    vSide = uv.x * 2.0 - 1.0;
    vStrength = strength;
    center.xy += normal * vSide * width;
    gl_Position = projectionMatrix * center;
  }
`;

const FRAGMENT_SHADER = `
  uniform float intensity;
  varying float vSide;
  varying float vStrength;

  void main() {
    float distanceToCore = abs(vSide);
    float feather = max(fwidth(distanceToCore), 0.015);
    float core = 1.0 - smoothstep(0.22 - feather, 0.22 + feather, distanceToCore);
    float glow = exp(-distanceToCore * 3.5) * (1.0 - smoothstep(0.7, 1.0, distanceToCore));
    vec3 color = mix(vec3(0.48, 0.60, 0.9), vec3(1.0, 0.98, 1.0), core);
    float brightness = intensity * vStrength;
    gl_FragColor = vec4(color * 1.65, brightness * max(core, glow * 0.5));
  }
`;

// Build once. Shared ribbon vertices keep corners joined; the shader faces them toward the camera.
function createGeometry(height: number, random: () => number): BufferGeometry {
  const positions: number[] = [];
  const tangents: number[] = [];
  const widths: number[] = [];
  const strengths: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const direction = new Vector3();

  const appendPath = (points: readonly Vector3[], radius: number, strength: number, branch = false): void => {
    const firstVertex = positions.length / 3;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      direction.subVectors(points[Math.min(index + 1, points.length - 1)]!, points[Math.max(0, index - 1)]!);
      const progress = index / (points.length - 1);
      const taper = branch ? 1 - progress * 0.98 : 1 - progress * 0.3;
      const width = radius * 3 * taper * (0.8 + random() * 0.4);
      for (let side = 0; side < 2; side += 1) {
        positions.push(point.x, point.y, point.z);
        tangents.push(direction.x, direction.y, direction.z);
        widths.push(width);
        strengths.push(strength * (branch ? 1 - progress * 0.8 : 1));
        uvs.push(side, progress);
      }
      if (index === 0) continue;
      const vertex = firstVertex + index * 2;
      indices.push(vertex - 2, vertex - 1, vertex, vertex - 1, vertex + 1, vertex);
    }
  };

  // Midpoint displacement gives long bends with finer, irregular kinks.
  const subdivide = (start: Vector3, end: Vector3, roughness: number, depth: number): Vector3[] => {
    if (depth === 0) return [start, end];
    const middle = start.clone().lerp(end, 0.42 + random() * 0.16);
    middle.x += (random() - 0.5) * roughness;
    middle.z += (random() - 0.5) * roughness * 0.35;
    const upper = subdivide(start, middle, roughness * 0.52, depth - 1);
    const lower = subdivide(middle, end, roughness * 0.52, depth - 1);
    upper.pop();
    return upper.concat(lower);
  };

  const bends = [new Vector3((random() - 0.5) * height * 0.18, height, 0)];
  const bendSide = random() < 0.5 ? -1 : 1;
  for (let bend = 1; bend <= 4; bend += 1) {
    bends.push(new Vector3(
      bendSide * (bend % 2 === 0 ? -1 : 1) * height * (0.08 + random() * 0.12),
      height * (1 - (bend + (random() - 0.5) * 0.3) / 5),
      (random() - 0.5) * height * 0.06,
    ));
  }
  bends.push(new Vector3(0, 0, 0));
  const trunk = new CatmullRomCurve3(bends).getPoints(64);
  // Broad curved bends carry small irregular kinks, rather than a straight stretched trunk.
  for (let index = 1; index < trunk.length - 1; index += 1) {
    trunk[index]!.x += (random() - 0.5) * height * 0.025;
    trunk[index]!.z += (random() - 0.5) * height * 0.01;
  }
  appendPath(trunk, height * 0.009, 1);
  for (let branch = 0; branch < 7; branch += 1) {
    const start = trunk[6 + Math.floor(random() * 44)]!;
    const side = random() < 0.5 ? -1 : 1;
    const length = height * (0.07 + random() * 0.2);
    const end = new Vector3(
      start.x + side * length * (0.65 + random() * 0.45),
      Math.max(0.1, start.y - length),
      start.z + (random() - 0.5) * length * 0.5,
    );
    const path = subdivide(start, end, length * 0.5, 4);
    appendPath(path, height * (0.0025 + random() * 0.002), 0.65, true);
    if (branch % 2 === 0) {
      const fork = path[5 + Math.floor(random() * 5)]!;
      const tip = new Vector3(fork.x + side * length * 0.4, fork.y - length * 0.35, fork.z + length * 0.2);
      appendPath(subdivide(fork, tip, length * 0.18, 3), height * 0.0018, 0.4, true);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('tangent', new Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('width', new Float32BufferAttribute(widths, 1));
  geometry.setAttribute('strength', new Float32BufferAttribute(strengths, 1));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  return geometry;
}

export class LightningBolt extends Mesh<BufferGeometry, ShaderMaterial> {
  constructor(height: number, seed: number) {
    let state = seed >>> 0;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    super(createGeometry(height, random), new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { intensity: { value: 0 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    }));
    this.frustumCulled = false;
    this.visible = false;
  }

  setIntensity(intensity: number): void {
    this.material.uniforms.intensity!.value = intensity;
    this.visible = intensity > 0;
  }
}
