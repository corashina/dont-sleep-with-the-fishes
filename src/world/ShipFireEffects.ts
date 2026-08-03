import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Points,
  ShaderMaterial,
  type Material,
} from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { disposeResourceSets } from './SceneResources';
import type { DangerAnchor, FireAnchor } from './ShipDangerLayout';

const SMOKE_CAPACITY = 64;
const EMBER_CAPACITY = 36;

export interface ShipFireEffectsSnapshot {
  fireCount: number;
  smokeCapacity: number;
  emberCapacity: number;
  activeSmoke: number;
  activeEmbers: number;
}

export class ShipFireEffects {
  readonly root = new Group();
  readonly smoke: Points<BufferGeometry, ShaderMaterial>;
  readonly embers: Points<BufferGeometry, ShaderMaterial>;

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly flames: Mesh[] = [];
  private readonly lights: PointLight[] = [];
  private readonly flameScales: number[] = [];
  private readonly smokePositions = new Float32Array(SMOKE_CAPACITY * 3);
  private readonly smokeOpacities = new Float32Array(SMOKE_CAPACITY);
  private readonly smokeSizes = new Float32Array(SMOKE_CAPACITY);
  private readonly smokePhases = new Float32Array(SMOKE_CAPACITY);
  private readonly emberPositions = new Float32Array(EMBER_CAPACITY * 3);
  private readonly emberOpacities = new Float32Array(EMBER_CAPACITY);
  private readonly emberSizes = new Float32Array(EMBER_CAPACITY);
  private readonly emberPhases = new Float32Array(EMBER_CAPACITY);
  private readonly smokeSources: readonly DangerAnchor[];
  private readonly fireSources: readonly FireAnchor[];
  private elapsed = 0;
  private disposed = false;

  constructor(fires: readonly FireAnchor[], smokeOutlets: readonly DangerAnchor[]) {
    this.root.name = 'ship-danger-fire-effects';
    this.fireSources = fires;
    this.smokeSources = smokeOutlets;

    const flameGeometry = this.ownGeometry(new CylinderGeometry(0.12, 0.42, 1, 7, 1, false));
    const yellow = this.ownMaterial(new MeshStandardMaterial({ color: 0xffce54, emissive: 0xff9d20, emissiveIntensity: 1.5, roughness: 0.66 }));
    const orange = this.ownMaterial(new MeshStandardMaterial({ color: 0xff6b1e, emissive: 0xf3420f, emissiveIntensity: 1.3, roughness: 0.7 }));
    const red = this.ownMaterial(new MeshStandardMaterial({ color: 0x9f2217, emissive: 0x7e130d, emissiveIntensity: 0.95, roughness: 0.76 }));
    const layers = [yellow, orange, red] as const;

    fires.forEach((anchor) => {
      const fire = new Group();
      fire.name = `ship-danger-fire:${anchor.id}`;
      fire.position.set(...anchor.position);
      fire.rotation.set(...anchor.rotation);
      for (let index = 0; index < layers.length; index += 1) {
        const flame = new Mesh(flameGeometry, layers[index]!);
        const layerScale = anchor.scale * (1 - index * 0.18);
        flame.name = `ship-danger-flame:${anchor.id}:${index + 1}`;
        flame.scale.set(layerScale * (0.72 + index * 0.08), layerScale * (0.82 + index * 0.1), layerScale * (0.72 + index * 0.08));
        flame.position.set((index - 1) * 0.11 * anchor.scale, 0.42 * layerScale, (index % 2 === 0 ? 1 : -1) * 0.06 * anchor.scale);
        flame.rotation.y = index * 0.72;
        this.flames.push(flame);
        this.flameScales.push(layerScale);
        fire.add(flame);
      }
      const light = new PointLight(0xff6b1e, 1.2 * anchor.scale, 4.4, 2);
      light.name = `ship-danger-fire-light:${anchor.id}`;
      light.castShadow = false;
      light.position.y = 0.7 * anchor.scale;
      this.lights.push(light);
      fire.add(light);
      this.root.add(fire);
    });

    this.smoke = this.createParticlePool('ship-danger-smoke', this.smokePositions, this.smokeOpacities, this.smokeSizes, 0x303236, 0.82, 1.2);
    this.embers = this.createParticlePool('ship-danger-embers', this.emberPositions, this.emberOpacities, this.emberSizes, 0xff8527, 0.95, 0.28);
    this.root.add(this.smoke, this.embers);
    this.primeSmoke();
    this.primeEmbers();
  }

  update(delta: number, state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.elapsed += step;
    this.updateFlames(state.fireIntensity);
    this.updateSmoke(step, state.smokeDensity);
    this.updateEmbers(step, state.fireIntensity);
  }

  snapshotForTest(): ShipFireEffectsSnapshot {
    return {
      fireCount: this.lights.length,
      smokeCapacity: SMOKE_CAPACITY,
      emberCapacity: EMBER_CAPACITY,
      activeSmoke: SMOKE_CAPACITY,
      activeEmbers: EMBER_CAPACITY,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.flames.length = 0;
    this.lights.length = 0;
    this.root.clear();
  }

  private createParticlePool(name: string, positions: Float32Array, opacities: Float32Array, sizes: Float32Array, color: number, opacity: number, size: number): Points<BufferGeometry, ShaderMaterial> {
    const geometry = this.ownGeometry(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aOpacity', new BufferAttribute(opacities, 1));
    geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    const material = this.ownMaterial(new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity }, uSize: { value: size } },
      vertexShader: 'attribute float aOpacity; attribute float aSize; varying float vOpacity; void main() { vOpacity = aOpacity; vec4 viewPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 100.0 / -viewPosition.z; gl_Position = projectionMatrix * viewPosition; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vOpacity; void main() { float edge = 1.0 - smoothstep(0.58, 1.0, length(gl_PointCoord - vec2(0.5)) * 2.0); gl_FragColor = vec4(uColor, uOpacity * vOpacity * edge); }',
    }));
    const points = new Points(geometry, material);
    points.name = name;
    points.frustumCulled = false;
    return points;
  }

  private primeSmoke(): void {
    for (let index = 0; index < SMOKE_CAPACITY; index += 1) {
      const source = this.smokeSources[index % this.smokeSources.length]!;
      const age = (index % 11) / 11;
      const offset = index * 3;
      this.smokePositions[offset] = source.position[0] + Math.sin(index * 2.399963) * 0.16;
      this.smokePositions[offset + 1] = source.position[1] + age * 2.2;
      this.smokePositions[offset + 2] = source.position[2] + Math.cos(index * 1.618034) * 0.13;
      this.smokePhases[index] = age;
      this.smokeOpacities[index] = 0.52 * (1 - age * 0.45);
      this.smokeSizes[index] = 0.7 + age * 1.25;
    }
  }

  private primeEmbers(): void {
    for (let index = 0; index < EMBER_CAPACITY; index += 1) {
      const source = this.fireSources[index % this.fireSources.length]!;
      const phase = (index % 9) / 9;
      this.emberPhases[index] = phase;
      this.writeEmberPosition(index, phase);
      this.emberOpacities[index] = 0.48 + (1 - phase) * 0.42;
      this.emberSizes[index] = 0.09 + (index % 4) * 0.025;
    }
  }

  private updateFlames(intensity: number): void {
    for (let index = 0; index < this.flames.length; index += 1) {
      const flicker = 0.9 + Math.sin(this.elapsed * 13 + index * 1.73) * 0.1;
      const scale = this.flameScales[index]! * flicker * intensity;
      this.flames[index]!.scale.set(scale * 0.82, scale, scale * 0.82);
    }
    for (let index = 0; index < this.lights.length; index += 1) {
      this.lights[index]!.intensity = (1.05 + Math.sin(this.elapsed * 17 + index) * 0.18) * intensity;
    }
  }

  private updateSmoke(step: number, density: number): void {
    for (let index = 0; index < SMOKE_CAPACITY; index += 1) {
      const phase = (this.smokePhases[index]! + 0.11 * density * step) % 1;
      this.smokePhases[index] = phase;
      const source = this.smokeSources[index % this.smokeSources.length]!;
      const offset = index * 3;
      this.smokePositions[offset] = source.position[0] + Math.sin(index * 2.399963 + this.elapsed * 0.55) * (0.16 + phase * 0.28 * density);
      this.smokePositions[offset + 1] = source.position[1] + phase * 2.25 * density;
      this.smokePositions[offset + 2] = source.position[2] + Math.cos(index * 1.618034 + this.elapsed * 0.38) * (0.13 + phase * 0.18 * density);
      this.smokeOpacities[index] = (0.58 + density * 0.08) * (1 - phase * 0.45);
      this.smokeSizes[index] = (0.72 + phase * 1.28) * density;
    }
    this.smoke.geometry.getAttribute('position').needsUpdate = true;
    this.smoke.geometry.getAttribute('aOpacity').needsUpdate = true;
    this.smoke.geometry.getAttribute('aSize').needsUpdate = true;
  }

  private updateEmbers(step: number, intensity: number): void {
    for (let index = 0; index < EMBER_CAPACITY; index += 1) {
      const phase = (this.emberPhases[index]! + (0.16 + (index % 3) * 0.02) * intensity * step) % 1;
      this.emberPhases[index] = phase;
      this.writeEmberPosition(index, phase);
      this.emberOpacities[index] = (0.48 + (1 - phase) * 0.42) * intensity;
    }
    this.embers.geometry.getAttribute('position').needsUpdate = true;
    this.embers.geometry.getAttribute('aOpacity').needsUpdate = true;
  }

  private writeEmberPosition(index: number, phase: number): void {
    const source = this.fireSources[index % this.fireSources.length]!;
    const offset = index * 3;
    this.emberPositions[offset] = source.position[0] + Math.sin(index * 1.618034 + phase * 6.283185) * 0.34 * source.scale;
    this.emberPositions[offset + 1] = source.position[1] + 0.28 + phase * 1.25 * source.scale;
    this.emberPositions[offset + 2] = source.position[2] + Math.cos(index * 2.399963 + phase * 6.283185) * 0.26 * source.scale;
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private ownMaterial<T extends Material>(material: T): T { this.materials.add(material); return material; }
}
