import {
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

const KELP_COUNT = 24;

const KELP_VERTEX_SHADER = `
  attribute float phase;
  uniform float uTime;
  varying float vHeight;

  void main() {
    vec3 transformed = position;
    float height = uv.y;
    float sway = sin(uTime * 0.72 + phase + height * 2.8) * height * height;
    transformed.x += sway * 0.24;
    transformed.z += cos(uTime * 0.51 + phase * 1.7 + height * 2.1) * height * 0.08;
    vHeight = height;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
  }
`;

const KELP_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform vec3 uFogColor;
  varying float vHeight;

  void main() {
    vec3 color = mix(uColor * 0.52, uColor, vHeight);
    float depthFade = smoothstep(7.0, 22.0, gl_FragCoord.z / gl_FragCoord.w);
    gl_FragColor = vec4(mix(color, uFogColor, depthFade * 0.7), 1.0);
  }
`;

export class UnderwaterPlantField {
  readonly root = new Group();
  readonly kelp: InstancedMesh<PlaneGeometry, ShaderMaterial>;

  private readonly geometry: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private disposed = false;

  constructor() {
    this.root.name = 'menu:plant-field';
    this.geometry = new PlaneGeometry(0.34, 1.8, 1, 5);
    this.geometry.translate(0, 0.9, 0);

    const phases = new Float32Array(KELP_COUNT);
    this.geometry.setAttribute('phase', new InstancedBufferAttribute(phases, 1));
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0x315f48) },
        uFogColor: { value: new Color(0x0b3440) },
      },
      vertexShader: KELP_VERTEX_SHADER,
      fragmentShader: KELP_FRAGMENT_SHADER,
      side: DoubleSide,
    });
    this.kelp = new InstancedMesh(this.geometry, this.material, KELP_COUNT);
    this.kelp.name = 'menu:procedural-kelp';
    this.kelp.frustumCulled = false;

    const transform = new Object3D();
    for (let index = 0; index < KELP_COUNT; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const lane = Math.floor(index / 2);
      const depth = -2.7 - lane * 0.72;
      const x = side * (2.65 + (lane % 4) * 0.82);
      const scale = 0.72 + (index % 5) * 0.11;
      transform.position.set(x, -0.42, depth);
      transform.rotation.set(0, index * 1.37, 0);
      transform.scale.set(scale, scale, scale);
      transform.updateMatrix();
      this.kelp.setMatrixAt(index, transform.matrix);
      phases[index] = index * 0.73;
    }
    this.kelp.instanceMatrix.needsUpdate = true;
    this.geometry.getAttribute('phase').needsUpdate = true;
    this.root.add(this.kelp);
  }

  setTime(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
