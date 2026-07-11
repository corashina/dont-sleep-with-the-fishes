import { Box3, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';

interface OriginalPlacement {
  parent: Object3D | null;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

interface CarriedItem {
  instance: ItemInstance;
  object: Object3D;
  original: OriginalPlacement;
}

interface Flight extends CarriedItem {
  velocity: Vector3;
}

export interface FlightResultHandlers {
  onSaved: (instance: ItemInstance) => void;
  onLost: (instance: ItemInstance) => void;
  onLanded: (instance: ItemInstance) => void;
}

const CARRY_OFFSETS = [
  new Vector3(0.56, -0.48, -1.12),
  new Vector3(0.18, -0.54, -1.02),
  new Vector3(-0.24, -0.50, -1.08),
] as const;

function capturePlacement(object: Object3D): OriginalPlacement {
  return {
    parent: object.parent,
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

export class CarryController {
  private readonly carried: CarriedItem[] = [];
  private flight: Flight | null = null;
  private readonly direction = new Vector3();
  private readonly worldPosition = new Vector3();
  private readonly localPosition = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {}

  get busy(): boolean {
    return this.carried.length > 0 || this.flight !== null;
  }

  get activeInstance(): ItemInstance | null {
    return this.carried.at(-1)?.instance ?? null;
  }

  get flightActive(): boolean {
    return this.flight !== null;
  }

  pickUp(instance: ItemInstance, object: Object3D): boolean {
    if (this.flight !== null) return false;
    this.carried.push({ instance, object, original: capturePlacement(object) });
    this.camera.add(object);
    this.reflowCarried();
    return true;
  }

  throw(speed = 7.5): ItemInstanceId | null {
    if (this.flight !== null) return null;
    const released = this.carried.pop();
    if (!released) return null;
    const { instance, object } = released;
    this.scene.attach(object);
    this.camera.getWorldDirection(this.direction);
    this.flight = {
      ...released,
      velocity: this.direction.multiplyScalar(speed).add(new Vector3(0, 1.5, 0)),
    };
    this.reflowCarried();
    return instance.instanceId;
  }

  drop(): ItemInstanceId | null {
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
        handlers.onSaved(flight.instance);
        return;
      }
      if (
        this.worldPosition.y <=
        waterHeight(this.worldPosition.x, this.worldPosition.z) - 0.25
      ) {
        this.flight = null;
        handlers.onLost(flight.instance);
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
          handlers.onLanded(flight.instance);
          return;
        }
      }
      remaining -= step;
    }
  }

  reset(): void {
    const active = this.flight ? [...this.carried, this.flight] : this.carried;
    active.forEach(({ object, original }) => {
      if (original.parent) original.parent.add(object);
      else object.removeFromParent();
      object.position.copy(original.position);
      object.quaternion.copy(original.quaternion);
      object.scale.copy(original.scale);
    });
    this.carried.length = 0;
    this.flight = null;
  }

  private reflowCarried(): void {
    this.carried.forEach(({ object }, index) => {
      object.position.copy(CARRY_OFFSETS[index] ?? CARRY_OFFSETS[2]);
      object.rotation.set(-0.15, 0.45 - index * 0.2, 0.08);
      object.scale.setScalar(0.72);
    });
  }
}
