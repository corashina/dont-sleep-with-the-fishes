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
  uniform float uTaper;
  uniform float uDrift;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float top = smoothstep(0.0, 1.0, uv.y);
    transformed.x *= mix(1.0, uTaper, top);
    float bend = sin(uTime * uDrift + uPhase + uv.y * 2.4) * 0.045;
    bend += sin(uTime * uDrift * 0.47 - uPhase * 0.8 + uv.y * 5.2) * 0.015;
    transformed.x += bend * (1.0 - top * 0.55);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const LIGHT_SHAFT_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uTime;
  uniform float uDensity;
  uniform float uDrift;
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
    float slowTime = uTime * uDrift;
    float broadFlow = valueNoise(vec2(vUv.y * 2.8 + uPhase, slowTime * 0.035));
    float fineFlow = valueNoise(vec2(vUv.y * 7.5 - slowTime * 0.02, uPhase * 2.3));
    float warpedX = vUv.x + (broadFlow - 0.5) * 0.12 + (fineFlow - 0.5) * 0.04;

    float edgeNoise = valueNoise(vec2(vUv.y * 4.3 + uPhase, slowTime * 0.025));
    float edgeWidth = mix(0.33, 0.48, edgeNoise);
    float horizontal = 1.0 - smoothstep(
      edgeWidth - 0.15,
      edgeWidth,
      abs(warpedX - 0.5)
    );

    float primaryCell = abs(fract(warpedX * uDensity + uPhase * 0.17) - 0.5) * 2.0;
    float secondaryCell = abs(
      fract((warpedX + 0.13) * (uDensity * 0.63) - uPhase * 0.11) - 0.5
    ) * 2.0;
    float primary = 1.0 - smoothstep(0.12, 0.62, primaryCell);
    float secondary = 1.0 - smoothstep(0.18, 0.78, secondaryCell);
    float strands = max(primary, secondary * 0.52);

    float breakupNoise = valueNoise(vec2(
      warpedX * 9.0 + uPhase,
      vUv.y * 5.0 - slowTime * 0.028
    ));
    float breakup = mix(0.48, 1.0, smoothstep(0.16, 0.86, breakupNoise));
    float vertical = smoothstep(0.0, 0.22, vUv.y)
      * (1.0 - smoothstep(0.86, 1.0, vUv.y));
    float shimmer = 0.93 + 0.07 * sin(slowTime * 0.09 + uPhase + vUv.y * 4.0);
    float alpha = horizontal * vertical * breakup
      * mix(0.18, 1.0, strands) * shimmer * uOpacity;
    vec3 depthColor = mix(uColor * 0.58, uColor * 1.08, smoothstep(0.08, 0.92, vUv.y));
    gl_FragColor = vec4(depthColor, alpha);
  }
`;

const LIGHT_SHAFT_SPECS = [
  { position: [-8.5, 4.6, -4.5], width: 5.4, length: 13.5, roll: -0.12, opacity: 0.06, phase: 0.2, taper: 0.34, density: 3.2, drift: 0.074 },
  { position: [5.8, 5.1, -10.5], width: 6.8, length: 15, roll: 0.09, opacity: 0.052, phase: 1.6, taper: 0.41, density: 2.7, drift: 0.061 },
  { position: [-4.2, 5.8, -18.5], width: 8.2, length: 17, roll: -0.06, opacity: 0.066, phase: 3.1, taper: 0.29, density: 3.6, drift: 0.052 },
  { position: [10.5, 6.4, -28], width: 10, length: 19, roll: 0.1, opacity: 0.044, phase: 4.7, taper: 0.38, density: 3.0, drift: 0.046 },
] as const;

export class UnderwaterLightShafts {
  readonly root = new Group();

  private readonly geometry = new PlaneGeometry(1, 1, 1, 12);
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
          uTaper: { value: spec.taper },
          uDensity: { value: spec.density },
          uDrift: { value: spec.drift },
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
      mesh.position.set(
        spec.position[0],
        spec.position[1],
        spec.position[2],
      );
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
