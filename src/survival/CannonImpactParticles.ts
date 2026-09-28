import {
  Color, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, ShaderMaterial, UniformsLib, UniformsUtils,
} from 'three';

export function impactSeed(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export const IMPACT_NOISE = `
  float noiseHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float impactNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(noiseHash(i), noiseHash(i + vec2(1, 0)), f.x),
      mix(noiseHash(i + vec2(0, 1)), noiseHash(i + vec2(1, 1)), f.x), f.y);
  }
`;

/** A prepared burst. Motion runs on the GPU; sampling only changes its clock. */
export class CannonImpactParticles {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly duration: number;

  constructor(kind: 'spray' | 'mist' | 'dust', count: number) {
    const spray = kind === 'spray';
    const dust = kind === 'dust';
    const minimumSize = { spray: 0.07, mist: 0.35, dust: 0.18 }[kind];
    this.duration = spray ? 1.9 : 2.2;
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
    ], 3));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    const velocities: number[] = [];
    const particles: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963;
      const speed = (spray ? 0.65 : 0.25) + impactSeed(index, 21) * (spray ? 2.8 : 0.95);
      velocities.push(Math.cos(angle) * speed,
        (spray ? 3 : 0.3) + impactSeed(index, 22) * (spray ? 4.5 : 1.1), Math.sin(angle) * speed);
      particles.push(
        minimumSize + impactSeed(index, 23) * (spray ? 0.16 : 0.5),
        (spray ? 0.8 : 1.1) + impactSeed(index, 24) * 0.65,
        impactSeed(index, 25) * (spray ? 0.15 : 0.25), impactSeed(index, 26),
      );
    }
    geometry.setAttribute('launchVelocity', new InstancedBufferAttribute(new Float32Array(velocities), 3));
    geometry.setAttribute('particle', new InstancedBufferAttribute(new Float32Array(particles), 4));
    geometry.instanceCount = count;
    const material = new ShaderMaterial({
      name: `ghost-ship-${kind}`, transparent: true, depthWrite: false, fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, {
        age: { value: -1 }, tint: { value: new Color(dust ? 0x9c876c : 0xb5d0cc) },
      }]),
      defines: { SPRAY: Number(spray) },
      vertexShader: `
        attribute vec3 launchVelocity;
        attribute vec4 particle;
        uniform float age;
        varying vec2 vUv;
        varying float vFade, vSeed, vHeight;
        #include <fog_pars_vertex>
        void main() {
          float t = max(0.0, age - particle.z);
          float progress = t / particle.y;
          vFade = step(particle.z, age) * (1.0 - smoothstep(0.45, 1.0, progress))
            * smoothstep(0.0, 0.045, t);
          vSeed = particle.w;
          vec3 center;
          float size = particle.x;
          #if SPRAY == 1
            center = launchVelocity * t;
            center.y += 0.06 - 4.9 * t * t;
          #else
            center = launchVelocity * (1.0 - exp(-t * 1.8)) / 1.8;
            center.y += t * 0.18;
            size *= 1.0 + t * 2.6;
          #endif
          vHeight = center.y;
          vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
          vec2 offset = position.xy;
          #if SPRAY == 1
            offset.x *= 0.48;
          #else
            float angle = particle.w * 6.283 + t * 0.25;
            offset = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * offset;
          #endif
          mvPosition.xy += offset * size * length(modelMatrix[0].xyz);
          gl_Position = projectionMatrix * mvPosition;
          vUv = position.xy + 0.5;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform vec3 tint;
        uniform float age;
        varying vec2 vUv;
        varying float vFade, vSeed, vHeight;
        #include <fog_pars_fragment>
        ${IMPACT_NOISE}
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float radius = length(p);
          float alpha;
          vec3 color = tint;
          #if SPRAY == 1
            alpha = (1.0 - smoothstep(0.35, 1.0, radius)) * 0.8;
            alpha *= step(0.02, vHeight);
            color = mix(tint, vec3(0.88, 0.95, 0.92),
              (1.0 - smoothstep(0.0, 0.4, length(p - vec2(-0.2, 0.25)))) * 0.7);
          #else
            float noise = impactNoise(p * 3.5 + vSeed * 31.0 + vec2(age * 0.2, -age * 0.3));
            float fine = impactNoise(p * 8.0 + vSeed * 13.0);
            alpha = pow(max(0.0, 1.0 - radius * radius), 2.0)
              * smoothstep(0.15, 0.8, noise * 0.75 + fine * 0.25) * 0.36;
            color *= 0.8 + noise * 0.35;
          #endif
          alpha *= vFade;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = `ghost-ship-impact-${kind}`;
    // GPU motion extends beyond the source quad.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  sample(age: number): void {
    this.mesh.visible = age >= 0 && age < this.duration;
    this.mesh.material.uniforms.age!.value = age;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
