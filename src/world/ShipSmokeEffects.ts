import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  ShaderMaterial,
  type Material,
} from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { disposeResourceSets } from './SceneResources';
import type { DangerAnchor } from './ShipDangerLayout';

const SMOKE_CAPACITY = 64;

export interface ShipSmokeEffectsSnapshot {
  sourceCount: number;
  smokeCapacity: number;
  activeSmoke: number;
}

export class ShipSmokeEffects {
  readonly root = new Group();
  readonly smoke: Points<BufferGeometry, ShaderMaterial>;

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly positions = new Float32Array(SMOKE_CAPACITY * 3);
  private readonly opacities = new Float32Array(SMOKE_CAPACITY);
  private readonly sizes = new Float32Array(SMOKE_CAPACITY);
  private readonly phases = new Float32Array(SMOKE_CAPACITY);
  private elapsed = 0;
  private disposed = false;

  constructor(private readonly sources: readonly DangerAnchor[]) {
    if (sources.length === 0) throw new Error('Ship smoke requires at least one source');
    this.root.name = 'ship-danger-smoke-effects';
    const geometry = this.ownGeometry(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aOpacity', new BufferAttribute(this.opacities, 1));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    const material = this.ownMaterial(new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new Color(0x303236) },
        uOpacity: { value: 0.82 },
        uSize: { value: 1.2 },
      },
      vertexShader: 'attribute float aOpacity; attribute float aSize; varying float vOpacity; void main() { vOpacity = aOpacity; vec4 viewPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 100.0 / -viewPosition.z; gl_Position = projectionMatrix * viewPosition; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vOpacity; void main() { float edge = 1.0 - smoothstep(0.58, 1.0, length(gl_PointCoord - vec2(0.5)) * 2.0); gl_FragColor = vec4(uColor, uOpacity * vOpacity * edge); }',
    }));
    this.smoke = new Points(geometry, material);
    this.smoke.name = 'ship-danger-smoke';
    this.smoke.frustumCulled = false;
    this.root.add(this.smoke);
    this.prime();
  }

  update(delta: number, state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.elapsed += step;
    for (let index = 0; index < SMOKE_CAPACITY; index += 1) {
      const phase = (this.phases[index]! + 0.11 * state.smokeDensity * step) % 1;
      this.phases[index] = phase;
      this.writePosition(index, phase, state.smokeDensity);
      this.opacities[index] = (0.58 + state.smokeDensity * 0.08) * (1 - phase * 0.45);
      this.sizes[index] = (0.72 + phase * 1.28) * state.smokeDensity;
    }
    this.smoke.geometry.getAttribute('position').needsUpdate = true;
    this.smoke.geometry.getAttribute('aOpacity').needsUpdate = true;
    this.smoke.geometry.getAttribute('aSize').needsUpdate = true;
  }

  snapshotForTest(): ShipSmokeEffectsSnapshot {
    return {
      sourceCount: this.sources.length,
      smokeCapacity: SMOKE_CAPACITY,
      activeSmoke: SMOKE_CAPACITY,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private prime(): void {
    for (let index = 0; index < SMOKE_CAPACITY; index += 1) {
      const phase = (index % 11) / 11;
      this.phases[index] = phase;
      this.writePosition(index, phase, 1);
      this.opacities[index] = 0.52 * (1 - phase * 0.45);
      this.sizes[index] = 0.7 + phase * 1.25;
    }
  }

  private writePosition(index: number, phase: number, density: number): void {
    const source = this.sources[index % this.sources.length]!;
    const offset = index * 3;
    this.positions[offset] = source.position[0]
      + Math.sin(index * 2.399963 + this.elapsed * 0.55) * (0.16 + phase * 0.28 * density);
    this.positions[offset + 1] = source.position[1] + phase * 2.25 * density;
    this.positions[offset + 2] = source.position[2]
      + Math.cos(index * 1.618034 + this.elapsed * 0.38) * (0.13 + phase * 0.18 * density);
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
}
