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
import { KeyedEventPresentation } from './KeyedEventPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';

const PAD_POSITIONS = Object.freeze([
  [-5.8, 0.27, -2.9], [-4.15, 0.3, -3.15], [-2.65, 0.26, -2.72],
  [-0.95, 0.31, -3.38], [0.72, 0.28, -2.85], [2.38, 0.3, -3.28],
  [4.05, 0.26, -2.78], [5.62, 0.29, -3.42], [-6.35, 0.25, -4.18],
  [-4.88, 0.3, -4.62], [-3.12, 0.27, -4.08], [-1.58, 0.29, -4.82],
  [0.18, 0.25, -4.25], [1.72, 0.31, -4.72], [3.45, 0.27, -4.12],
  [5.08, 0.3, -4.78], [6.42, 0.26, -4.28], [-5.72, 0.28, -5.7],
  [-4.02, 0.25, -5.28], [-2.48, 0.31, -5.92], [-0.82, 0.27, -5.42],
  [0.92, 0.29, -6.02], [2.58, 0.25, -5.5], [4.18, 0.3, -6.08],
  [5.72, 0.27, -5.55], [-4.92, 0.29, -6.82], [-2.92, 0.26, -7.18],
  [-1.05, 0.3, -6.72], [1.02, 0.27, -7.12], [3.02, 0.29, -6.68],
] as const);

export class FlowersPresentation extends KeyedEventPresentation {
  private readonly pads: Group[] = [];
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
      this.basePositions.push(new Vector3(x, y, z));
      this.subject.add(pad);
    });
  }

  protected reset(): void {
    this.subject.position.set(0, 0, 0);
    this.pads.forEach((pad, index) => {
      pad.position.copy(this.basePositions[index]!);
      pad.visible = true;
    });
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'flowers.collect') {
      this.floatPads(time);
      this.moveFirstToDeck(1);
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
      this.moveFirstToDeck(eased);
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
    // The shared model library owns the model resources.
  }

  private floatPads(time: number): void {
    for (let index = 0; index < this.pads.length; index += 1) {
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
    }
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
