import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  RingGeometry, Vector3,
} from 'three';
import { createKrakenFoamTexture } from './krakenSkin';

const DROP_CAPACITY = 900;
const HIDDEN_Y = -1000;
const GRAVITY = 9.8;
/** Seconds of fall that each streak shows. */
const STREAK = 0.07;

/** Water that pours off the body, and the churned foam around it. All buffers are fixed. */
export class KrakenWater {
  readonly root = new Group();
  private readonly positions = new Float32Array(DROP_CAPACITY * 3);
  private readonly velocities = new Float32Array(DROP_CAPACITY * 3);
  /** Two vertices per drop: the head and the end of its streak. */
  private readonly streaks = new Float32Array(DROP_CAPACITY * 6);
  private readonly dropGeometry = new BufferGeometry();
  private readonly dropAttribute: BufferAttribute;
  private readonly drops: LineBasicMaterial;
  private readonly foamTexture = createKrakenFoamTexture();
  private readonly foamGeometry = new RingGeometry(3, 14, 72, 6);
  private readonly foamMaterial: MeshBasicMaterial;
  private readonly foam: Mesh;
  private readonly spawn = new Vector3();
  private cursor = 0;
  private pending = 0;
  private seed = 0;

  constructor() {
    this.root.name = 'kraken-water';
    this.positions.fill(HIDDEN_Y);
    this.streaks.fill(HIDDEN_Y);
    this.dropAttribute = new BufferAttribute(this.streaks, 3).setUsage(DynamicDrawUsage);
    this.dropGeometry.setAttribute('position', this.dropAttribute);
    this.drops = new LineBasicMaterial({ color: 0x9fb4b9, transparent: true, opacity: 0.5, depthWrite: false });
    const points = new LineSegments(this.dropGeometry, this.drops);
    points.name = 'kraken-runoff';
    points.frustumCulled = false;
    this.foamGeometry.rotateX(-Math.PI / 2);
    const vertices = this.foamGeometry.getAttribute('position');
    const colors = new Float32Array(vertices.count * 4);
    for (let index = 0; index < vertices.count; index++) {
      const radius = Math.hypot(vertices.getX(index), vertices.getZ(index));
      const alpha = Math.min(1, (radius - 3) / 2.5) * Math.max(0, 1 - (radius - 6) / 8);
      colors.set([1, 1, 1, alpha], index * 4);
    }
    this.foamGeometry.setAttribute('color', new BufferAttribute(colors, 4));
    this.foamTexture.repeat.set(3, 3);
    this.foamMaterial = new MeshBasicMaterial({ color: 0xc4d2d4, alphaMap: this.foamTexture, vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false });
    this.foam = new Mesh(this.foamGeometry, this.foamMaterial);
    this.foam.name = 'kraken-foam';
    this.foam.renderOrder = 1;
    this.root.add(points, this.foam);
  }

  reset(): void {
    this.positions.fill(HIDDEN_Y);
    this.streaks.fill(HIDDEN_Y);
    this.dropAttribute.needsUpdate = true;
    this.pending = 0;
    this.foamMaterial.opacity = 0;
  }

  /**
   * Pour `rate` drops per second from points that `source` writes in root space.
   * `source` returns false when its point is under water.
   */
  update(delta: number, time: number, rate: number, foam: number, surface: number,
    source: (seed: number, target: Vector3) => boolean): void {
    this.foamMaterial.opacity = foam;
    this.foam.position.y = surface + 0.06;
    this.foam.rotation.y = time * 0.02;
    this.foam.scale.setScalar(0.85 + foam * 0.3);
    const dt = Math.min(0.1, Math.max(0, delta));
    this.pending += rate * dt;
    while (this.pending >= 1) {
      this.pending -= 1;
      this.seed = (this.seed + 1) % 100003;
      if (!source(this.seed, this.spawn)) continue;
      const offset = this.cursor * 3;
      this.cursor = (this.cursor + 1) % DROP_CAPACITY;
      const spread = Math.sin(this.seed * 12.9898) * 0.8;
      this.positions[offset] = this.spawn.x + spread * 0.4;
      this.positions[offset + 1] = this.spawn.y;
      this.positions[offset + 2] = this.spawn.z + Math.cos(this.seed * 78.233) * 0.4;
      this.velocities[offset] = spread;
      this.velocities[offset + 1] = -0.5 - Math.abs(Math.cos(this.seed * 4.1)) * 1.5;
      this.velocities[offset + 2] = Math.sin(this.seed * 3.7) * 0.8;
    }
    if (dt === 0) return;
    for (let offset = 0; offset < this.positions.length; offset += 3) {
      if (this.positions[offset + 1] === HIDDEN_Y) continue;
      this.velocities[offset + 1] = this.velocities[offset + 1]! - GRAVITY * dt;
      this.positions[offset] = this.positions[offset]! + this.velocities[offset]! * dt;
      this.positions[offset + 1] = this.positions[offset + 1]! + this.velocities[offset + 1]! * dt;
      this.positions[offset + 2] = this.positions[offset + 2]! + this.velocities[offset + 2]! * dt;
      if (this.positions[offset + 1]! < surface) this.positions[offset + 1] = HIDDEN_Y;
      const streak = offset * 2;
      for (let axis = 0; axis < 3; axis++) {
        this.streaks[streak + axis] = this.positions[offset + axis]!;
        this.streaks[streak + 3 + axis] = this.positions[offset + axis]! - this.velocities[offset + axis]! * STREAK;
      }
    }
    this.dropAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.dropGeometry.dispose();
    this.drops.dispose();
    this.foamGeometry.dispose();
    this.foamTexture.dispose();
    this.foamMaterial.dispose();
    this.root.clear();
  }
}
