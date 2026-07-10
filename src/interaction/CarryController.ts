import { Box3, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';

interface OriginalPlacement {
  parent: Object3D | null;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

interface Flight {
  id: ItemId;
  object: Object3D;
  velocity: Vector3;
  original: OriginalPlacement;
}

export interface FlightResultHandlers {
  onSaved: (id: ItemId) => void;
  onLost: (id: ItemId) => void;
  onLanded: (id: ItemId) => void;
}

export class CarryController {
  private carried: { id: ItemId; object: Object3D; original: OriginalPlacement } | null = null;
  private flight: Flight | null = null;
  private readonly direction = new Vector3();
  private readonly worldPosition = new Vector3();
  private readonly localPosition = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {}

  get busy(): boolean {
    return this.carried !== null || this.flight !== null;
  }

  pickUp(id: ItemId, object: Object3D): boolean {
    if (this.busy) return false;
    this.carried = {
      id,
      object,
      original: {
        parent: object.parent,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      },
    };
    this.camera.add(object);
    object.position.set(0.62, -0.48, -1.15);
    object.rotation.set(-0.15, 0.45, 0.08);
    object.scale.setScalar(0.85);
    return true;
  }

  throw(speed = 7.5): ItemId | null {
    if (!this.carried) return null;
    const { id, object, original } = this.carried;
    this.scene.attach(object);
    this.camera.getWorldDirection(this.direction);
    this.flight = {
      id,
      object,
      velocity: this.direction.multiplyScalar(speed).add(new Vector3(0, 1.5, 0)),
      original,
    };
    this.carried = null;
    return id;
  }

  drop(): ItemId | null {
    return this.throw(1.2);
  }

  update(
    delta: number,
    lifeboatBoxWorld: Box3,
    waterHeight: (x: number, z: number) => number,
    handlers: FlightResultHandlers,
  ): void {
    if (!this.flight) return;
    const flight = this.flight;
    let remaining = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 1) : 0;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      flight.velocity.y -= 9.81 * step;
      flight.object.position.addScaledVector(flight.velocity, step);
      flight.object.getWorldPosition(this.worldPosition);
      if (lifeboatBoxWorld.containsPoint(this.worldPosition)) {
        this.flight = null;
        handlers.onSaved(flight.id);
        return;
      }
      if (
        this.worldPosition.y <=
        waterHeight(this.worldPosition.x, this.worldPosition.z) - 0.25
      ) {
        this.flight = null;
        handlers.onLost(flight.id);
        return;
      }
      const deck = flight.original.parent;
      if (deck?.name === 'sinking-ship') {
        deck.worldToLocal(this.localPosition.copy(this.worldPosition));
        if (
          this.localPosition.y <= 2.35 &&
          Math.abs(this.localPosition.x) < 4.2 &&
          Math.abs(this.localPosition.z) < 10.8
        ) {
          deck.attach(flight.object);
          flight.object.position.y = 2.35;
          flight.object.scale.setScalar(1);
          this.flight = null;
          handlers.onLanded(flight.id);
          return;
        }
      }
      remaining -= step;
    }
  }

  reset(): void {
    const active = this.carried ?? this.flight;
    if (active) {
      const { object, original } = active;
      if (original.parent) original.parent.add(object);
      else object.removeFromParent();
      object.position.copy(original.position);
      object.quaternion.copy(original.quaternion);
      object.scale.copy(original.scale);
    }
    this.carried = null;
    this.flight = null;
  }
}
