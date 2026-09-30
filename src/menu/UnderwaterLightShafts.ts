import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

const GOD_RAY_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uTaper;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.x *= mix(1.0, uTaper, uv.y);
    transformed.x += sin(uTime * 0.11 + uv.y * 2.2) * 0.012 * (1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

// A soft beam with slow streaks. It fades out before the seabed and the surface.
const GOD_RAY_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  void main() {
    float across = (vUv.x - 0.5) * 2.0;
    float beam = pow(1.0 - smoothstep(0.0, 1.0, abs(across)), 1.7);
    float streaks = valueNoise(vec2(vUv.x * 9.0 + uTime * 0.04, vUv.y * 0.6 - uTime * 0.02));
    streaks += valueNoise(vec2(vUv.x * 23.0 - uTime * 0.07, vUv.y * 1.3)) * 0.5;
    float breakup = mix(0.45, 1.15, streaks / 1.5);
    float vertical = smoothstep(0.1, 0.24, vUv.y) * (1.0 - smoothstep(0.84, 1.0, vUv.y));
    float strength = mix(0.8, 1.0, vUv.y);
    float alpha = beam * breakup * vertical * strength * uOpacity;
    gl_FragColor = vec4(uColor * alpha, 1.0);
  }
`;

// One broad ray falls from the sun glow across the wreck.
const GOD_RAY = {
  position: [4, 9.5, -14], width: 30, length: 27, roll: -0.26, taper: 0.4, opacity: 1.15,
} as const;

export class UnderwaterLightShafts {
  readonly root = new Group();

  private readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private disposed = false;

  constructor() {
    this.root.name = 'menu:light-shafts';
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0x9fdcda) },
        uOpacity: { value: GOD_RAY.opacity },
        uTaper: { value: GOD_RAY.taper },
      },
      vertexShader: GOD_RAY_VERTEX_SHADER,
      fragmentShader: GOD_RAY_FRAGMENT_SHADER,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1, 1, 12), material);
    this.mesh.name = 'menu:god-ray';
    this.mesh.position.set(...GOD_RAY.position);
    this.mesh.scale.set(GOD_RAY.width, GOD_RAY.length, 1);
    this.mesh.rotation.z = GOD_RAY.roll;
    this.mesh.renderOrder = 2;
    this.root.add(this.mesh);
  }

  setTime(time: number): void {
    if (this.disposed) return;
    this.mesh.material.uniforms.uTime!.value = Number.isFinite(time) ? time : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
