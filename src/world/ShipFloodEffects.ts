import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  type Material,
} from 'three';
import type { ShipDangerState } from '../game/shipDanger';
import { disposeResourceSets } from './SceneResources';
import type { LeakAnchor, ShipDangerLayout } from './ShipDangerLayout';

const SPRAY_CAPACITY = 48;

export interface ShipFloodEffectsSnapshot {
  leakCount: number;
  streamCount: number;
  puddleCount: number;
  sprayCapacity: number;
  activeSpray: number;
  flowScale: number;
}

export class ShipFloodEffects {
  readonly root = new Group();
  readonly spray: Points<BufferGeometry, PointsMaterial>;

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly leaks: readonly LeakAnchor[];
  private readonly streams: ShipDangerLayout['streams'];
  private readonly puddles: ShipDangerLayout['puddles'];
  private readonly sprayPositions = new Float32Array(SPRAY_CAPACITY * 3);
  private readonly sprayPhases = new Float32Array(SPRAY_CAPACITY);
  private readonly waterMaterial: MeshStandardMaterial;
  private flowScale = 1;
  private disposed = false;

  constructor(layout: Readonly<ShipDangerLayout>) {
    this.root.name = 'ship-danger-flood-effects';
    this.leaks = layout.leaks;
    this.streams = layout.streams;
    this.puddles = layout.puddles;
    const ribbonGeometry = this.ownGeometry(new PlaneGeometry(1, 1));
    const puddleGeometry = this.ownGeometry(createPuddleGeometry());
    this.waterMaterial = this.ownMaterial(new MeshStandardMaterial({ color: 0x496773, transparent: true, opacity: 0.42, roughness: 0.92, metalness: 0, depthWrite: false }));

    layout.leaks.forEach((anchor) => this.addRibbon('leak', anchor.id, anchor.position, anchor.rotation, anchor.width, anchor.length, ribbonGeometry, this.waterMaterial));
    layout.streams.forEach((anchor) => this.addFloorRibbon('stream', anchor.id, anchor.position, anchor.rotation[2], anchor.size[0], anchor.size[1], ribbonGeometry, this.waterMaterial));
    layout.puddles.forEach((anchor) => {
      const puddle = new Mesh(puddleGeometry, this.waterMaterial);
      puddle.name = `ship-danger-puddle:${anchor.id}`;
      puddle.position.set(...anchor.position);
      puddle.rotation.set(...anchor.rotation);
      puddle.scale.set(anchor.size[0], anchor.size[1], 1);
      this.root.add(puddle);
    });

    const sprayGeometry = this.ownGeometry(new BufferGeometry());
    sprayGeometry.setAttribute('position', new BufferAttribute(this.sprayPositions, 3));
    const sprayMaterial = this.ownMaterial(new PointsMaterial({ color: 0xaecbd0, transparent: true, opacity: 0.7, size: 0.065, sizeAttenuation: true, depthWrite: false }));
    this.spray = new Points(sprayGeometry, sprayMaterial);
    this.spray.name = 'ship-danger-spray';
    this.spray.frustumCulled = false;
    this.root.add(this.spray);
    for (let index = 0; index < SPRAY_CAPACITY; index += 1) {
      const phase = (index % 12) / 12;
      this.sprayPhases[index] = phase;
      this.writeSprayPosition(index, phase);
    }
  }

  update(delta: number, state: Readonly<ShipDangerState>): void {
    if (this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.flowScale = state.waterFlow;
    this.waterMaterial.opacity = 0.42 + 0.08 * (state.waterFlow - 1);
    for (let index = 0; index < SPRAY_CAPACITY; index += 1) {
      const phase = (this.sprayPhases[index]! + step * state.waterFlow) % 1;
      this.sprayPhases[index] = phase;
      this.writeSprayPosition(index, phase);
    }
    this.spray.geometry.getAttribute('position').needsUpdate = true;
  }

  snapshotForTest(): ShipFloodEffectsSnapshot {
    return {
      leakCount: this.leaks.length,
      streamCount: this.streams.length,
      puddleCount: this.puddles.length,
      sprayCapacity: SPRAY_CAPACITY,
      activeSpray: SPRAY_CAPACITY,
      flowScale: this.flowScale,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private addRibbon(kind: string, id: string, position: readonly [number, number, number], rotation: readonly [number, number, number], width: number, length: number, geometry: PlaneGeometry, material: MeshStandardMaterial): void {
    const mesh = new Mesh(geometry, material);
    mesh.name = `ship-danger-${kind}:${id}`;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(width, length, 1);
    this.root.add(mesh);
  }

  private addFloorRibbon(kind: string, id: string, position: readonly [number, number, number], heading: number, width: number, length: number, geometry: PlaneGeometry, material: MeshStandardMaterial): void {
    const mesh = new Mesh(geometry, material);
    mesh.name = `ship-danger-${kind}:${id}`;
    mesh.position.set(...position);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, heading, 0, 'YXZ');
    mesh.scale.set(width, length, 1);
    this.root.add(mesh);
  }

  private writeSprayPosition(index: number, phase: number): void {
    const source = this.leaks[index % this.leaks.length]!;
    const offset = index * 3;
    const fan = ((index % 8) - 3.5) * 0.025;
    this.sprayPositions[offset] = source.position[0] + Math.sin(phase * Math.PI) * fan;
    this.sprayPositions[offset + 1] = source.position[1] - phase * source.length;
    this.sprayPositions[offset + 2] = source.position[2] + Math.cos(index * 1.618034) * 0.035 + phase * 0.09;
  }

  private ownGeometry<T extends BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private ownMaterial<T extends Material>(material: T): T { this.materials.add(material); return material; }
}

function createPuddleGeometry(): BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0, 0.49, 0.04, 0, 0.78, 0.26, 0, 0.94, 0.58, 0, 0.69, 0.86, 0, 0.23, 0.98, 0,
    -0.24, 0.87, 0, -0.7, 0.72, 0, -0.96, 0.31, 0, -0.82, -0.2, 0, -0.41, -0.61, 0, 0.14, -0.73, 0,
  ]);
  const indices: number[] = [];
  for (let index = 1; index < 11; index += 1) indices.push(0, index, index + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
