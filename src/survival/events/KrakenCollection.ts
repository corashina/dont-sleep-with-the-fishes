import { Group, Vector3 } from 'three';
import type { BoatHeartDisplay } from '../BoatHeartDisplay';
import { HEART_PIECE_IDS } from '../heartOfTheSea';
import type { KrakenGeometry } from './krakenGeometry';
import { KRAKEN_GRAB_SECONDS, krakenEase } from './krakenChoreography';

const GRIP_DEPTHS = [0.093, 0.082, 0.042] as const;

/** Transfers the actual basket models only after the curling tip makes contact. */
export class KrakenCollection {
  readonly carrier = new Group();
  private readonly gathered = new Group();
  private readonly target = new Vector3();
  private readonly pickup = new Vector3();
  private readonly home = new Vector3();
  private readonly center = new Vector3();
  private readonly base = new Vector3();
  private readonly scratch = new Vector3();
  private taken = 0;
  private deposited = 0;

  constructor(private readonly geometry: KrakenGeometry, private readonly display: BoatHeartDisplay) {
    this.carrier.name = 'kraken-grip';
    this.gathered.name = 'kraken-collected-pieces';
    geometry.root.add(this.gathered);
  }

  begin(): void {
    this.taken = 0;
    this.deposited = 0;
    this.carrier.rotation.set(0, 0, 0);
    this.display.beginCollection();
  }

  update(seconds: number): void {
    this.geometry.root.updateWorldMatrix(true, false);
    this.home.set(3.7, -1.45, 3);
    this.geometry.root.localToWorld(this.home);
    const index = Math.min(2, Math.floor(Math.max(0, seconds) / KRAKEN_GRAB_SECONDS));
    const progress = Math.min(1, Math.max(0, seconds / KRAKEN_GRAB_SECONDS - index));
    this.settleEarlierPieces(index);
    const id = HEART_PIECE_IDS[index]!;
    const piece = this.display.piece(id);
    if (this.taken <= index) piece.getWorldPosition(this.pickup);
    this.target.copy(this.pickup);
    let reach = 0;
    if (seconds < 0 || seconds >= KRAKEN_GRAB_SECONDS * 3) {
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
    if (seconds >= 0 && progress >= 0.5 && this.taken <= index) {
      // A large time step still attaches at the saved pickup pose, then moves with the grip.
      this.carrier.position.copy(this.pickup);
      this.carrier.rotation.z = 0;
      this.carrier.updateWorldMatrix(true, false);
      this.display.takePiece(id, this.carrier);
      this.taken = index + 1;
      this.carrier.position.copy(this.center);
    }
    if (progress >= 0.96 && this.deposited <= index) this.deposit(index);
    const close = seconds < 0 ? 0 : krakenEase((progress - 0.37) / 0.13);
    this.poseArm(reach, close, GRIP_DEPTHS[index]!);
  }

  private settleEarlierPieces(index: number): void {
    while (this.deposited < index) this.deposit(this.deposited);
  }

  private deposit(index: number): void {
    const piece = this.display.piece(HEART_PIECE_IDS[index]!);
    this.gathered.add(piece);
    piece.position.set((index - 1) * 0.2, -1.4, 2.7);
    piece.visible = false;
    this.deposited = index + 1;
    this.taken = Math.max(this.taken, index + 1);
  }

  private poseArm(reach: number, close: number, depth: number): void {
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
    // The coil lies in a vertical plane, clear of the adjacent pieces and basket floor.
    for (let index = 5; index < points.length; index++) {
      const t = (index - 5) / (points.length - 6);
      const angle = t * (1.7 + close * 3.7);
      const radiusY = 0.17 - close * 0.095;
      const radiusZ = 0.18 + (depth - 0.18) * close;
      points[index]!.set(this.center.x + Math.sin(t * Math.PI) * 0.008,
        this.center.y + (depth < 0.05 ? 0.08 : 0.035) + Math.cos(angle) * radiusY,
        this.center.z + Math.sin(angle) * radiusZ);
      root.worldToLocal(points[index]!);
    }
    arm.update();
  }

  end(returned: boolean): void {
    this.display.endCollection(returned);
    this.carrier.clear();
    this.gathered.clear();
  }
}
