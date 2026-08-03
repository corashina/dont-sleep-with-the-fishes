import {
  BufferGeometry,
  ConeGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import { disposeResourceSets } from '../world/SceneResources';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { StationaryEventCamera } from './StationaryEventCamera';

const BASE = Object.freeze({ x: -2.75, y: 0.38, z: -4.15 });

export class MysteryChestPresentation extends KeyedEventPresentation {
  private readonly lid: Object3D | null;
  private readonly teeth = new Group();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly target = new Vector3();
  private readonly cameraLook: StationaryEventCamera;
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(
    model: Object3D,
    private readonly deckTarget: Object3D,
    camera: PerspectiveCamera,
  ) {
    super('mystery-chest-presentation');
    this.cameraLook = new StationaryEventCamera(camera);
    this.subject.add(model);
    this.lid = model.getObjectByName('Chest_Top') ?? null;
    const toothGeometry = new ConeGeometry(0.055, 0.18, 5);
    const toothMaterial = new MeshStandardMaterial({
      color: 0xd1c49e,
      roughness: 0.92,
      flatShading: true,
    });
    this.geometries.add(toothGeometry);
    this.materials.add(toothMaterial);
    for (let index = 0; index < 7; index += 1) {
      const tooth = new Mesh(toothGeometry, toothMaterial);
      tooth.position.set((index - 3) * 0.12, 0.26, 0.36);
      tooth.rotation.x = Math.PI;
      this.teeth.add(tooth);
    }
    this.teeth.name = 'mystery-chest:teeth';
    this.teeth.visible = false;
    this.subject.add(this.teeth);
  }

  stage(): void {
    this.cameraLook.restore();
    this.cameraLook.capture();
    super.stage();
  }

  protected reset(): void {
    this.subject.position.set(BASE.x, BASE.y, BASE.z);
    this.subject.rotation.set(0, -0.14, 0);
    if (this.lid) this.lid.rotation.x = 0;
    this.teeth.visible = false;
    this.cameraLook.apply(0, 0);
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'mystery-chest.safe') {
      this.moveToDeck(1);
      if (this.lid) this.lid.rotation.x = -0.92;
      return;
    }
    if (this.settledKind === 'mystery-chest.mimic') {
      this.float(time, 0);
      this.teeth.visible = true;
      if (this.lid) this.lid.rotation.x = -1.15;
      return;
    }
    if (this.settledKind === 'mystery-chest.leave') return;
    this.float(time, 0);
  }

  protected prepareAnimation(kind: string): void {
    this.teeth.visible = kind === 'mystery-chest.mimic';
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    if (kind === 'reveal') {
      this.float(time, 0);
      this.subject.rotation.z += Math.sin(progress * Math.PI * 4)
        * (1 - progress) * 0.06;
      return;
    }
    if (kind === 'mystery-chest.safe') {
      this.moveToDeck(eased);
      if (this.lid) this.lid.rotation.x = -0.92 * eased;
    } else if (kind === 'mystery-chest.mimic') {
      this.float(time, 0);
      const snap = Math.sin(Math.min(1, progress * 2.4) * Math.PI);
      if (this.lid) this.lid.rotation.x = -1.15 * Math.min(1, progress * 3);
      this.subject.position.y += snap * 0.22;
      const kick = Math.sin(progress * Math.PI * 10) * (1 - progress);
      this.cameraLook.apply(0, kick * -0.045);
    } else if (kind === 'mystery-chest.leave') {
      this.float(time, 0);
      this.subject.position.y -= eased * 1.2;
      this.subject.rotation.z -= eased * 0.24;
    }
  }

  protected finishAnimation(kind: string): void {
    this.cameraLook.apply(0, 0);
    if (kind === 'mystery-chest.leave') this.root.visible = false;
  }

  protected disposeOwned(): void {
    this.cameraLook.restore();
    disposeResourceSets(this.geometries, this.materials);
  }

  clear(): void {
    super.clear();
    this.cameraLook.restore();
  }

  private float(time: number, zOffset: number): void {
    sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time, BASE.x, BASE.z + zOffset, 1);
    this.subject.position.set(
      BASE.x + this.wave.displacementX * 0.1,
      BASE.y + this.wave.height * 0.3,
      BASE.z + zOffset + this.wave.displacementZ * 0.1,
    );
    this.subject.rotation.set(
      this.wave.normal.z * 0.12,
      -0.14,
      -this.wave.normal.x * 0.12,
    );
  }

  private moveToDeck(progress: number): void {
    this.deckTarget.getWorldPosition(this.target);
    this.root.worldToLocal(this.target);
    this.subject.position.set(
      BASE.x + (this.target.x - BASE.x) * progress,
      BASE.y + (this.target.y - BASE.y) * progress,
      BASE.z + (this.target.z - BASE.z) * progress,
    );
    this.subject.rotation.set(0, -0.14, 0);
  }
}
