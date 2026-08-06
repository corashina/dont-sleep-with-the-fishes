import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';

export const LIGHT_SHAFT_COUNT = 4;

const LIGHT_SHAFT_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.x += sin(uTime * 0.12 + uPhase) * 0.035 * (1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const LIGHT_SHAFT_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float horizontal = 1.0 - smoothstep(0.12, 0.5, abs(vUv.x - 0.5));
    float vertical = smoothstep(0.0, 0.18, vUv.y)
      * (1.0 - smoothstep(0.72, 1.0, vUv.y));
    float pulse = 0.84 + 0.16 * sin(uTime * 0.16 + uPhase);
    gl_FragColor = vec4(uColor, horizontal * vertical * pulse * uOpacity);
  }
`;

const LIGHT_SHAFT_SPECS = [
  { position: [-8.5, 4.6, -4.5], width: 5.4, length: 13.5, roll: -0.12, opacity: 0.075, phase: 0.2 },
  { position: [5.8, 5.1, -10.5], width: 6.8, length: 15, roll: 0.09, opacity: 0.065, phase: 1.6 },
  { position: [-4.2, 5.8, -18.5], width: 8.2, length: 17, roll: -0.06, opacity: 0.085, phase: 3.1 },
  { position: [10.5, 6.4, -28], width: 10, length: 19, roll: 0.1, opacity: 0.055, phase: 4.7 },
] as const;

export class UnderwaterLightShafts {
  readonly root = new Group();

  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly materials = new Set<ShaderMaterial>();
  private disposed = false;

  constructor() {
    this.root.name = 'menu:light-shafts';
    LIGHT_SHAFT_SPECS.forEach((spec, index) => {
      const material = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: spec.phase },
          uColor: { value: new Color(0x77c4cc) },
          uOpacity: { value: spec.opacity },
        },
        vertexShader: LIGHT_SHAFT_VERTEX_SHADER,
        fragmentShader: LIGHT_SHAFT_FRAGMENT_SHADER,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });
      this.materials.add(material);
      const mesh = new Mesh(this.geometry, material);
      mesh.name = `menu:light-shaft-${index + 1}`;
      mesh.position.set(...spec.position);
      mesh.scale.set(spec.width, spec.length, 1);
      mesh.rotation.z = spec.roll;
      mesh.renderOrder = 2;
      this.root.add(mesh);
    });
  }

  setTime(time: number): void {
    if (this.disposed) return;
    const safeTime = Number.isFinite(time) ? time : 0;
    for (const material of this.materials) {
      material.uniforms.uTime!.value = safeTime;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    disposeResourceSets(new Set([this.geometry]), this.materials);
  }
}
