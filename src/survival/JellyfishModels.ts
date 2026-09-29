import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute,
  InstancedMesh, ShaderMaterial, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UNDERWATER_GLOW_LAYER } from '../rendering/renderLayers';

// Original geometry: scalloped bells, six luminous canals, and eight trailing arms.
function createJellyfishGeometry(variant: number, distant = false): BufferGeometry {
  const detail = distant
    ? { bellWidth: 16, bellHeight: 6, coreWidth: 8, coreHeight: 4, ribs: 6, arms: 4, armSegments: 6, sides: 3 }
    : { bellWidth: 36, bellHeight: 12, coreWidth: 12, coreHeight: 8, ribs: 12, arms: 8, armSegments: 16, sides: 4 };
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, glow: number): void => {
    geometry.setAttribute('aGlow', new Float32BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count).fill(glow), 1,
    ));
    parts.push(geometry);
  };
  const bell = new SphereGeometry(1, detail.bellWidth, detail.bellHeight, 0, Math.PI * 2, 0, Math.PI * 0.57);
  const positions = bell.getAttribute('position');
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ribs = 1 + Math.cos(angle * 6 + variant * 0.3) * 0.045 * (1 - y);
    positions.setXYZ(i, x * ribs * (0.46 + variant * 0.025),
      y * (0.34 + variant * 0.03) + 0.14 + Math.sin(angle * 12) * 0.018 * (1 - y),
      z * ribs * 0.44);
  }
  bell.computeVertexNormals();
  add(bell, 0.18);
  const core = new SphereGeometry(0.13, detail.coreWidth, detail.coreHeight);
  core.scale(1, 0.75, 1);
  core.translate(0, 0.23, 0);
  add(core, 1);
  for (let rib = 0; rib < 6; rib += 1) {
    const angle = rib * Math.PI / 3;
    const points: Vector3[] = [];
    for (let j = 0; j <= 10; j += 1) {
      const arc = j / 10 * Math.PI * 0.56;
      points.push(new Vector3(
        Math.cos(angle) * Math.sin(arc) * (0.48 + variant * 0.025),
        Math.cos(arc) * (0.35 + variant * 0.03) + 0.14,
        Math.sin(angle) * Math.sin(arc) * 0.46,
      ));
    }
    add(new TubeGeometry(new CatmullRomCurve3(points), detail.ribs, 0.009, detail.sides, false), 0.85);
  }
  for (let arm = 0; arm < detail.arms; arm += 1) {
    const angle = arm * Math.PI / 4 + variant * 0.17;
    const length = 0.58 + ((arm * 3 + variant) % 5) * 0.12;
    const points: Vector3[] = [];
    for (let j = 0; j <= 12; j += 1) {
      const t = j / 12;
      const radius = 0.33 * (1 - t * 0.45);
      points.push(new Vector3(
        Math.cos(angle) * radius + Math.sin(t * 7 + arm) * t * 0.10,
        0.12 - t * length,
        Math.sin(angle) * radius + Math.cos(t * 6 + arm) * t * 0.09,
      ));
    }
    add(new TubeGeometry(new CatmullRomCurve3(points), detail.armSegments, arm % 3 === 0 ? 0.024 : 0.012, detail.sides, false), 0.65);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

export class JellyfishModels {
  private readonly geometries = [0, 1, 2].map((variant) => createJellyfishGeometry(variant));
  private readonly material = this.createMaterial();
  private readonly backgroundGeometry = createJellyfishGeometry(0, true);

  private createMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aGlow;
        varying vec3 vTint;
        varying float vGlow;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vDistanceFade;
        void main() {
          vec3 p = position;
          float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
          float trail = max(0.0, -p.y);
          p.x += sin(uTime * 1.25 + phase - p.y * 4.0) * trail * 0.12;
          p.z += cos(uTime * 1.05 + phase - p.y * 3.0) * trail * 0.09;
          p *= 0.96 + sin(uTime * 1.45 + phase) * 0.04;
          p = (instanceMatrix * vec4(p, 1.0)).xyz;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          vView = -view.xyz;
          mat3 transform = mat3(instanceMatrix);
          vec3 n = normal / vec3(dot(transform[0], transform[0]),
            dot(transform[1], transform[1]), dot(transform[2], transform[2]));
          vNormal = normalize(normalMatrix * transform * n);
          vGlow = aGlow * (0.78 + sin(uTime * 1.45 + phase) * 0.22);
          vTint = instanceColor;
          vDistanceFade = 1.0 - smoothstep(65.0, 250.0, length(view.xyz));
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vTint;
        varying float vGlow;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vDistanceFade;
        void main() {
          if (vDistanceFade < 0.01) discard;
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
          float glow = vGlow;
          vec3 color = vTint * (0.22 + glow * 1.4 + rim * 0.65);
          color += vec3(0.45, 0.65, 0.65) * pow(glow, 3.0) * 0.35;
          color = mix(vec3(0.025, 0.10, 0.12), color, vDistanceFade);
          gl_FragColor = vec4(color, clamp(0.35 + vGlow * 0.6 + rim * 0.35, 0.0, 1.0) * vDistanceFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
  }

  createBatch(variant: number, count: number): InstancedMesh<BufferGeometry, ShaderMaterial> {
    return this.createInstances(this.geometries[variant]!, count, `jellyfish-batch:${variant}`, variant);
  }

  createBackground(count: number): InstancedMesh<BufferGeometry, ShaderMaterial> {
    return this.createInstances(this.backgroundGeometry, count, 'jellyfish-background');
  }

  private createInstances(geometry: BufferGeometry, count: number, name: string, variant?: number): InstancedMesh<BufferGeometry, ShaderMaterial> {
    const mesh = new InstancedMesh(geometry, this.material, count);
    const tint = new Color();
    for (let index = 0; index < count; index += 1) {
      mesh.setColorAt(index, tint.setHex((variant ?? index) % 3 === 0 ? 0x69ffdd : 0x55cfff));
    }
    mesh.name = name;
    mesh.layers.enable(UNDERWATER_GLOW_LAYER);
    return mesh;
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.backgroundGeometry.dispose();
    this.material.dispose();
  }
}
