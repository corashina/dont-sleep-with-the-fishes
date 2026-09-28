import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, PlaneGeometry,
  ShaderMaterial, UniformsLib, UniformsUtils, type Vector3,
} from 'three';
import { smoothstep } from './animationMath';
import { CannonImpactParticles, IMPACT_NOISE } from './CannonImpactParticles';

const DURATION = 2.6;

function waterSheet(plume: boolean): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 80;
  const rows = 14;
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const angle = u * Math.PI * 2;
      const scallop = Math.sin(angle * 7 + 0.4) * 0.1 + Math.sin(angle * 13) * 0.06;
      const radius = plume
        ? (0.3 - v * 0.2) * (1 + scallop)
        : 0.28 + Math.pow(v, 0.72) * (0.82 + scallop * v);
      const height = plume
        ? v * (1 + scallop)
        : Math.sin(v * Math.PI * 0.72) * (0.8 + scallop * v * 2);
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      uvs.push(u, v);
      if (row < rows && column < segments) {
        const a = row * (segments + 1) + column;
        indices.push(a, a + 1, a + segments + 1, a + 1, a + segments + 2, a + segments + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function waterMaterial(ring: boolean): ShaderMaterial {
  return new ShaderMaterial({
    name: ring ? 'cannon-foam-rings' : 'cannon-water-sheet',
    transparent: true, depthWrite: false, side: DoubleSide, fog: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { age: { value: 0 }, opacity: { value: 0 } }]),
    vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float age, opacity;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      ${IMPACT_NOISE}
      void main() {
        float foam, alpha;
        ${ring ? `
          vec2 p = vUv * 2.0 - 1.0;
          float n = impactNoise(p * 9.0);
          float radius = length(p) + (n - 0.5) * 0.05;
          float edge = max(fwidth(radius), 0.012);
          float outer = 1.0 - smoothstep(0.02, 0.02 + edge * 2.0, abs(radius - 0.76));
          float inner = 1.0 - smoothstep(0.012, 0.012 + edge, abs(radius - 0.56));
          foam = (outer + inner * 0.4) * smoothstep(0.1, 0.75, n);
          alpha = foam * opacity;
        ` : `
          // Periodic coordinates keep the sheet seam invisible.
          float angle = vUv.x * 6.283185;
          vec2 around = vec2(cos(angle), sin(angle));
          float n = impactNoise(around * 9.0 + vec2(vUv.y * 2.0, -age * 1.7));
          float streak = impactNoise(around * 24.0 + vUv.y * 2.0);
          foam = smoothstep(0.58, 0.85, n) * 0.45 + smoothstep(0.75, 1.0, vUv.y) * 0.5;
          float edge = 1.0 - smoothstep(0.85 + n * 0.12, 1.0, vUv.y);
          float holes = smoothstep(age * 0.3, age * 0.3 + 0.3, n + (1.0 - vUv.y) * 0.4);
          alpha = (0.14 + streak * 0.32 + foam * 0.45) * edge * holes * opacity;
        `}
        if (alpha < 0.003) discard;
        vec3 color = mix(vec3(0.19, 0.38, 0.39), vec3(0.72, 0.86, 0.81), foam);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

/** Layered water impact: curved sheets, ballistic spray, mist, then foam. */
export class CannonWaterSplash {
  readonly root = new Group();
  private readonly sheetMaterial = waterMaterial(false);
  private readonly ringMaterial = waterMaterial(true);
  private readonly crown = new Mesh(waterSheet(false), this.sheetMaterial);
  private readonly plume = new Mesh(waterSheet(true), this.sheetMaterial);
  private readonly ring = new Mesh(new PlaneGeometry(2, 2), this.ringMaterial);
  private readonly spray = new CannonImpactParticles('spray', 100);
  private readonly mist = new CannonImpactParticles('mist', 18);

  constructor() {
    this.root.name = 'ghost-ship-cannon-splash';
    this.crown.name = 'cannon-splash-crown';
    this.plume.name = 'cannon-splash-plume';
    this.ring.name = 'cannon-splash-foam';
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.root.add(this.crown, this.plume, this.ring, this.spray.mesh, this.mist.mesh);
    this.reset();
  }

  place(position: Vector3, size: number): void {
    this.root.position.copy(position);
    this.root.position.y = 0;
    this.root.scale.setScalar(size);
  }

  sample(age: number): void {
    this.root.visible = age >= 0 && age < DURATION;
    if (!this.root.visible) return;
    const rise = smoothstep(age / 0.15);
    const collapse = 1 - smoothstep((age - 0.2) / 0.85);
    this.crown.scale.set(0.65 + age * 1.4, Math.max(0.015, 1.8 * rise * collapse), 0.65 + age * 1.4);
    const plumeHeight = Math.max(0.01, 6.6 * age - 4.9 * age * age);
    this.plume.scale.set(1 + age * 0.9, plumeHeight, 1 + age * 0.9);
    this.crown.visible = age < 1.1;
    this.plume.visible = age < 1.3;
    this.sheetMaterial.uniforms.age!.value = age;
    this.sheetMaterial.uniforms.opacity!.value = rise * (1 - smoothstep((age - 0.35) / 0.95));
    this.ring.scale.setScalar(0.5 + age * 2.1);
    this.ringMaterial.uniforms.age!.value = age;
    this.ringMaterial.uniforms.opacity!.value = smoothstep(age / 0.16) * (1 - smoothstep(age / DURATION)) * 0.7;
    this.spray.sample(age);
    this.mist.sample(age - 0.12);
  }

  reset(): void { this.root.visible = false; }

  dispose(): void {
    this.root.removeFromParent();
    this.crown.geometry.dispose();
    this.plume.geometry.dispose();
    this.ring.geometry.dispose();
    this.sheetMaterial.dispose();
    this.ringMaterial.dispose();
    this.spray.dispose();
    this.mist.dispose();
  }
}
