import { WEATHER_PARTICLE_LAYER } from '../rendering/renderLayers';
import {
  DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, MeshStandardMaterial, Raycaster, ShaderMaterial, Vector3,
} from 'three';
import { applyShipWetSurface } from './ShipWetSurface';

const VERTEX_SHADER = `
  attribute vec3 contact;
  attribute vec2 timing;
  attribute float splashKind;
  uniform float time;
  varying vec2 vSplashUv;
  varying float vSplashAge;
  varying float vSplashKind;
  void main() {
    float age = min(1.0, fract(time * timing.y + timing.x) * 2.5);
    float radius = 0.008 + age * 0.033;
    vec3 p = contact + vec3(position.x * radius, 0.004, position.y * radius);
    if (splashKind > 0.5) {
      float spread = position.x * (0.012 + age * 0.035);
      float height = 0.008 + sin(age * 3.14159) * 0.045 + position.y * 0.008;
      p = contact + (splashKind < 1.5 ? vec3(spread, height, 0.0) : vec3(0.0, height, spread));
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vSplashUv = position.xy;
    vSplashAge = age;
    vSplashKind = splashKind;
  }
`;
const FRAGMENT_SHADER = `
  uniform float intensity;
  varying vec2 vSplashUv;
  varying float vSplashAge;
  varying float vSplashKind;
  void main() {
    float radius = length(vSplashUv);
    float edge = max(fwidth(radius), 0.035);
    float ring = 1.0 - smoothstep(0.055, 0.055 + edge, abs(radius - 0.7));
    float crown = exp(-radius * radius * 24.0) * (1.0 - smoothstep(0.0, 0.2, vSplashAge));
    float shape = max(ring * 0.32, crown);
    if (vSplashKind > 0.5) {
      float bead = length(vec2((abs(vSplashUv.x) - 0.65) * 4.0, vSplashUv.y));
      shape = (1.0 - smoothstep(0.15, 0.85, bead)) * 0.65;
    }
    float alpha = shape * pow(1.0 - vSplashAge, 2.0) * intensity;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(0.7, 0.82, 0.86, alpha);
  }
`;

function splashGeometry(boat: Group): InstancedBufferGeometry {
  boat.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  const contacts: number[] = [];
  const timing: number[] = [];
  // Bake only exposed, upward-facing timber contacts. No raycasts during frames.
  for (let index = 0; index < 320; index += 1) {
    const x = (index * 0.754877666 % 1 - 0.5) * 3.5;
    const z = (index * 0.569840291 % 1) * 5.4 - 3;
    ray.ray.origin.set(x, 2, z);
    const hit = ray.intersectObject(boat, true)[0];
    if (!hit || !hit.face) continue;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.y < 0.8) continue;
    contacts.push(hit.point.x, hit.point.y, hit.point.z);
    timing.push(index * 0.618033989 % 1, 1.6 + index * 0.414213562 % 1);
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
    -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
    -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
  ], 3));
  geometry.setAttribute('splashKind', new Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2], 1));
  geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 8, 9, 10, 10, 9, 11]);
  geometry.setAttribute('contact', new InstancedBufferAttribute(new Float32Array(contacts), 3));
  geometry.setAttribute('timing', new InstancedBufferAttribute(new Float32Array(timing), 2));
  geometry.instanceCount = contacts.length / 3;
  return geometry;
}

/** Owns splash resources; the boat retains ownership of its timber materials. */
export class BoatRainEffects {
  private readonly wetSurfaces: { value: number }[] = [];
  private readonly splashes: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private intensity = 0;
  private wetness = 0;

  constructor(boat: Group) {
    const materials = new Set<MeshStandardMaterial>();
    boat.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (material instanceof MeshStandardMaterial && material.map !== null) materials.add(material);
      }
    });
    for (const material of materials) this.wetSurfaces.push(applyShipWetSurface(material, 0));
    this.splashes = new Mesh(splashGeometry(boat), new ShaderMaterial({
      vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
      uniforms: { time: { value: 0 }, intensity: { value: 0 } },
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    }));
    this.splashes.name = 'boat-rain-splashes';
    this.splashes.layers.set(WEATHER_PARTICLE_LAYER);
    this.splashes.frustumCulled = false;
    this.splashes.visible = false;
    boat.add(this.splashes);
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity;
    this.splashes.visible = intensity > 0;
    this.splashes.material.uniforms.intensity!.value = intensity;
  }

  update(time: number, delta: number): void {
    const rate = this.intensity > this.wetness ? 1.2 : 0.05;
    const step = Math.max(0, delta) * rate;
    this.wetness += Math.max(-step, Math.min(step, this.intensity - this.wetness));
    for (const uniform of this.wetSurfaces) uniform.value = this.wetness;
    this.splashes.material.uniforms.time!.value = time;
  }

  dispose(): void {
    for (const uniform of this.wetSurfaces) uniform.value = 0;
    this.splashes.removeFromParent();
    this.splashes.geometry.dispose();
    this.splashes.material.dispose();
  }
}
