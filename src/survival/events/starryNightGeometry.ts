import {
  AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute,
  Group, Mesh, ShaderMaterial,
} from 'three';

import type { ItemId } from '../../game/ItemState';
import { constellationShape, type ConstellationShape } from './starryNightShapes';

export function starryNightMaterial(fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    blending: AdditiveBlending, toneMapped: false,
    uniforms: {
      time: { value: 0 }, reveal: { value: 0 }, opacity: { value: 1 }, highlight: { value: 0 },
    },
    vertexShader: `
      attribute float phase;
      attribute float warmth;
      varying vec2 vUv;
      varying vec2 vLocalPosition;
      varying float vPhase;
      varying float vWarmth;
      void main() {
        vUv = uv; vPhase = phase; vWarmth = warmth;
        vLocalPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time, reveal, opacity, highlight;
      varying vec2 vUv;
      varying vec2 vLocalPosition;
      varying float vPhase, vWarmth;
      ${fragmentShader}
    `,
  });
}

const STAR_FRAGMENT = `
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float core = exp(-r*r*210.0);
    float halo = exp(-r*r*12.0) * 0.17;
    float rays = pow(max(0.0, 1.0-abs(p.x)), 65.0)
      * pow(max(0.0, 1.0-abs(p.y)), 3.0);
    rays += pow(max(0.0, 1.0-abs(p.y)), 65.0)
      * pow(max(0.0, 1.0-abs(p.x)), 3.0);
    float twinkle = 0.91 + 0.09*sin(time*0.7 + vPhase*49.0);
    float visible = smoothstep(0.0, 1.0, reveal);
    vec3 color = mix(vec3(0.72, 0.83, 1.0), vec3(1.0, 0.88, 0.72), vWarmth);
    color = mix(color, vec3(1.0, 0.97, 0.89), core);
    color = mix(color, vec3(0.18, 0.46, 1.0), highlight);
    gl_FragColor = vec4(color * (core*3.0 + halo + rays*0.16) * mix(1.0, 1.25, highlight),
      visible * twinkle * opacity * (1.0-smoothstep(0.7, 1.0, r)));
  }
`;
const THREAD_FRAGMENT = `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float mistNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 blend = fract(p);
    blend = blend*blend*(3.0-2.0*blend);
    return mix(mix(hash(cell), hash(cell+vec2(1.0, 0.0)), blend.x),
      mix(hash(cell+vec2(0.0, 1.0)), hash(cell+vec2(1.0, 1.0)), blend.x), blend.y);
  }
  void main() {
    float across = vUv.y*2.0-1.0;
    float drift = sin(vUv.x*9.0+vPhase*31.0+time*0.14)
      * sin(vUv.x*3.14159)*0.16;
    float cloud = mistNoise(vLocalPosition*0.65+vec2(time*0.025, 0.0));
    float veil = exp(-pow((across-drift)*3.5, 2.0));
    float wisps = veil * smoothstep(0.22, 0.8, cloud) * 0.035;
    // Faint, broken traces preserve the shape behind the individual stars.
    float coreWidth = max(0.16, fwidth(across));
    float gaps = mix(0.12, 1.0, smoothstep(0.25, 0.72, cloud));
    float thread = exp(-pow(across / coreWidth, 2.0)) * 0.14 * gaps;

    // Tiny, irregular glints stay inside the connection's soft band.
    vec2 dustUv = vLocalPosition*1.6;
    vec2 cell = floor(dustUv);
    float seed = hash(cell);
    vec2 center = 0.2+0.6*vec2(hash(cell+7.3), hash(cell+19.1));
    vec2 offset = fract(dustUv)-center;
    vec2 pixelWidth = fwidth(dustUv);
    vec2 variance = vec2(0.009)+pixelWidth*pixelWidth/6.0;
    float dust = exp(-dot(offset*offset, 1.0/variance))
      * 0.009/sqrt(variance.x*variance.y) * step(0.73, seed);
    float twinkle = 0.35+0.65*pow(0.5+0.5*sin(time*0.85+seed*47.0), 3.0);
    float taper = smoothstep(0.0, 0.08, vUv.x)*smoothstep(0.0, 0.08, 1.0-vUv.x);
    float visible = smoothstep(0.0, 1.0, reveal);
    vec3 color = mix(vec3(0.38, 0.53, 0.9), vec3(0.65, 0.78, 1.0), cloud);
    color = mix(color, vec3(0.9, 0.78, 0.56), vWarmth*0.45);
    color = mix(color, vec3(0.18, 0.46, 1.0), highlight);
    gl_FragColor = vec4(color,
      (thread+wisps+dust*veil*twinkle*0.26)*taper*visible*opacity*0.7);
  }
`;

interface VertexData {
  positions: number[]; uvs: number[]; phases: number[]; warmth: number[];
}
function vertexData(): VertexData {
  return { positions: [], uvs: [], phases: [], warmth: [] };
}
function geometry(data: VertexData): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  result.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
  result.setAttribute('phase', new Float32BufferAttribute(data.phases, 1));
  result.setAttribute('warmth', new Float32BufferAttribute(data.warmth, 1));
  result.computeBoundingSphere();
  return result;
}
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]] as const;
function star(data: VertexData, x: number, y: number, size: number, phase: number, warmth: number): void {
  for (const [u, v] of CORNERS) {
    data.positions.push(x + (u-0.5)*size*2, y + (v-0.5)*size*2, 0);
    data.uvs.push(u, v); data.phases.push(phase); data.warmth.push(warmth);
  }
}

function starVariation(x: number, y: number): number {
  const value = Math.sin(x*127.1 + y*311.7)*43758.5453;
  return value - Math.floor(value);
}

function itemStars({ stars, edges }: ConstellationShape): Mesh<BufferGeometry, ShaderMaterial> {
  const data = vertexData();
  const connections = new Uint8Array(stars.length);
  for (const [a, b] of edges) { connections[a]! += 1; connections[b]! += 1; }
  stars.forEach(([x, y], index) => {
    const variation = starVariation(x, y);
    const landmark = connections[index]! > 2 || Math.abs(x) >= 9 || Math.abs(y) >= 9;
    const size = (landmark ? 1.25 : 0.8) + variation*variation*0.75;
    star(data, x, y, size, variation, variation > 0.84 ? 0.7 : variation*0.12);
  });
  return new Mesh(geometry(data), starryNightMaterial(STAR_FRAGMENT));
}

function itemThreads({ stars, edges }: ConstellationShape): Mesh<BufferGeometry, ShaderMaterial> {
  const data = vertexData();
  edges.forEach(([a, b]) => {
    const [ax, ay] = stars[a]!;
    const [bx, by] = stars[b]!;
    const length = Math.hypot(bx-ax, by-ay);
    const nx = -(by-ay) / length * 0.45;
    const ny = (bx-ax) / length * 0.45;
    for (const [u, v] of CORNERS) {
      data.positions.push(
        ax+(bx-ax)*u+nx*(v*2-1),
        ay+(by-ay)*u+ny*(v*2-1), -0.08,
      );
      data.uvs.push(u, v);
      data.phases.push(starVariation(ax, by));
      data.warmth.push(0);
    }
  });
  return new Mesh(geometry(data), starryNightMaterial(THREAD_FRAGMENT));
}


export class StarryNightGeometry {
  readonly root = new Group();
  readonly constellations: Group[] = [];
  private readonly meshes: Mesh<BufferGeometry, ShaderMaterial>[][] = [];
  private highlighted = -1;
  private previousTime = 0;

  setHighlighted(index: number, highlighted: boolean): void {
    if (highlighted) {
      this.highlighted = index;
    } else if (this.highlighted === index) this.clearHighlight();
  }

  clearHighlight(): void {
    this.highlighted = -1;
  }

  setItems(items: readonly ItemId[]): void {
    this.dispose();
    for (const item of items) {
      const outline = constellationShape(item);
      const stars = itemStars(outline);
      const threads = itemThreads(outline);
      const constellation = new Group();
      constellation.name = 'starry-night:' + item;
      constellation.userData.disableHoverOutline = true;
      constellation.add(threads, stars);
      constellation.scale.setScalar(2.4);
      this.root.add(constellation);
      this.constellations.push(constellation);
      this.meshes.push([stars, threads]);
    }
  }

  update(time: number, reveal: number, opacity: number, selected: number, flash: number, aspect: number): void {
    // Reach 95% of the hover color in 0.3 seconds, independent of frame rate.
    const highlightBlend = 1 - Math.exp(-Math.max(0, time - this.previousTime) * 10);
    this.previousTime = time;
    for (let index = 0; index < this.constellations.length; index++) {
      const group = this.constellations[index]!;
      if (aspect < 1.2) {
        group.position.set(0, index === 0 ? 40 : -27, 0);
      } else {
        group.position.set((index - 0.5)*105, 12, 0);
      }
      const chosen = index === selected;
      const alpha = chosen ? Math.min(1, opacity * 2) : opacity;
      const highlightTarget = index === this.highlighted ? 1 : 0;
      group.scale.setScalar(2.4 * (chosen ? 1 + flash*0.08 : 1));
      for (const mesh of this.meshes[index]!) {
        const uniforms = mesh.material.uniforms;
        uniforms.time!.value = time;
        uniforms.reveal!.value = reveal;
        uniforms.opacity!.value = alpha * (chosen ? 1 + flash*2 : 1);
        uniforms.highlight!.value += (highlightTarget - uniforms.highlight!.value) * highlightBlend;
      }
    }
  }

  dispose(): void {
    this.clearHighlight();
    this.previousTime = 0;
    for (const meshes of this.meshes) {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    this.meshes.length = 0;
    this.constellations.length = 0;
    this.root.clear();
  }
}
