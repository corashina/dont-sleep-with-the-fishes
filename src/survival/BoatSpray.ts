import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

export const BOAT_SPRAY_CAPACITY = 24;
const INACTIVE_Y = -1000;

export class BoatSpray {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  private readonly positions = new Float32Array(BOAT_SPRAY_CAPACITY * 3);
  private readonly velocities = new Float32Array(BOAT_SPRAY_CAPACITY * 3);
  private readonly life = new Float32Array(BOAT_SPRAY_CAPACITY);
  private cursor = 0;

  constructor() {
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      this.positions[index * 3 + 1] = INACTIVE_Y;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const material = new PointsMaterial({
      color: new Color(0xd8e1dc),
      size: 0.065,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.name = 'survival-bow-spray';
    this.points.frustumCulled = false;
  }

  emit(origin: Vector3, intensity: number): void {
    const strength = Math.min(1, Math.max(0, intensity));
    const count = 3 + Math.floor(strength * 5);
    for (let burstIndex = 0; burstIndex < count; burstIndex += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % BOAT_SPRAY_CAPACITY;
      const offset = index * 3;
      const phase = index * 2.399963 + burstIndex * 0.71;
      const radialSpeed = 0.22 + strength * 0.34;
      this.positions[offset] = origin.x;
      this.positions[offset + 1] = origin.y;
      this.positions[offset + 2] = origin.z;
      this.velocities[offset] = Math.cos(phase) * radialSpeed;
      this.velocities[offset + 1] = 0.45 + strength * 0.65;
      this.velocities[offset + 2] = Math.sin(phase) * radialSpeed - 0.16;
      this.life[index] = 0.28 + (index % 5) * 0.035 + strength * 0.12;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  update(delta: number): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    if (dt === 0) return;
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      if (this.life[index]! <= 0) continue;
      const offset = index * 3;
      this.life[index] = Math.max(0, this.life[index]! - dt);
      if (this.life[index] === 0) {
        this.positions[offset + 1] = INACTIVE_Y;
        continue;
      }
      this.velocities[offset + 1] = this.velocities[offset + 1]! - 2.4 * dt;
      this.positions[offset] = this.positions[offset]! + this.velocities[offset]! * dt;
      this.positions[offset + 1] = this.positions[offset + 1]! + this.velocities[offset + 1]! * dt;
      this.positions[offset + 2] = this.positions[offset + 2]! + this.velocities[offset + 2]! * dt;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.life.fill(0);
    for (let index = 0; index < BOAT_SPRAY_CAPACITY; index += 1) {
      this.positions[index * 3 + 1] = INACTIVE_Y;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  activeCount(): number {
    let active = 0;
    for (const remaining of this.life) if (remaining > 0) active += 1;
    return active;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
