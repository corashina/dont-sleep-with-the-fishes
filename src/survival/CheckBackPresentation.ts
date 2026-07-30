import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
} from 'three';
import { disposeResourceSets } from '../world/SceneResources';
import { KeyedEventPresentation } from './KeyedEventPresentation';

export class CheckBackPresentation extends KeyedEventPresentation {
  private static readonly REVEAL_TURN = Math.PI * 0.78;
  private readonly fish: Object3D;
  private readonly wake: Mesh;
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();

  constructor(fish: Object3D, private readonly cameraRig: Group) {
    super('check-back-presentation');
    this.fish = fish;
    this.fish.name = 'check-back:fish';
    const wakeGeometry = new TorusGeometry(0.72, 0.035, 5, 18, Math.PI * 1.55);
    const wakeMaterial = new MeshStandardMaterial({
      color: 0x9bb3b5,
      emissive: 0x58777a,
      emissiveIntensity: 1.15,
      transparent: true,
      opacity: 0.72,
      roughness: 0.5,
      flatShading: true,
    });
    this.geometries.add(wakeGeometry);
    this.materials.add(wakeMaterial);
    this.wake = new Mesh(wakeGeometry, wakeMaterial);
    this.wake.name = 'check-back:wake';
    this.wake.rotation.x = Math.PI / 2;
    this.subject.add(this.fish, this.wake);
  }

  protected reset(): void {
    this.subject.position.set(0, 0.55, 5.5);
    this.subject.rotation.set(0, 0, 0);
    this.fish.position.set(0, 0.28, 0);
    this.fish.rotation.set(0, 0, 0);
    this.fish.scale.setScalar(1);
    this.fish.visible = false;
    this.wake.visible = true;
    this.cameraRig.rotation.set(0, 0, 0);
  }

  protected applyIdle(_time: number): void {
    if (this.settledKind === 'check-the-back.fish') {
      this.cameraRig.rotation.y = Math.PI;
      this.fish.visible = true;
      this.fish.rotation.z = -0.12;
    } else if (this.settledKind === 'check-the-back.face') {
      this.cameraRig.rotation.y = Math.PI;
      this.showFace();
    } else if (this.settledKind === 'check-the-back.empty') {
      this.cameraRig.rotation.y = Math.PI;
      this.fish.visible = false;
    } else if (this.settledKind === 'check-the-back.ignore') {
      this.cameraRig.rotation.y = 0;
    }
  }

  protected prepareAnimation(kind: string): void {
    this.fish.visible = kind === 'check-the-back.fish' || kind === 'check-the-back.face';
    if (kind === 'check-the-back.face') this.showFace();
  }

  protected applyAnimation(kind: string, _time: number, progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);
    if (kind === 'reveal') {
      this.cameraRig.rotation.y = eased * CheckBackPresentation.REVEAL_TURN;
      this.wake.rotation.z = Math.sin(progress * Math.PI * 2) * 0.08;
      return;
    }
    if (kind === 'check-the-back.ignore') {
      this.cameraRig.rotation.y = (1 - eased) * CheckBackPresentation.REVEAL_TURN;
      return;
    }
    this.cameraRig.rotation.y = CheckBackPresentation.REVEAL_TURN
      + eased * (Math.PI - CheckBackPresentation.REVEAL_TURN);
    if (kind === 'check-the-back.fish') {
      this.fish.rotation.z = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.7;
      this.fish.position.y = 0.28 + Math.sin(progress * Math.PI) * 0.26;
    } else if (kind === 'check-the-back.empty') {
      this.fish.visible = false;
      this.wake.scale.setScalar(1 + eased * 0.45);
    } else if (kind === 'check-the-back.face') {
      this.showFace();
      this.fish.position.z = eased * -0.18;
    }
  }

  protected disposeOwned(): void {
    this.cameraRig.rotation.set(0, 0, 0);
    disposeResourceSets(this.geometries, this.materials);
  }

  clear(): void {
    super.clear();
    this.cameraRig.rotation.set(0, 0, 0);
  }

  private showFace(): void {
    this.fish.visible = true;
    this.fish.rotation.set(0, Math.PI / 2, Math.PI / 2);
    this.fish.scale.setScalar(1.35);
    this.fish.position.y = 0.6;
  }
}
