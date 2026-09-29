import {
  Group,
  DynamicDrawUsage,
  Object3D,
  Vector3,
  type InstancedMesh,
  type BufferGeometry,
  type ShaderMaterial,
} from 'three';
import type { WaveSample } from '../ocean/WaveField';
import type { DriftingWater } from './DriftingWaveMotion';
import type { EventItemCatch } from './EventItemUseController';
import type { ItemId } from '../game/ItemState';
import { eventItemMotionProfile } from './eventItemMotionProfile';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import { JellyfishModels } from './JellyfishModels';
import { JellyfishBackground } from './JellyfishBackground';

const JELLYFISH_POSITIONS = Object.freeze([
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
const JELLYFISH_SPREAD_X = 1.5;
const JELLYFISH_SPREAD_Z = 1.7;

export class JellyfishPresentation extends KeyedEventPresentation {
  private readonly jellyfishModels = new JellyfishModels();
  private readonly background: JellyfishBackground;
  private readonly jellyfish: InstancedMesh<BufferGeometry, ShaderMaterial>[] = [];
  private readonly instance = new Object3D();
  private readonly scoopTarget = new Object3D();
  private readonly brain: Group;
  private caught = false;
  readonly itemCatch: EventItemCatch = {
    capture: (item, itemId) => this.captureInItem(item, itemId),
    release: () => this.releaseFromItem(),
  };
  private readonly basePositions: Vector3[] = [];
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(models: SurvivalEventModels, private readonly deckTarget: Object3D, private readonly water: DriftingWater) {
    super('flowers-presentation');
    this.background = new JellyfishBackground(this.jellyfishModels, water);
    this.subject.name = 'event-prop:flowers';
    this.brain = models.clone('flowersHeart');
    this.brain.name = 'flowers-heart-piece';
    this.brain.scale.multiplyScalar(0.4);
    for (let variant = 0; variant < 3; variant += 1) {
      const batch = this.jellyfishModels.createBatch(variant, JELLYFISH_POSITIONS.length / 3);
      batch.instanceMatrix.setUsage(DynamicDrawUsage);
      // This small, moving field stays visible throughout the event.
      batch.frustumCulled = false;
      this.jellyfish.push(batch);
      this.subject.add(batch);
    }
    JELLYFISH_POSITIONS.forEach(([x, y, z]) => {
      this.basePositions.push(new Vector3(
        x * JELLYFISH_SPREAD_X,
        y - 0.62,
        z * JELLYFISH_SPREAD_Z,
      ));
    });
    // Keep one small jellyfish within reach beside the boat.
    this.basePositions[0]!.set(2.8, -0.06, 0.55);
    this.subject.add(this.background.root);
    this.scoopTarget.name = 'flowers-scoop-target';
    this.subject.add(this.scoopTarget);
  }

  itemAimTarget(): Object3D | null {
    return super.itemAimTarget() === null ? null : this.scoopTarget;
  }

  protected reset(): void {
    this.caught = false;
    this.subject.add(this.brain);
    this.brain.visible = false;
    this.subject.position.set(0, 0, 0);
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'flowers.collect') {
      this.floatJellyfish(time);
      if (!this.caught) this.moveBrainToDeck(1);
      return;
    }
    this.floatJellyfish(time);
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    if (kind === 'reveal') {
      this.floatJellyfish(time);
    } else if (kind === 'flowers.collect') {
      this.floatJellyfish(time);
      if (!this.caught) this.moveBrainToDeck(eased);
    } else if (kind === 'flowers.drift') {
      this.subject.position.x = -eased * 1.4;
      this.subject.position.z = eased * 2.2;
      this.subject.position.y = -eased * 0.22;
      this.floatJellyfish(time);
    }
  }

  protected disposeOwned(): void {
    // Restore the brain from the collection tool before removing this presentation.
    this.subject.add(this.brain);
    this.jellyfish.forEach((batch) => batch.dispose());
    this.jellyfishModels.dispose();
    this.background.dispose();
  }

  private floatJellyfish(time: number): void {
    this.background.update(time);
    const amplitude = this.water.readAmplitudeScale();
    const jelly = this.instance;
    for (let index = 0; index < this.basePositions.length; index += 1) {
      const base = this.basePositions[index]!;
      this.water.sampleWaveInto(this.wave, time, base.x, base.z, amplitude);
      jelly.position.set(
        base.x,
        base.y + this.wave.height,
        base.z,
      );
      jelly.rotation.z = -this.wave.normal.x * 0.09;
      jelly.rotation.x = this.wave.normal.z * 0.09;
      jelly.rotation.y = ((index * 11) % 17) * 0.37;
      const pulse = 0.78 + Math.sin(time * 1.45 + base.x * 0.7 + base.z * 0.3) * 0.22;
      const size = index === 0 ? 0.2 : 0.76 + ((index * 7) % 9) * 0.045;
      jelly.scale.set(size * (0.94 + pulse * 0.06), size * (1.08 - pulse * 0.08), size);
      jelly.updateMatrix();
      this.jellyfish[index % 3]!.setMatrixAt(Math.floor(index / 3), jelly.matrix);
      if (index === 0) this.scoopTarget.position.copy(jelly.position);
    }
    for (const batch of this.jellyfish) batch.instanceMatrix.needsUpdate = true;
  }

  private captureInItem(item: Object3D, itemId: ItemId): void {
    if (this.caught) return;
    this.caught = true;
    item.add(this.brain);
    this.brain.position.set(...eventItemMotionProfile(itemId).actionOrigin);
    this.brain.position.y += 0.055;
    this.brain.rotation.set(0.15, -0.3, 0.1);
    this.brain.visible = true;
  }

  private releaseFromItem(): void {
    if (!this.caught) return;
    // The collected copy is now shown in the boat's basket.
    this.subject.add(this.brain);
    this.brain.visible = false;
  }

  private moveBrainToDeck(progress: number): void {
    const base = this.basePositions[0]!;
    this.deckTarget.getWorldPosition(this.target);
    this.root.worldToLocal(this.target);
    this.brain.visible = progress < 1;
    this.brain.rotation.set(0.15, -0.3, 0.1);
    this.brain.position.set(
      base.x + (this.target.x - base.x) * progress,
      base.y + (this.target.y - base.y) * progress + Math.sin(progress * Math.PI) * 0.5,
      base.z + (this.target.z - base.z) * progress,
    );
  }
}
