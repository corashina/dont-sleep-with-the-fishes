import {
  BufferGeometry,
  CylinderGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import { disposeResourceSets } from '../world/SceneResources';
import { KeyedEventPresentation } from './KeyedEventPresentation';

const BASE = Object.freeze({ x: -2.15, y: 0.34, z: -4.35 });

export class DriftingBottlePresentation extends KeyedEventPresentation {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly paper: Mesh;
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };

  constructor(model: Object3D, private readonly deckTarget: Object3D) {
    super('drifting-bottle-presentation');
    this.subject.name = 'event-prop:drifting-bottle';
    this.subject.add(model);
    const corkGeometry = new CylinderGeometry(0.045, 0.045, 0.1, 7);
    const paperGeometry = new CylinderGeometry(0.055, 0.055, 0.32, 7);
    const wakeGeometry = new TorusGeometry(0.4, 0.025, 5, 18);
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
    const wakeMaterial = new MeshStandardMaterial({
      color: 0x9bb3b2,
      emissive: 0x587776,
      emissiveIntensity: 1.2,
      roughness: 0.54,
      transparent: true,
      opacity: 0.76,
      flatShading: true,
    });
    this.geometries.add(corkGeometry);
    this.geometries.add(paperGeometry);
    this.geometries.add(wakeGeometry);
    this.materials.add(corkMaterial);
    this.materials.add(paperMaterial);
    this.materials.add(wakeMaterial);
    const cork = new Mesh(corkGeometry, corkMaterial);
    cork.name = 'drifting-bottle:cork';
    cork.position.z = 0.38;
    cork.rotation.x = Math.PI / 2;
    this.paper = new Mesh(paperGeometry, paperMaterial);
    this.paper.name = 'drifting-bottle:paper';
    this.paper.rotation.x = Math.PI / 2;
    this.paper.visible = true;
    const wake = new Mesh(wakeGeometry, wakeMaterial);
    wake.name = 'drifting-bottle:wake';
    wake.position.y = -0.23;
    wake.rotation.x = Math.PI / 2;
    this.subject.scale.setScalar(1.22);
    this.subject.add(cork, this.paper, wake);
  }

  protected reset(): void {
    this.subject.position.set(BASE.x, BASE.y, BASE.z);
    this.subject.rotation.set(0.08, -0.18, 0.06);
    this.paper.visible = false;
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'drifting-bottle.retrieve') {
      this.moveToDeck(1);
      this.paper.visible = true;
      return;
    }
    if (this.settledKind === 'drifting-bottle.lost') return;
    this.float(time, 0);
  }

  protected prepareAnimation(kind: string): void {
    if (kind === 'drifting-bottle.retrieve') this.paper.visible = true;
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    if (kind === 'reveal') {
      const approach = (1 - progress) * -0.9;
      const knock = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.12;
      this.float(time, approach);
      this.subject.position.x += knock;
      this.subject.rotation.z = 0.06 + knock * 0.5;
      return;
    }
    if (kind === 'drifting-bottle.retrieve') {
      this.moveToDeck(progress * progress * (3 - 2 * progress));
      this.subject.rotation.z = 0.06 + progress * 0.38;
      return;
    }
    if (kind === 'drifting-bottle.lost') {
      this.float(time, 0);
      this.subject.position.x -= progress * 2.1;
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

  private float(time: number, zOffset: number): void {
    sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time, BASE.x, BASE.z + zOffset, 1);
    this.subject.position.set(
      BASE.x + this.wave.displacementX * 0.12,
      BASE.y + this.wave.height * 0.34,
      BASE.z + zOffset + this.wave.displacementZ * 0.12,
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
  }
}
