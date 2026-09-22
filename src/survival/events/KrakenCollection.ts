import { Group, Vector3 } from 'three';
import type { BoatHeartDisplay } from '../BoatHeartDisplay';
import type { KrakenGeometry } from './krakenGeometry';
import { KRAKEN_COLLECTION_SECONDS, krakenEase } from './krakenChoreography';

/** Lifts the basket and its contents together after the tentacle curls around it. */
export class KrakenCollection {
  readonly carrier = new Group();
  private readonly target = new Vector3();
  private readonly pickup = new Vector3();
  private readonly home = new Vector3();
  private readonly center = new Vector3();
  private readonly base = new Vector3();
  private readonly scratch = new Vector3();
  private taken = false;

  constructor(private readonly geometry: KrakenGeometry, private readonly display: BoatHeartDisplay) {
    this.carrier.name = 'kraken-grip';
  }

  begin(): void {
    this.taken = false;
    this.carrier.rotation.set(0, 0, 0);
    this.display.beginCollection();
  }

  update(seconds: number): void {
    this.geometry.root.updateWorldMatrix(true, false);
    this.home.set(3.7, 0.1, 3);
    this.geometry.root.localToWorld(this.home);
    const progress = Math.min(1, Math.max(0, seconds / KRAKEN_COLLECTION_SECONDS));
    if (!this.taken) this.display.root.getWorldPosition(this.pickup);
    this.target.copy(this.pickup);
    let reach = 0;
    if (seconds < 0 || seconds >= KRAKEN_COLLECTION_SECONDS) {
      this.center.copy(this.home);
    } else if (progress < 0.35) {
      reach = krakenEase(progress / 0.35);
      this.target.y += 0.34;
      this.center.lerpVectors(this.home, this.target, reach);
    } else if (progress < 0.5) {
      reach = 1;
      this.center.copy(this.target);
      this.center.y += 0.34 * (1 - krakenEase((progress - 0.35) / 0.15));
    } else {
      const retract = krakenEase((progress - 0.64) / 0.32);
      reach = 1 - retract;
      this.target.y += krakenEase((progress - 0.5) / 0.14) * 0.6;
      this.center.lerpVectors(this.target, this.home, retract);
    }
    this.carrier.position.copy(this.center);
    this.carrier.rotation.z = Math.sin(krakenEase((progress - 0.5) / 0.46) * Math.PI) * 0.16;
    this.carrier.updateWorldMatrix(true, false);
    if (seconds >= 0 && progress >= 0.5 && !this.taken) {
      // A large time step still attaches at the saved pickup pose, then moves with the grip.
      this.carrier.position.copy(this.pickup);
      this.carrier.rotation.z = 0;
      this.carrier.updateWorldMatrix(true, false);
      this.display.takeBasket(this.carrier);
      this.taken = true;
      this.carrier.position.copy(this.center);
    }
    const close = seconds < 0 ? 0 : krakenEase((progress - 0.37) / 0.13);
    this.poseArm(reach, close);
  }

  private poseArm(reach: number, close: number): void {
    const arm = this.geometry.collector;
    const root = this.geometry.root;
    const points = arm.points;
    points[0]!.set(3.7, -1.1, -0.4);
    points[1]!.set(5.3, -0.55, 1.5);
    this.base.copy(points[1]!);
    root.localToWorld(this.base);
    this.scratch.lerpVectors(this.base, this.center, 0.52);
    this.scratch.y += reach;
    points[2]!.copy(this.scratch);
    root.worldToLocal(points[2]!);
    points[3]!.copy(this.center).add(this.scratch.set(0.02, 0.45, -0.55));
    root.worldToLocal(points[3]!);
    points[4]!.copy(this.center).add(this.scratch.set(0, 0.23, -0.16));
    root.worldToLocal(points[4]!);
    // Wrap outside the basket walls and keep the tip clear of the bench.
    for (let index = 5; index < points.length; index++) {
      const t = (index - 5) / (points.length - 6);
      const angle = -Math.PI / 2 + t * (1.7 + close * 3.7);
      const radiusX = 0.31 - close * 0.065;
      const radiusZ = 0.26 - close * 0.065;
      points[index]!.set(this.center.x + Math.cos(angle) * radiusX,
        this.center.y + 0.105 + t * 0.045,
        this.center.z + Math.sin(angle) * radiusZ);
      root.worldToLocal(points[index]!);
    }
    arm.update();
  }

  end(returned: boolean): void {
    this.display.endCollection(returned);
    this.carrier.clear();
  }
}
