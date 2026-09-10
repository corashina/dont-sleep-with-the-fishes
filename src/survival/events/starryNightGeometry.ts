import {
  AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute,
  Group, Mesh, ShaderMaterial,
} from 'three';

// The silhouette is drawn from the head, around the back, to the split tail.
const STARS: readonly (readonly [number, number])[] = [
  [-40, -1], [-37, 7], [-28, 13], [-14, 16], [1, 15], [15, 10],
  [27, 3], [33, 5], [40, 16], [48, 18], [46, 9], [38, 1],
  [47, -5], [45, -10], [34, -5], [27, -3], [15, -10], [0, -12],
  [-17, -12], [-32, -8], [-39, -5], [-10, -4], [6, -11], [11, -5],
  [-30, 3], [-15, 5], [3, 8], [18, 2], [-25, -6],
];
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13],
  [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [19, 20], [20, 0], [21, 22], [22, 23], [23, 21],
  [24, 25], [25, 26], [26, 27], [27, 6],
  [3, 25], [25, 21], [26, 4], [0, 28], [28, 18],
];
// Leave open space for the moon inside the whale's body.
const MOON_CENTER = [4, 1] as const;

export function starryNightMaterial(fragmentShader: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    blending: AdditiveBlending, toneMapped: false,
    uniforms: {
      time: { value: 0 }, reveal: { value: 0 }, power: { value: 1 }, opacity: { value: 1 },
    },
    vertexShader: `
      attribute float birth;
      attribute float warmth;
      varying vec2 vUv;
      varying vec2 vLocalPosition;
      varying float vBirth;
      varying float vWarmth;
      void main() {
        vUv = uv; vBirth = birth; vWarmth = warmth;
        vLocalPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time, reveal, power, opacity;
      varying vec2 vUv;
      varying vec2 vLocalPosition;
      varying float vBirth, vWarmth;
      ${fragmentShader}
    `,
  });
}

const STAR_FRAGMENT = `
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float core = exp(-r*r*160.0);
    float halo = exp(-r*r*11.0) * 0.28;
    float rays = pow(max(0.0, 1.0-abs(p.x)), 65.0)
      * pow(max(0.0, 1.0-abs(p.y)), 3.0);
    rays += pow(max(0.0, 1.0-abs(p.y)), 65.0)
      * pow(max(0.0, 1.0-abs(p.x)), 3.0);
    float twinkle = 0.86 + 0.14*sin(time*1.3 + vBirth*49.0);
    float visible = smoothstep(vBirth, vBirth+0.12, reveal);
    vec3 color = mix(vec3(0.48, 0.73, 1.0), vec3(1.0, 0.73, 0.36), vWarmth);
    color = mix(color, vec3(1.0, 0.97, 0.89), core);
    gl_FragColor = vec4(color * (core*2.0 + halo + rays*0.7) * power,
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
    float drift = sin(vUv.x*9.0+vBirth*31.0+time*0.14)
      * sin(vUv.x*3.14159)*0.16;
    float cloud = mistNoise(vLocalPosition*0.65+vec2(time*0.025, 0.0));
    float veil = exp(-pow((across-drift)*3.5, 2.0));
    float wisps = veil * smoothstep(0.22, 0.8, cloud) * 0.045;

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
    float visible = smoothstep(vBirth, vBirth+0.06, reveal);
    vec3 color = mix(vec3(0.38, 0.53, 0.9), vec3(0.65, 0.78, 1.0), cloud);
    color = mix(color, vec3(0.9, 0.78, 0.56), vWarmth*0.45);
    gl_FragColor = vec4(color * power,
      (wisps+dust*veil*twinkle*0.48)*taper*visible*opacity);
  }
`;

interface VertexData {
  positions: number[]; uvs: number[]; births: number[]; warmth: number[];
}
function vertexData(): VertexData {
  return { positions: [], uvs: [], births: [], warmth: [] };
}
function geometry(data: VertexData): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  result.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
  result.setAttribute('birth', new Float32BufferAttribute(data.births, 1));
  result.setAttribute('warmth', new Float32BufferAttribute(data.warmth, 1));
  result.computeBoundingSphere();
  return result;
}
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]] as const;
function star(data: VertexData, x: number, y: number, size: number, birth: number, warmth: number): void {
  for (const [u, v] of CORNERS) {
    data.positions.push(x + (u-0.5)*size*2, y + (v-0.5)*size*2, 0);
    data.uvs.push(u, v); data.births.push(birth); data.warmth.push(warmth);
  }
}

function whaleStars(): Mesh<BufferGeometry, ShaderMaterial> {
  const data = vertexData();
  STARS.forEach(([x, y], index) => {
    const heart = index === 25;
    const size = heart ? 5 : index === 24 ? 1.8 : 1.8 + (index % 4)*0.35;
    star(data, x-MOON_CENTER[0], y-MOON_CENTER[1], size, index / STARS.length * 0.65, heart ? 1 : 0);
  });
  return new Mesh(geometry(data), starryNightMaterial(STAR_FRAGMENT));
}

function whaleThreads(): Mesh<BufferGeometry, ShaderMaterial> {
  const data = vertexData();
  EDGES.forEach(([a, b], index) => {
    const [ax, ay] = STARS[a]!;
    const [bx, by] = STARS[b]!;
    const length = Math.hypot(bx-ax, by-ay);
    const nx = -(by-ay) / length * 1.15;
    const ny = (bx-ax) / length * 1.15;
    for (const [u, v] of CORNERS) {
      data.positions.push(
        ax-MOON_CENTER[0]+(bx-ax)*u+nx*(v*2-1),
        ay-MOON_CENTER[1]+(by-ay)*u+ny*(v*2-1), -0.08,
      );
      data.uvs.push(u, v);
      data.births.push(0.16 + (index+u)/EDGES.length * 0.66);
      data.warmth.push(a === 25 || b === 25 ? 0.35 : 0);
    }
  });
  return new Mesh(geometry(data), starryNightMaterial(THREAD_FRAGMENT));
}

export class StarryNightGeometry {
  readonly root = new Group();
  readonly constellation = new Group();
  readonly stars = whaleStars();
  readonly threads = whaleThreads();
  private readonly meshes: readonly Mesh<BufferGeometry, ShaderMaterial>[];

  constructor() {
    this.constellation.name = 'starry-night-constellation';
    this.constellation.userData.disableHoverOutline = true;
    this.constellation.add(this.threads, this.stars);
    this.root.add(this.constellation);
    this.meshes = [this.stars, this.threads];
  }

  update(time: number, reveal: number, power: number, opacity: number): void {
    for (const mesh of this.meshes) {
      const uniforms = mesh.material.uniforms;
      uniforms.time!.value = time;
      uniforms.reveal!.value = reveal;
      uniforms.power!.value = power;
      uniforms.opacity!.value = opacity;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.root.clear();
  }
}
