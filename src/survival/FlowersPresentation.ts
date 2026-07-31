import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import { disposeResourceSets } from '../world/SceneResources';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';

const PAD_POSITIONS = Object.freeze([
  [-3.0, 0.28, -4.0],
  [-1.35, 0.27, -4.7],
  [0.65, 0.29, -5.25],
  [2.75, 0.27, -5.8],
] as const);

export class FlowersPresentation extends KeyedEventPresentation {
  private readonly pads: Group[] = [];
  private readonly basePositions: Vector3[] = [];
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(models: SurvivalEventModels, private readonly deckTarget: Object3D) {
    super('flowers-presentation');
    const petalGeometry = new SphereGeometry(0.12, 6, 4);
    const petalMaterial = new MeshStandardMaterial({
      color: 0xd0c7aa,
      emissive: 0x252217,
      roughness: 0.96,
      flatShading: true,
    });
    this.geometries.add(petalGeometry);
    this.materials.add(petalMaterial);
    PAD_POSITIONS.forEach(([x, y, z], index) => {
      const pad = new Group();
      pad.name = `flowers:pad:${index}`;
      pad.add(models.clone('flowers'));
      pad.scale.setScalar(0.9 + index * 0.08);
      pad.rotation.y = index * 0.62;
      const flower = new Mesh(petalGeometry, petalMaterial);
      flower.name = `flowers:pale-bloom:${index}`;
      flower.position.set(0.05, 0.28, -0.02);
      flower.scale.set(1.3, 0.5, 1);
      pad.add(flower);
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
      this.floatPads(time, 0);
      this.moveFirstToDeck(1);
      return;
    }
    if (this.settledKind === 'flowers.drift') return;
    this.floatPads(time, 0);
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    if (kind === 'reveal') {
      this.floatPads(time, (1 - eased) * -1.4);
    } else if (kind === 'flowers.collect') {
      this.floatPads(time, 0);
      this.moveFirstToDeck(eased);
    } else if (kind === 'flowers.drift') {
      this.floatPads(time, eased * 2.2);
      this.subject.position.x = -eased * 1.4;
      this.subject.position.y = -eased * 0.22;
    }
  }

  protected finishAnimation(kind: string): void {
    if (kind === 'flowers.drift') this.root.visible = false;
  }

  protected disposeOwned(): void {
    disposeResourceSets(this.geometries, this.materials);
  }

  private floatPads(time: number, zOffset: number): void {
    for (let index = 0; index < this.pads.length; index += 1) {
      const pad = this.pads[index]!;
      const base = this.basePositions[index]!;
      sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time + index * 0.12, base.x, base.z + zOffset, 1);
      pad.position.set(
        base.x + this.wave.displacementX * 0.1,
        base.y + this.wave.height * 0.28,
        base.z + zOffset + this.wave.displacementZ * 0.1,
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
