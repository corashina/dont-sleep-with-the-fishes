import {
  BoxGeometry, Group, Mesh, PlaneGeometry,
  ShaderMaterial, Vector3,
} from 'three';
import { sceneSeaFogUniforms } from '../../world/SeaFogMaterial';

const noise = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.43));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
    mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
    mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float turbulence(vec3 p) {
  return noise3(p) * 0.57 + noise3(p * 2.03 + 8.1) * 0.28
    + noise3(p * 4.07 + 19.3) * 0.15;
}
`;

const vertexShader = /* glsl */ `
varying vec3 vLocal;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uVisibility;
uniform float uStrength;
uniform float uLight;
uniform vec3 uEye;
uniform vec3 uLightDirection;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec3 vLocal;
#include <fog_pars_fragment>
${noise}
// Advected density gives the funnel real depth and irregular, evolving edges.
vec2 cloudDensity(vec3 p) {
  float h = clamp(p.y / 10.5, 0.0, 1.0);
  vec2 bend = vec2(sin(h * 4.7 + uTime * 0.13) * h * 0.8,
    sin(h * 3.1 - uTime * 0.09) * h * 0.55);
  vec2 q = p.xz - bend;
  float radius = 0.28 + h * 0.82 + pow(h, 4.0) * 2.7;
  float radial = length(q);
  float crown = (1.0 - smoothstep(3.0, 5.35, length(p.xz)))
    * exp(-pow((p.y - 10.1) / 0.65, 2.0));
  float spray = (1.0 - smoothstep(0.325, 1.65, length(p.xz)))
    * exp(-pow((p.y - 0.275) / 0.325, 2.0));
  if (radial > radius + 0.45 && crown + spray < 0.005) return vec2(0.0);
  float angle = uTime * (0.48 + (1.0 - h) * 0.5) - p.y * 0.22;
  float c = cos(angle), s = sin(angle);
  vec2 spin = mat2(c, -s, s, c) * q;
  vec3 flow = vec3(spin.x * 2.6, p.y * 2.2 - uTime * 1.25, spin.y * 2.6);
  float billow = turbulence(flow);
  // Fine stretched filaments travel faster than the large cloud lobes.
  float filaments = noise3(vec3(spin.x * 11.0, p.y * 3.0 - uTime * 2.8, spin.y * 11.0));
  float boundary = radius + (billow - 0.5) * 0.72 + (filaments - 0.5) * 0.12;
  float body = 1.0 - smoothstep(boundary - 0.22, boundary + 0.16, radial);
  float density = body * (0.4 + smoothstep(0.2, 0.8, billow) * 1.8)
    * (0.7 + filaments * 0.6) * smoothstep(-0.2, 0.18, p.y);
  density += crown * smoothstep(0.3, 0.7, billow) * 1.2;
  density += spray * smoothstep(0.22, 0.75, billow) * uStrength * 1.6;
  density *= 1.0 - smoothstep(10.55, 11.2, p.y);
  return vec2(density, spray);
}
void main() {
  vec3 ray = normalize(vLocal - uEye);
  // Short steps resolve the fine strands without coarse stippled edges.
  const float stepLength = 0.115;
  vec3 p = vLocal + ray * (0.5 * stepLength);
  vec3 accumulated = vec3(0.0);
  float alpha = 0.0;
  vec3 firstCloud = p;
  bool foundCloud = false;
  for (int i = 0; i < 168; i++) {
    if (p.y < -0.35 || p.y > 11.25 || abs(p.x) > 5.6 || abs(p.z) > 5.6 || alpha > 0.985) break;
    vec2 cloud = cloudDensity(p);
    if (cloud.x > 0.005) {
      // Sample toward the sky light: dense lobes shade the clouds behind them.
      float shadow = cloudDensity(p + uLightDirection * 0.24).x * 0.6
        + cloudDensity(p + uLightDirection * 0.72).x * 1.2;
      float transmission = exp(-shadow * 1.8);
      float forwardLight = pow(max(0.0, dot(ray, uLightDirection)), 4.0) * 0.16;
      vec3 color = vec3(0.032, 0.048, 0.065)
        + vec3(0.43, 0.49, 0.53) * (transmission + forwardLight);
      color = mix(color, vec3(0.24, 0.34, 0.39) + transmission * 0.28, cloud.y * 0.55);
      color *= uLight;
      float stepAlpha = (1.0 - exp(-cloud.x * stepLength * 2.8)) * uVisibility;
      if (!foundCloud && stepAlpha > 0.005) {
        firstCloud = p;
        foundCloud = true;
      }
      accumulated += (1.0 - alpha) * stepAlpha * color;
      alpha += (1.0 - alpha) * stepAlpha;
    }
    p += ray * stepLength;
  }
  if (alpha < 0.005 || !foundCloud) discard;
  // Test the cloud's depth, not the front of its empty bounding box.
  vec4 cloudClip = projectionMatrix * modelViewMatrix * vec4(firstCloud, 1.0);
  gl_FragDepth = cloudClip.z / cloudClip.w * 0.5 + 0.5;
  gl_FragColor = vec4(accumulated / max(alpha, 0.001), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Original, texture-free waterspout. All cloud motion runs on the GPU. */
export class TornadoVortex {
  readonly root = new Group();
  private readonly eye = new Vector3();
  private readonly volumeGeometry = new BoxGeometry(11.2, 11.6, 11.2).translate(0, 5.45, 0);
  private readonly foamGeometry = new PlaneGeometry(4, 4);
  private readonly uniforms = {
    uTime: { value: 0 }, uVisibility: { value: 0 }, uStrength: { value: 0 },
    uEye: { value: this.eye }, uLight: { value: 1 },
    uLightDirection: { value: new Vector3(-0.6, 0.65, 0.5).normalize() },
  };
  private readonly volumeMaterial = new ShaderMaterial({
    uniforms: this.uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false,
  });
  private readonly foamMaterial = new ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uVisibility;
      uniform float uStrength;
      uniform float uLight;
      varying vec2 vUv;
      ${noise}
      void main() {
        vec2 p = (vUv - 0.5) * 8.0;
        float r = length(p), a = atan(p.y, p.x);
        vec3 flow = vec3(cos(a + uTime * 0.65) * r, sin(a + uTime * 0.65) * r, uTime * 0.3);
        float n = turbulence(flow * 3.0);
        float ring = smoothstep(0.45, 1.0, r) * (1.0 - smoothstep(1.6, 3.7, r));
        float streak = sin(r * 15.0 + a * 6.0 - uTime * 3.0 + n * 7.0) * 0.5 + 0.5;
        float alpha = ring * smoothstep(0.43, 0.76, n) * (0.35 + streak * 0.65);
        gl_FragColor = vec4(vec3(0.56, 0.7, 0.71) * uLight, alpha * uVisibility * uStrength * 0.75);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false,
  });
  private disposed = false;

  constructor() {
    this.root.name = 'tornado-vortex';
    const volume = new Mesh(this.volumeGeometry, this.volumeMaterial);
    volume.name = 'tornado-cloud-volume';
    volume.renderOrder = 3;
    volume.onBeforeRender = (_renderer, scene, camera) => {
      camera.getWorldPosition(this.eye);
      volume.worldToLocal(this.eye);
      const sky = sceneSeaFogUniforms.get(scene);
      this.uniforms.uLight.value = sky ? 0.24 + 0.76 * sky.uSunVisibility!.value : 1;
      if (sky) {
        const direction = sky[sky.uMoonVisibility!.value > 0 ? 'uMoonDirection' : 'uSunDirection']!.value;
        this.uniforms.uLightDirection.value.copy(direction).normalize();
      }
    };
    const foam = new Mesh(this.foamGeometry, this.foamMaterial);
    foam.name = 'tornado-surface-foam';
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.06;
    foam.renderOrder = 2;
    foam.onBeforeRender = volume.onBeforeRender;
    this.root.add(foam, volume);
    this.root.visible = false;
  }

  update(time: number, visibility: number, strength: number, scale: number): void {
    if (this.disposed) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uVisibility.value = visibility;
    this.uniforms.uStrength.value = strength;
    this.root.scale.setScalar(scale);
    this.root.visible = visibility > 0.012;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.volumeGeometry.dispose();
    this.foamGeometry.dispose();
    this.volumeMaterial.dispose();
    this.foamMaterial.dispose();
  }
}
