import {
  Group,
  Object3D,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import type { EventNetCatch } from './EventItemUseController';
import { eventItemMotionProfile } from './eventItemMotionProfile';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';

const PAD_POSITIONS = Object.freeze([
  [-8, 0.27, -4.4], [-5.2, 0.3, -4.55], [-2.4, 0.26, -4.32],
  [2.2, 0.31, -4.62], [5.2, 0.28, -4.38], [8.1, 0.3, -4.58],
  [-9, 0.26, -5.92], [-6, 0.29, -6.12], [-3, 0.25, -5.78],
  [0.2, 0.3, -6.18], [3.4, 0.27, -5.84], [6.5, 0.29, -6.22],
  [9.2, 0.25, -5.96], [-8.1, 0.31, -7.55], [-4.9, 0.27, -7.34],
  [-1.6, 0.3, -7.72], [1.8, 0.26, -7.4], [5.1, 0.29, -7.78],
  [8.4, 0.25, -7.48], [-9.4, 0.28, -9.22], [-6.1, 0.25, -8.94],
  [-2.8, 0.31, -9.38], [0.8, 0.27, -9.04], [4.5, 0.29, -9.42],
  [8, 0.26, -9.1], [-7.9, 0.29, -10.92], [-4.2, 0.26, -11.24],
  [-0.5, 0.3, -10.86], [3.3, 0.27, -11.18], [7.1, 0.29, -10.8],
] as const);
const PAD_SPREAD_X = 1.15;
const PAD_SPREAD_Z = 1.3;
const PAD_FRONT_Z = -4.2;

export class FlowersPresentation extends KeyedEventPresentation {
  private readonly pads: Group[] = [];
  private readonly scoopTarget = new Object3D();
  private caught = false;
  readonly netCatch: EventNetCatch = {
    capture: (net) => this.captureInNet(net),
    release: () => this.releaseFromNet(),
  };
  private readonly basePositions: Vector3[] = [];
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(models: SurvivalEventModels, private readonly deckTarget: Object3D) {
    super('flowers-presentation');
    this.subject.name = 'event-prop:flowers';
    PAD_POSITIONS.forEach(([x, y, z], index) => {
      const pad = new Group();
      pad.name = `flowers:pad:${index}`;
      pad.add(models.clone('flowers'));
      pad.scale.setScalar(0.76 + ((index * 7) % 9) * 0.045);
      pad.rotation.y = ((index * 11) % 17) * 0.37;
      this.pads.push(pad);
      this.basePositions.push(new Vector3(
        x * PAD_SPREAD_X,
        y,
        PAD_FRONT_Z + (z - PAD_FRONT_Z) * PAD_SPREAD_Z,
      ));
      this.subject.add(pad);
    });
    // Keep one small flower within reach beside the boat.
    this.basePositions[0]!.set(2.8, 0.27, 0.55);
    this.scoopTarget.name = 'flowers-scoop-target';
    this.subject.add(this.scoopTarget);
  }

  itemAimTarget(): Object3D | null {
    return super.itemAimTarget() === null ? null : this.scoopTarget;
  }

  protected reset(): void {
    this.caught = false;
    this.subject.position.set(0, 0, 0);
    this.pads.forEach((pad, index) => {
      this.subject.add(pad);
      pad.scale.setScalar(index === 0 ? 0.2 : 0.76 + ((index * 7) % 9) * 0.045);
      pad.rotation.set(0, ((index * 11) % 17) * 0.37, 0);
      pad.position.copy(this.basePositions[index]!);
      pad.visible = true;
    });
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'flowers.collect') {
      this.floatPads(time);
      if (!this.caught) this.moveFirstToDeck(1);
      return;
    }
    if (this.settledKind === 'flowers.drift') return;
    this.floatPads(time);
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    if (kind === 'reveal') {
      this.floatPads(time);
    } else if (kind === 'flowers.collect') {
      this.floatPads(time);
      if (!this.caught) this.moveFirstToDeck(eased);
    } else if (kind === 'flowers.drift') {
      this.floatPads(time);
      this.subject.position.x = -eased * 1.4;
      this.subject.position.z = eased * 2.2;
      this.subject.position.y = -eased * 0.22;
    }
  }

  protected finishAnimation(kind: string): void {
    if (kind === 'flowers.drift') this.root.visible = false;
  }

  protected disposeOwned(): void {
    // Restore the flower from the boat before removing this presentation.
    this.subject.add(this.pads[0]!);
  }

  private floatPads(time: number): void {
    for (let index = 0; index < this.pads.length; index += 1) {
      if (index === 0 && this.caught) continue;
      const pad = this.pads[index]!;
      const base = this.basePositions[index]!;
      sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time, base.x, base.z, 1);
      pad.position.set(
        base.x,
        base.y + this.wave.height * 0.28,
        base.z,
      );
      pad.rotation.z = -this.wave.normal.x * 0.09;
      pad.rotation.x = this.wave.normal.z * 0.09;
      if (index === 0) this.scoopTarget.position.copy(pad.position);
    }
  }

  private captureInNet(net: Object3D): void {
    if (this.caught) return;
    this.caught = true;
    const pad = this.pads[0]!;
    net.attach(pad);
    pad.position.set(...eventItemMotionProfile('fishingNet').actionOrigin);
    pad.rotation.set(0, 0, 0);
  }

  private releaseFromNet(): void {
    if (!this.caught) return;
    // Leave the flower inside the stored net and follow the boat's motion.
    (this.deckTarget.parent ?? this.subject).attach(this.pads[0]!);
  }

  private moveFirstToDeck(progress: number): void {
    const pad = this.pads[0]!;
    const base = this.basePositions[0]!;
    this.deckTarget.getWorldPosition(this.target);
    this.root.worldToLocal(this.target);
    pad.position.set(
      base.x + (this.target.x - base.x) * progress,
      base.y + (this.target.y - base.y) * progress,
      base.z + (this.target.z - base.z) * progress,
    );
  }
}
