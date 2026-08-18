import {
  BufferGeometry,
  CylinderGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import {
  type WaveSample,
} from '../ocean/WaveField';
import { disposeResourceSets } from '../world/SceneResources';
import {
  applyDriftingWavePose,
  type DriftingWater,
} from './DriftingWaveMotion';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { eventSideFromSeed, type EventSide } from './eventVariant';

const BASE = Object.freeze({ x: 3.25, y: 0.14, z: -4.35 });

export class DriftingBottlePresentation extends KeyedEventPresentation {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly paper: Mesh;
  private readonly baseQuaternion = new Quaternion();
  private readonly basePosition = new Vector3();
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private side: EventSide = -1;

  constructor(
    model: Object3D,
    private readonly bowTarget: Object3D,
    private readonly water: DriftingWater,
  ) {
    super('drifting-bottle-presentation');
    this.subject.name = 'event-prop:drifting-bottle';
    this.subject.userData.motionSource = 'shared-wave-field';
    this.subject.userData.waterlineY = 0;
    this.subject.add(model);
    const corkGeometry = new CylinderGeometry(0.045, 0.045, 0.1, 7);
    const paperGeometry = new CylinderGeometry(0.055, 0.055, 0.32, 7);
    const corkMaterial = new MeshStandardMaterial({
      color: 0x7b5b38,
      roughness: 0.96,
      flatShading: true,
    });
    const paperMaterial = new MeshStandardMaterial({
      color: 0xc4b58e,
      roughness: 0.98,
      flatShading: true,
    });
    this.geometries.add(corkGeometry);
    this.geometries.add(paperGeometry);
    this.materials.add(corkMaterial);
    this.materials.add(paperMaterial);
    const cork = new Mesh(corkGeometry, corkMaterial);
    cork.name = 'drifting-bottle:cork';
    cork.position.y = 0.38;
    this.paper = new Mesh(paperGeometry, paperMaterial);
    this.paper.name = 'drifting-bottle:paper';
    this.paper.visible = true;
    this.subject.scale.setScalar(1.22);
    this.subject.add(cork, this.paper);
  }

  stage(variantSeed = 0): void {
    this.side = eventSideFromSeed(variantSeed);
    super.stage();
  }

  reveal(): Promise<void> {
    return Promise.resolve();
  }

  protected reset(): void {
    const baseX = BASE.x * this.side;
    this.basePosition.set(baseX, BASE.y, BASE.z);
    this.subject.position.copy(this.basePosition);
    this.subject.rotation.set(0.06, -0.18 * this.side, 0.08 * this.side);
    this.baseQuaternion.copy(this.subject.quaternion);
    this.paper.visible = false;
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'drifting-bottle.retrieve') {
      this.moveToDeck(1);
      this.paper.visible = true;
      return;
    }
    if (this.settledKind === 'drifting-bottle.lost') return;
    this.float(time);
  }

  protected prepareAnimation(kind: string): void {
    if (kind === 'drifting-bottle.retrieve') this.paper.visible = true;
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    if (kind === 'drifting-bottle.retrieve') {
      this.moveToDeck(progress * progress * (3 - 2 * progress));
      this.subject.rotation.z = 0.08 * this.side + progress * 0.38 * this.side;
      return;
    }
    if (kind === 'drifting-bottle.lost') {
      this.float(time);
      this.subject.position.x += this.side * progress * 2.1;
      this.subject.position.z += progress * 1.5;
      this.subject.position.y -= progress * 0.3;
    }
  }

  protected finishAnimation(kind: string): void {
    if (kind === 'drifting-bottle.lost') this.root.visible = false;
  }

  protected disposeOwned(): void {
    disposeResourceSets(this.geometries, this.materials);
  }

  private float(time: number): void {
    applyDriftingWavePose(
      this.subject,
      this.basePosition,
      this.baseQuaternion,
      this.wave,
      time,
      this.water,
    );
  }

  private moveToDeck(progress: number): void {
    const baseX = BASE.x * this.side;
    this.bowTarget.getWorldPosition(this.target);
    this.root.worldToLocal(this.target);
    this.subject.position.set(
      baseX + (this.target.x - baseX) * progress,
      BASE.y + (this.target.y - BASE.y) * progress,
      BASE.z + (this.target.z - BASE.z) * progress,
    );
  }
}
